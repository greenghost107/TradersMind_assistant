import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import express, { Request, Response } from 'express';
import { ENV, getBotConfig, ModeManager, BotMode } from './config';
import { BotConfig } from './types';
import { ChannelScanner } from './services/ChannelScanner';
import { SymbolDetector } from './services/SymbolDetector';
import { AnalysisLinker } from './services/AnalysisLinker';
import { DatabaseService } from './services/DatabaseService';
import { DatabaseAnalysisLinker } from './services/DatabaseAnalysisLinker';
import { DatabaseMigration } from './services/DatabaseMigration';
import { LocalDatabaseService } from './services/LocalDatabaseService';
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
  private databaseService: DatabaseService | LocalDatabaseService | undefined;
  private databaseAnalysisLinker: DatabaseAnalysisLinker | undefined;
  private databaseMigration: DatabaseMigration | undefined;
  private modeManager: ModeManager;
  private currentMode: BotMode;
  private messageRetention: MessageRetention;
  private ephemeralHandler: EphemeralHandler;
  private historicalScraper: HistoricalScraper;
  private commands: Collection<string, any>;
  private isInitialized: boolean = false;
  private httpServer: any = null;

  constructor() {
    // Initialize mode manager first
    this.modeManager = ModeManager.getInstance();
    this.currentMode = this.modeManager.getMode();
    
    // Configure logging based on mode
    Logger.setLevelFromMode(this.currentMode);
    
    // Log mode information
    const modeInfo = this.modeManager.getModeInfo();
    Logger.info(`🎯 Bot starting in ${this.currentMode.toUpperCase()} mode`);
    Logger.debug(`Mode config:`, modeInfo.config);
    
    // Validate environment for current mode
    const validation = this.modeManager.validateEnvironment();
    if (!validation.valid) {
      Logger.error(`❌ Environment validation failed for ${this.currentMode} mode:`);
      validation.errors.forEach(error => Logger.error(`  - ${error}`));
      
      if (this.modeManager.isProductionMode()) {
        throw new Error('Production mode requires valid environment configuration');
      }
    }

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
    
    // Initialize database services based on mode
    this.initializeDatabaseServices();
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

  private initializeDatabaseServices(): void {
    const databaseType = this.modeManager.getDatabaseType();
    
    switch (databaseType) {
      case 'postgresql':
        const databaseUrl = process.env.DATABASE_URL;
        if (databaseUrl) {
          this.databaseService = new DatabaseService(databaseUrl);
          this.databaseAnalysisLinker = new DatabaseAnalysisLinker(this.databaseService as DatabaseService);
          this.databaseMigration = new DatabaseMigration(this.databaseService as DatabaseService);
          Logger.info('PostgreSQL database mode initialized');
        } else {
          Logger.warn('DATABASE_URL not found for PostgreSQL mode, falling back to memory');
        }
        break;
        
      case 'sqlite':
        const sqlitePath = this.modeManager.getSqlitePath();
        this.databaseService = new LocalDatabaseService(sqlitePath);
        // Create a compatible DatabaseAnalysisLinker for SQLite
        this.databaseAnalysisLinker = new DatabaseAnalysisLinker(this.databaseService as any);
        Logger.info(`SQLite database mode initialized: ${sqlitePath}`);
        break;
        
      case 'memory':
      default:
        Logger.info('Memory-only mode initialized');
        break;
    }
  }

  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, async () => {
      Logger.botStartup(`${this.client.user?.tag} is online and ready!`);
      
      if (this.config) {
        Logger.info(`Monitoring channels: Analysis=[${this.config.analysisChannels.join(', ')}], General=${this.config.generalNoticesChannel}`);
        
        await this.initializeBot();
        
        // Initialize database connection if using database mode
        if (this.databaseService && this.modeManager.getDatabaseType() !== 'memory') {
          await this.initializeDatabaseConnection();
        }
        this.startBackgroundServices();
      } else {
        Logger.warn('Bot is not configured. Please set the required environment variables.');
      }
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot || !this.config || !this.isInitialized) return;

      await this.channelScanner.handleMessage(message, this.config);
      
      if (this.config.analysisChannels.includes(message.channel.id)) {
        if (this.databaseAnalysisLinker && this.modeManager.getDatabaseType() !== 'memory') {
          await this.databaseAnalysisLinker.indexMessage(message);
        } else {
          await this.analysisLinker.indexMessage(message);
        }
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

  private async initializeDatabaseConnection(): Promise<void> {
    try {
      Logger.info('Connecting to database...');
      
      if (!this.databaseService) {
        throw new Error('Database service not initialized');
      }
      
      // Connect to database
      await this.databaseService.connect();
      
      // Initialize database analysis linker if it exists
      if (this.databaseAnalysisLinker) {
        await this.databaseAnalysisLinker.initialize();
        
        // For PostgreSQL mode, check if migration is needed
        if (this.modeManager.getDatabaseType() === 'postgresql' && this.databaseMigration) {
          const memoryStats = this.analysisLinker.getCacheStats();
          const dbStats = await this.databaseAnalysisLinker.getCacheStats();
          
          if (memoryStats.totalSymbols > 0 && dbStats.totalSymbols === 0) {
            Logger.info(`Found ${memoryStats.totalSymbols} symbols in memory, migrating to database...`);
            await this.databaseMigration.migrateFromMemoryToDatabase(this.analysisLinker);
            
            // Verify migration
            const verification = await this.databaseMigration.verifyMigration();
            if (verification.success) {
              Logger.info(`✅ Migration successful: ${verification.symbolCount} symbols, ${verification.users} users`);
            } else {
              Logger.error('❌ Migration verification failed');
            }
          }
        }
      }
      
      Logger.info(`✅ Database connection established (${this.modeManager.getDatabaseType()})`);
    } catch (error) {
      Logger.error('Failed to connect to database:', error);
      
      if (this.modeManager.isProductionMode()) {
        throw error; // Fail hard in production mode
      } else {
        Logger.warn('Falling back to memory mode');
      }
    }
  }

  private async getTrackedSymbolsCount(): Promise<number> {
    try {
      if (this.databaseAnalysisLinker && this.modeManager.getDatabaseType() !== 'memory') {
        return await this.databaseAnalysisLinker.getTrackedSymbolsCount();
      } else {
        return this.analysisLinker.getTrackedSymbolsCount();
      }
    } catch (error) {
      Logger.error('Failed to get tracked symbols count:', error);
      return 0;
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
    const port = this.modeManager.getHealthPort();

    app.get('/health', async (req: Request, res: Response) => {
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
        symbolsTracked: await this.getTrackedSymbolsCount(),
        mode: this.currentMode,
        databaseType: this.modeManager.getDatabaseType(),
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
      const cleanupPromises = [
        this.messageRetention.performFinalCleanup(),
        Promise.resolve(this.ephemeralHandler.performFinalCleanup())
      ];
      
      if (this.databaseService && this.modeManager.getDatabaseType() !== 'memory') {
        Logger.info('Closing database connection...');
        cleanupPromises.push(this.databaseService.close());
      }
      
      const cleanupPromise = Promise.all(cleanupPromises);
      
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
    // Check if Discord token is required for current mode
    const validation = this.modeManager.validateEnvironment();
    if (!validation.valid && this.modeManager.isProductionMode()) {
      Logger.error('Production mode validation failed:', validation.errors);
      throw new Error('Production mode requires valid environment configuration');
    }

    // For local mode, we might skip Discord connection if configured
    if (this.modeManager.isLocalMode() && process.env.SKIP_DISCORD === 'true') {
      Logger.info('🏠 Local mode: Skipping Discord connection (SKIP_DISCORD=true)');
      Logger.info('🌐 Starting local health server only...');
      this.startHealthCheckServer();
      return;
    }

    if (!ENV.DISCORD_TOKEN) {
      if (this.modeManager.isLocalMode()) {
        Logger.warn('⚠️ DISCORD_TOKEN not found. Set SKIP_DISCORD=true to run without Discord in local mode.');
      }
      throw new Error('DISCORD_TOKEN is required in environment variables');
    }

    try {
      await this.loadCommands();
      await this.client.login(ENV.DISCORD_TOKEN);
    } catch (error) {
      Logger.error('Failed to start bot:', error);
      if (this.modeManager.isLocalMode()) {
        Logger.warn('💡 Tip: Set SKIP_DISCORD=true to run local mode without Discord');
      }
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