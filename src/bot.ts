import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import express, { Request, Response } from 'express';
import { ENV, getBotConfig } from './config';
import { BotConfig } from './types';
import { ChannelScanner } from './services/ChannelScanner';
import { SymbolDetector } from './services/SymbolDetector';
import { AnalysisLinker } from './services/AnalysisLinker';
import { MessageRetention } from './services/MessageRetention';
import { EphemeralHandler } from './services/EphemeralHandler';
import { HistoricalScraper } from './services/HistoricalScraper';
import { PermissionDiagnostic, DiagnosticReport } from './services/PermissionDiagnostic';
import { DiscussionChannelHandler } from './services/DiscussionChannelHandler';
import { Logger } from './utils/Logger';
import { ThreadManager } from './services/ThreadManager';
import { HebrewUpdateDetector } from './services/HebrewUpdateDetector';
import { WordFrequencyAnalyzer } from './services/WordFrequencyAnalyzer';

class TradersMindBot {
  private client: Client;
  private config: BotConfig | null;
  private channelScanner: ChannelScanner;
  private symbolDetector: SymbolDetector;
  private analysisLinker: AnalysisLinker;
  private messageRetention: MessageRetention;
  private ephemeralHandler: EphemeralHandler;
  private historicalScraper: HistoricalScraper;
  private permissionDiagnostic: PermissionDiagnostic;
  private threadManager: ThreadManager;
  private discussionChannelHandler: DiscussionChannelHandler;
  private hebrewUpdateDetector: HebrewUpdateDetector;
  private wordFrequencyAnalyzer: WordFrequencyAnalyzer;
  private commands: Collection<string, any>;
  private isInitialized: boolean = false;
  private httpServer: any = null;
  private latestPermissionReport: DiagnosticReport | null = null;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
      ]
    });

    this.commands = new Collection();
    this.config = getBotConfig();
    
    if (!this.config) {
      throw new Error('Failed to load bot configuration. Please check your environment variables.');
    }
    
    this.symbolDetector = new SymbolDetector();
    this.analysisLinker = new AnalysisLinker();
    this.messageRetention = new MessageRetention();
    this.ephemeralHandler = new EphemeralHandler(this.analysisLinker, this.messageRetention);
    this.historicalScraper = new HistoricalScraper(this.config);
    this.permissionDiagnostic = new PermissionDiagnostic();
    this.threadManager = new ThreadManager(this.config.analysisChannels);
    this.discussionChannelHandler = new DiscussionChannelHandler();
    this.hebrewUpdateDetector = new HebrewUpdateDetector();
    this.wordFrequencyAnalyzer = new WordFrequencyAnalyzer();
    this.channelScanner = new ChannelScanner(
      this.symbolDetector, 
      this.ephemeralHandler,
      this.analysisLinker
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, async () => {
      Logger.botStartup(`${this.client.user?.tag} is online and ready!`);
      
      if (this.config) {
        const discussionInfo = this.config.discussionChannels.length > 0 
          ? `, Discussion=[${this.config.discussionChannels.join(', ')}]`
          : '';
        const managerInfo = this.config.managerId
          ? `, ManagerID=${this.config.managerId}`
          : '';
        
        Logger.info(`Monitoring channels: Analysis=[${this.config.analysisChannels.join(', ')}], General=${this.config.generalNoticesChannel}${discussionInfo}${managerInfo}`);
        
        // Run permission diagnostics before initialization (non-blocking)
        this.latestPermissionReport = await this.permissionDiagnostic.runStartupDiagnostics(this.client, this.config);
        
        await this.initializeBot();
        this.startBackgroundServices();
        
        // Start word frequency analysis if active
        if (this.wordFrequencyAnalyzer.isActive()) {
          Logger.info('Word frequency analyzer is active - starting historical scan...');
          await this.wordFrequencyAnalyzer.scanHistoricalMessages(this.client, this.config);
        }
      } else {
        Logger.warn('Bot is not configured. Please set the required environment variables.');
      }
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot || !this.config || !this.isInitialized) return;

      // Enhanced logging for message processing
      Logger.debug(`Bot: Processing message ${message.id} in channel ${message.channel.id} from ${message.author.tag}`);

      // Skip thread messages - threads should never be processed by any service
      const isFromThread = await this.threadManager.isMessageFromThread(this.client, message);
      if (isFromThread) {
        Logger.debug(`Bot: Thread message ${message.id} was blocked from all processing`);
        return;
      }

      Logger.debug(`Bot: Message ${message.id} passed thread check, proceeding with processing`);

      // Check for Hebrew daily update and trigger cleanup if detected
      if (message.channelId === this.config.generalNoticesChannel) {
        if (this.hebrewUpdateDetector.isHebrewDailyUpdate(message.content)) {
          Logger.info(`🔄 Hebrew daily update detected, performing immediate cleanup before processing new buttons`);
          await this.messageRetention.performImmediateCleanup();
        }
      }

      // Handle general notices channel (existing functionality)
      await this.channelScanner.handleMessage(message, this.config);
      
      // Handle all configured channels - only process manager messages
      const isAnalysisChannel = this.config.analysisChannels.includes(message.channel.id);
      const isDiscussionChannel = this.config.discussionChannels.includes(message.channel.id);
      
      if (isAnalysisChannel || isDiscussionChannel) {
        if (this.discussionChannelHandler.isManagerMessage(message, this.config)) {
          const channelType = isAnalysisChannel ? 'analysis' : 'discussion';
          Logger.info(`📊 Processing ${channelType} channel message from manager ${message.member?.displayName || message.author.tag}`);
          await this.analysisLinker.indexMessage(message);
          
          // Process message for word frequency analysis if active
          await this.wordFrequencyAnalyzer.processMessage(message, this.config);
        } else {
          const channelType = isAnalysisChannel ? 'analysis' : 'discussion';
          Logger.debug(`Bot: Skipping ${channelType} channel message ${message.id} from non-manager ${message.author.tag}`);
        }
      } else {
        Logger.debug(`Bot: Message ${message.id} is NOT in configured channels`);
      }
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isButton()) {
        await this.ephemeralHandler.handleButtonInteraction(interaction);
      } else if (interaction.isChatInputCommand()) {
        const command = this.commands.get(interaction.commandName);
        if (command) {
          try {
            await command.execute(interaction);
          } catch (error) {
            Logger.error('Command execution error:', error);
            const reply = { content: 'An error occurred while executing this command.', ephemeral: true };
            
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp(reply);
            } else {
              await interaction.reply(reply);
            }
          }
        }
      }
    });

    this.client.on(Events.Error, async (error) => {
      Logger.error('Discord client error:', error);
      
      // Check if this is a permission-related error and re-run diagnostics
      if (this.isPermissionError(error) && this.config) {
        Logger.warn('Permission-related Discord error detected - running permission diagnostics...');
        await this.handlePermissionError();
      }
    });

    process.on('SIGINT', () => {
      Logger.info('Shutting down bot...');
      this.shutdown();
    });

    process.on('SIGTERM', () => {
      Logger.info('Shutting down bot...');
      this.shutdown();
    });
  }

  private async initializeBot(): Promise<void> {
    try {
      Logger.info('Initializing bot with historical data...');
      
      const historicalData = await this.historicalScraper.scrapeHistoricalAnalysis(
        this.client,
        this.config!
      );
      
      this.analysisLinker.initializeFromHistoricalData(historicalData);
      this.isInitialized = true;
      
      Logger.info('Bot initialization complete! Ready to process messages.');
    } catch (error) {
      Logger.error('Error during bot initialization:', error);
      Logger.warn('Bot will continue without historical data.');
      this.isInitialized = true;
    }
  }

  private startBackgroundServices(): void {
    this.messageRetention.initialize(this.client, this.config!);
    this.messageRetention.startCleanupScheduler();
    
    MessageRetention.setInstance(this.messageRetention);
    
    this.startHealthCheckServer();
    
    Logger.info('Background services started');
  }

  private async handlePermissionError(): Promise<void> {
    try {
      if (!this.config) return;
      
      Logger.info('🔍 Running permission diagnostics due to detected permission error...');
      const newReport = await this.permissionDiagnostic.runStartupDiagnostics(this.client, this.config);
      
      if (newReport && this.latestPermissionReport) {
        const changes = await this.permissionDiagnostic.detectPermissionChanges(newReport, this.latestPermissionReport);
        if (changes.length > 0) {
          Logger.warn('📊 Permission changes detected:');
          changes.forEach(change => Logger.warn(`  • ${change}`));
        } else {
          Logger.info('No permission changes detected - error may be transient');
        }
      }
      
      this.latestPermissionReport = newReport;
    } catch (error) {
      Logger.error('Error during permission diagnostics:', error);
    }
  }

  private isPermissionError(error: any): boolean {
    if (!error || typeof error !== 'object') return false;
    
    // Discord API error codes related to permissions
    const permissionErrorCodes = [
      50001, // Missing Access
      50013, // Missing Permissions
      50021, // Cannot execute action on a system message
      10003, // Unknown Channel (could indicate permission issue)
      10008, // Unknown Message (could indicate permission issue)
    ];
    
    // Check for Discord API error codes
    if (error.code && permissionErrorCodes.includes(error.code)) {
      return true;
    }
    
    // Check for error messages that indicate permission issues
    const permissionErrorMessages = [
      'missing permissions',
      'missing access', 
      'insufficient permissions',
      'permission denied',
      'forbidden',
      'cannot send messages',
      'cannot read message history',
      'cannot use external emojis'
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
    return permissionErrorMessages.some(msg => errorMessage.includes(msg));
  }

  private startHealthCheckServer(): void {
    const app = express();
    const port = process.env.PORT || 10000;

    app.get('/health', (req: Request, res: Response) => {
      const stats = this.messageRetention.getRetentionStats();
      const permissionStatus = this.latestPermissionReport ? {
        status: this.latestPermissionReport.overallStatus,
        lastChecked: this.latestPermissionReport.timestamp,
        accessibleChannels: this.latestPermissionReport.summary.accessibleChannels,
        totalChannels: this.latestPermissionReport.summary.totalChannels,
        criticalIssues: this.latestPermissionReport.summary.criticalIssues.length,
        warnings: this.latestPermissionReport.summary.warnings.length
      } : null;
      
      res.json({
        status: 'healthy',
        bot: {
          connected: this.client.isReady(),
          initialized: this.isInitialized,
          user: this.client.user?.tag || 'Not connected'
        },
        config: this.config ? {
          analysisChannels: this.config.analysisChannels.length,
          generalChannel: !!this.config.generalNoticesChannel
        } : null,
        permissions: permissionStatus,
        retention: stats,
        symbolsTracked: this.analysisLinker.getTrackedSymbolsCount(),
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      });
    });

    app.get('/', (req: Request, res: Response) => {
      res.json({ 
        service: 'TradersMind Discord Bot',
        status: 'running',
        version: '1.0.0'
      });
    });

    this.httpServer = app.listen(port, () => {
      Logger.info(`Health check server started on port ${port}`);
    });
  }

  private async shutdown(): Promise<void> {
    Logger.info('Initiating graceful shutdown...');
    
    try {
      Logger.info('Stopping HTTP server...');
      if (this.httpServer) {
        this.httpServer.close();
        this.httpServer = null;
      }
      
      Logger.info('Stopping background schedulers...');
      this.messageRetention.stopCleanupScheduler();
      
      Logger.info('Performing final cleanup...');
      const cleanupPromise = Promise.all([
        this.messageRetention.performFinalCleanup(),
        Promise.resolve(this.ephemeralHandler.performFinalCleanup())
      ]);
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Cleanup timeout')), 5000);
      });
      
      await Promise.race([cleanupPromise, timeoutPromise]);
      
      Logger.info('Graceful shutdown complete');
      
    } catch (error) {
      Logger.error('Error during graceful shutdown:', error);
      Logger.info('Proceeding with forced shutdown...');
    }
    
    await this.client.destroy();
    Logger.info('Bot shutdown complete');
    process.exit(0);
  }

  public async start(): Promise<void> {
    if (!ENV.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN is required in environment variables');
    }

    try {
      await this.loadCommands();
      await this.client.login(ENV.DISCORD_TOKEN);
    } catch (error) {
      Logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  private async loadCommands(): Promise<void> {
    const statusCommand = await import('./commands/status');
    this.commands.set('status', statusCommand);
    Logger.info('Commands loaded');
  }
}

const bot = new TradersMindBot();
bot.start().catch(console.error);