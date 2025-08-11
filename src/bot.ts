import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { ENV, getBotConfig } from './config';
import { BotConfig } from './types';
import { ChannelScanner } from './services/ChannelScanner';
import { SymbolDetector } from './services/SymbolDetector';
import { AnalysisLinker } from './services/AnalysisLinker';
import { MessageRetention } from './services/MessageRetention';
import { EphemeralHandler } from './services/EphemeralHandler';
import { HistoricalScraper } from './services/HistoricalScraper';

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
      this.ephemeralHandler
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, async () => {
      console.log(`✅ ${this.client.user?.tag} is online and ready!`);
      
      if (this.config) {
        console.log(`📊 Monitoring channels:`);
        console.log(`   Analysis 1: ${this.config.analysisChannels[0]}`);
        console.log(`   Analysis 2: ${this.config.analysisChannels[1]}`);
        console.log(`   General: ${this.config.generalNoticesChannel}`);
        
        await this.initializeBot();
        this.startBackgroundServices();
      } else {
        console.warn('⚠️ Bot is not configured. Please set the required environment variables.');
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
            console.error('Command execution error:', error);
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
      console.error('Discord client error:', error);
    });

    process.on('SIGINT', () => {
      console.log('Shutting down bot...');
      this.shutdown();
    });

    process.on('SIGTERM', () => {
      console.log('Shutting down bot...');
      this.shutdown();
    });
  }

  private async initializeBot(): Promise<void> {
    try {
      console.log('🚀 Initializing bot with historical data...');
      
      // Scrape historical analysis from the configured channels
      const historicalData = await this.historicalScraper.scrapeHistoricalAnalysis(
        this.client,
        this.config!
      );
      
      // Load the historical data into the analysis linker
      this.analysisLinker.initializeFromHistoricalData(historicalData);
      
      // Mark as initialized so message processing can begin
      this.isInitialized = true;
      
      console.log('🎉 Bot initialization complete! Ready to process messages.');
    } catch (error) {
      console.error('❌ Error during bot initialization:', error);
      console.log('⚠️ Bot will continue without historical data.');
      this.isInitialized = true; // Allow bot to continue functioning
    }
  }

  private startBackgroundServices(): void {
    this.messageRetention.initialize(this.client, this.config!);
    this.messageRetention.startCleanupScheduler();
    
    // Set static instance for global access in commands
    MessageRetention.setInstance(this.messageRetention);
    
    console.log('🔄 Background services started');
  }

  private async shutdown(): Promise<void> {
    console.log('🛑 Shutting down services...');
    this.messageRetention.stopCleanupScheduler();
    await this.client.destroy();
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
      console.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  private async loadCommands(): Promise<void> {
    const statusCommand = await import('./commands/status');
    this.commands.set('status', statusCommand);
    console.log('✅ Commands loaded');
  }
}

const bot = new TradersMindBot();
bot.start().catch(console.error);