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
import { Logger } from './utils/Logger';

class TradersMindBot {
  private client: Client;
  private config: BotConfig | null;
  private channelScanner: ChannelScanner;
  private symbolDetector: SymbolDetector;
  private analysisLinker: AnalysisLinker;
  private messageRetention: MessageRetention;
  private ephemeralHandler: EphemeralHandler;
  private historicalScraper: HistoricalScraper;
  private commands: Collection<string, any>;
  private isInitialized: boolean = false;
  private httpServer: any = null;

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
    this.symbolDetector = new SymbolDetector();
    this.analysisLinker = new AnalysisLinker();
    this.messageRetention = new MessageRetention();
    this.ephemeralHandler = new EphemeralHandler(this.analysisLinker, this.messageRetention);
    this.historicalScraper = new HistoricalScraper();
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
        Logger.info(`Monitoring channels: Analysis=[${this.config.analysisChannels.join(', ')}], General=${this.config.generalNoticesChannel}`);
        
        await this.initializeBot();
        this.startBackgroundServices();
      } else {
        Logger.warn('Bot is not configured. Please set the required environment variables.');
      }
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot || !this.config || !this.isInitialized) return;

      await this.channelScanner.handleMessage(message, this.config);
      
      if (this.config.analysisChannels.includes(message.channel.id)) {
        await this.analysisLinker.indexMessage(message);
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

    this.client.on(Events.Error, (error) => {
      Logger.error('Discord client error:', error);
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

  private startHealthCheckServer(): void {
    const app = express();
    const port = process.env.PORT || 10000;

    app.get('/health', (req: Request, res: Response) => {
      const stats = this.messageRetention.getRetentionStats();
      res.json({
        status: 'healthy',
        bot: {
          connected: this.client.isReady(),
          initialized: this.isInitialized,
          user: this.client.user?.tag || 'Not connected'
        },
        config: this.config ? {
          analysisChannels: this.config.analysisChannels.length,
          generalChannel: !!this.config.generalNoticesChannel,
          retentionHours: this.config.retentionHours
        } : null,
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