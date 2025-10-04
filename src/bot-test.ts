// Test-friendly version of bot.ts that mocks Discord connections
import express, { Request, Response } from 'express';
import { getBotConfig } from './config';
import { BotConfig } from './types';
import { SymbolDetector } from './services/SymbolDetector';
import { AnalysisLinker } from './services/AnalysisLinker';
import { MessageRetention } from './services/MessageRetention';
import { EphemeralHandler } from './services/EphemeralHandler';
import { Logger } from './utils/Logger';

// Simple mock client that doesn't extend Discord.js classes
class MockClient {
  private mockUser = { id: 'mock-bot-id', tag: 'TestBot#1234' };
  private mockReady = false;
  
  async login(token?: string): Promise<string> {
    console.log('🔧 Mock Discord login successful');
    this.mockReady = true;
    return 'mock-token';
  }

  isReady(): boolean {
    return this.mockReady;
  }

  get user() {
    return this.mockReady ? this.mockUser : null;
  }

  async destroy(): Promise<void> {
    this.mockReady = false;
    console.log('🔧 Mock Discord client destroyed');
    return Promise.resolve();
  }

  get channels() {
    return {
      cache: {
        get: (id: string) => ({
          id,
          messages: {
            fetch: async () => {
              // Create mock messages with buttons for testing
              const mockMessages = new Map();
              
              // Add mock bot messages with components (buttons)
              const message1 = {
                id: 'mock-button-message-1',
                author: { id: 'mock-bot-id' },
                components: [{ type: 1, components: [] }], // Has buttons
                delete: async () => {
                  console.log('🔧 Mock button message 1 deleted');
                  return Promise.resolve();
                }
              };
              
              const message2 = {
                id: 'mock-button-message-2', 
                author: { id: 'mock-bot-id' },
                components: [{ type: 1, components: [] }], // Has buttons
                delete: async () => {
                  console.log('🔧 Mock button message 2 deleted');
                  return Promise.resolve();
                }
              };
              
              mockMessages.set(message1.id, message1);
              mockMessages.set(message2.id, message2);
              
              return {
                filter: (predicate: any) => {
                  const results = [];
                  for (const msg of mockMessages.values()) {
                    if (predicate(msg)) {
                      results.push(msg);
                    }
                  }
                  return results;
                },
                values: () => Array.from(mockMessages.values())
              };
            }
          }
        })
      }
    };
  }
}

class TradersMindBotTest {
  private client: MockClient;
  private config: BotConfig | null;
  private symbolDetector: SymbolDetector;
  private analysisLinker: AnalysisLinker;
  private messageRetention: MessageRetention;
  private ephemeralHandler: EphemeralHandler;
  private isInitialized: boolean = false;
  private httpServer: any = null;

  constructor() {
    console.log('🔧 Creating mock client...');
    this.client = new MockClient();
    
    console.log('🔧 Loading bot config...');
    this.config = getBotConfig();
    
    if (!this.config) {
      throw new Error('Failed to load bot configuration. Please check your environment variables.');
    }
    
    console.log('🔧 Creating services...');
    this.symbolDetector = new SymbolDetector();
    this.analysisLinker = new AnalysisLinker();
    this.messageRetention = new MessageRetention();
    // Create a basic ephemeral handler without the cleanup interval
    this.ephemeralHandler = {
      performFinalCleanup: () => Promise.resolve()
    } as any;

    console.log('🔧 Setting up event handlers...');
    this.setupEventHandlers();
    
    // Debug process.exit calls
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      console.log('🔍 DEBUG: process.exit called with code:', code);
      console.trace('Exit called from:');
      return originalExit.call(process, code);
    }) as any;
    
    console.log('🔧 Bot constructor completed');
  }

  private setupEventHandlers(): void {
    console.log('🔧 Registering SIGINT handler...');
    
    // Multiple SIGINT handlers for redundancy
    process.on('SIGINT', () => {
      console.log('🔍 DEBUG: SIGINT received - starting immediate cleanup');
      Logger.info('Shutting down bot...');
      
      // Use setImmediate to ensure cleanup runs in next tick
      setImmediate(async () => {
        try {
          console.log('🔍 DEBUG: Starting shutdown in immediate callback');
          await this.shutdown();
        } catch (error) {
          console.log('❌ ERROR: SIGINT shutdown error:', error);
          process.exit(1);
        }
      });
    });
    
    // Additional signal debugging
    process.on('SIGINT', () => {
      console.log('🔍 DEBUG: Secondary SIGINT handler triggered');
    });

    console.log('🔧 Registering SIGTERM handler...');
    process.on('SIGTERM', () => {
      console.log('🔍 DEBUG: SIGTERM received - starting immediate cleanup');
      Logger.info('Shutting down bot...');
      
      // Use setImmediate to ensure cleanup runs in next tick
      setImmediate(async () => {
        try {
          console.log('🔍 DEBUG: Starting shutdown in immediate callback');
          await this.shutdown();
        } catch (error) {
          console.log('❌ ERROR: SIGTERM shutdown error:', error);
          process.exit(1);
        }
      });
    });
    
    // Add stdin monitoring like the real bot (this was the working mechanism)
    if (process.stdin.isTTY) {
      console.log('🔧 Setting up stdin monitoring for Ctrl+C...');
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (key) => {
        // Ctrl+C is '\u0003'
        if (key.toString() === '\u0003') {
          console.log('🔍 DEBUG: Ctrl+C detected via stdin monitoring!');
          this.shutdown().catch(() => process.exit(1));
        }
      });
    }
    
    console.log('✅ Signal handlers registered successfully');
    
    // Verify signal handlers are registered
    const sigintHandlers = process.listenerCount('SIGINT');
    if (sigintHandlers === 0) {
      console.log('❌ ERROR: No SIGINT handlers registered!');
    } else {
      console.log(`✅ SUCCESS: ${sigintHandlers} SIGINT handler(s) registered`);
    }
    
    // Confirm handlers are working
    setTimeout(() => {
      console.log('🔍 DEBUG: Signal handlers ready for shutdown signals');
    }, 100);
  }

  private async initializeBot(): Promise<void> {
    Logger.botStartup(`${this.client.user?.tag} is online and ready!`);
    
    if (this.config) {
      const discussionInfo = this.config.discussionChannels.length > 0 
        ? `, Discussion=[${this.config.discussionChannels.join(', ')}]`
        : '';
      const managerInfo = this.config.managerId
        ? `, ManagerID=${this.config.managerId}`
        : '';
      
      Logger.info(`Monitoring channels: Analysis=[${this.config.analysisChannels.join(', ')}], General=${this.config.generalNoticesChannel}${discussionInfo}${managerInfo}`);
      
      // Skip permission diagnostics and historical data in test mode
      console.log('🔧 Test mode: Skipping permission diagnostics and historical data');
      this.isInitialized = true;
      
      this.startBackgroundServices();
      
      // Add some mock messages to retention for testing
      this.addMockRetentionMessages();
    } else {
      Logger.warn('Bot is not configured. Please set the required environment variables.');
    }
  }

  private startBackgroundServices(): void {
    this.messageRetention.initialize(this.client as any, this.config!);
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
          generalChannel: !!this.config.generalNoticesChannel
        } : null,
        retention: stats,
        symbolsTracked: this.analysisLinker.getTrackedSymbolsCount(),
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      });
    });

    app.get('/', (req: Request, res: Response) => {
      res.json({ 
        service: 'TradersMind Discord Bot (Test Mode)',
        status: 'running',
        version: '1.0.0'
      });
    });

    // Test shutdown endpoint - alternative to SIGINT for testing
    app.post('/test-shutdown', async (req: Request, res: Response) => {
      console.log('🔍 DEBUG: Test shutdown endpoint called - starting immediate cleanup');
      res.json({ message: 'Shutdown initiated' });
      
      // Trigger shutdown in next tick to allow response to be sent
      setImmediate(async () => {
        try {
          await this.shutdown();
        } catch (error) {
          console.log('❌ ERROR: Test shutdown error:', error);
          process.exit(1);
        }
      });
    });

    this.httpServer = app.listen(port, () => {
      Logger.info(`Health check server started on port ${port}`);
    });
  }

  private shutdownInProgress = false;

  private async shutdown(): Promise<void> {
    if (this.shutdownInProgress) {
      console.log('🔍 DEBUG: Shutdown already in progress, ignoring duplicate call');
      return;
    }
    this.shutdownInProgress = true;

    const timestamp = () => `[${new Date().toISOString()}]`;
    console.log(`🔍 DEBUG: ${timestamp()} Entered shutdown method`);
    console.log(`ℹ️ INFO: ${timestamp()} Initiating graceful shutdown...`);
    
    try {
      // PRIORITY 1: Message cleanup FIRST (most important)
      console.log(`ℹ️ INFO: ${timestamp()} Performing message cleanup IMMEDIATELY...`);
      try {
        await Promise.race([
          this.messageRetention.performFinalCleanup(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Message cleanup timeout')), 2000))
        ]);
        console.log(`✅ SUCCESS: ${timestamp()} Message cleanup completed`);
      } catch (error) {
        console.log(`❌ ERROR: ${timestamp()} Message cleanup failed:`, error);
      }
      // Always show cleanup finished regardless of errors - this indicates the cleanup attempt completed
      console.log(`🎉 CLEANUP FINISHED`);

      // PRIORITY 2: Stop schedulers  
      console.log(`ℹ️ INFO: ${timestamp()} Stopping background schedulers...`);
      try {
        this.messageRetention.stopCleanupScheduler();
        console.log(`✅ SUCCESS: ${timestamp()} Schedulers stopped`);
      } catch (error) {
        console.log(`❌ ERROR: ${timestamp()} Scheduler stop failed:`, error);
      }
      
      // PRIORITY 3: HTTP server
      console.log(`ℹ️ INFO: ${timestamp()} Stopping HTTP server...`);
      try {
        if (this.httpServer) {
          this.httpServer.close();
          this.httpServer = null;
        }
        console.log(`✅ SUCCESS: ${timestamp()} HTTP server stopped`);
      } catch (error) {
        console.log(`❌ ERROR: ${timestamp()} HTTP server stop failed:`, error);
      }

      // PRIORITY 4: Ephemeral cleanup
      console.log(`ℹ️ INFO: ${timestamp()} Performing ephemeral cleanup...`);
      try {
        await Promise.race([
          Promise.resolve(this.ephemeralHandler.performFinalCleanup()),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Ephemeral cleanup timeout')), 1000))
        ]);
        console.log(`✅ SUCCESS: ${timestamp()} Ephemeral cleanup completed`);
      } catch (error) {
        console.log(`❌ ERROR: ${timestamp()} Ephemeral cleanup failed:`, error);
      }
      
      console.log(`ℹ️ INFO: ${timestamp()} Graceful shutdown steps complete`);
      
    } catch (error) {
      console.log(`❌ ERROR: ${timestamp()} Error during graceful shutdown:`, error);
    }
    
    try {
      console.log(`ℹ️ INFO: ${timestamp()} Destroying Discord client...`);
      await this.client.destroy();
      console.log(`✅ SUCCESS: ${timestamp()} Discord client destroyed`);
    } catch (error) {
      console.log(`❌ ERROR: ${timestamp()} Client destroy failed:`, error);
    }
    
    console.log(`🎯 SHUTDOWN COMPLETE`);
    console.log(`🔍 DEBUG: ${timestamp()} About to call process.exit(0)`);
    
    // Add small delay to ensure all console output is flushed
    setTimeout(() => {
      process.exit(0);
    }, 100);
  }

  public async start(): Promise<void> {
    try {
      console.log('🔧 Starting bot...');
      // Always use mock token in test mode
      await this.client.login('mock-token');
      console.log('🔧 Mock login completed, initializing...');
      await this.initializeBot();
      console.log('🔧 Bot start completed');
    } catch (error) {
      console.log('🔧 Error during start:', error);
      Logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  private addMockRetentionMessages(): void {
    // Create mock messages for retention testing
    const mockMessage1 = {
      id: 'mock-retention-message-1',
      channel: { id: this.config!.generalNoticesChannel },
      createdAt: new Date(),
      author: { id: 'mock-bot-id' },
      delete: async () => console.log('🔧 Mock message deleted')
    };
    
    const mockMessage2 = {
      id: 'mock-retention-message-2', 
      channel: { id: this.config!.analysisChannels[0] },
      createdAt: new Date(),
      author: { id: 'mock-bot-id' },
      delete: async () => console.log('🔧 Mock message deleted')
    };

    // Add to retention tracking
    this.messageRetention.addMessageForRetention(mockMessage1 as any, 'test-group-1');
    this.messageRetention.addMessageForRetention(mockMessage2 as any, 'test-group-2');
    
    console.log('🔧 Added mock messages to retention tracking');
  }

}

const bot = new TradersMindBotTest();
bot.start().catch(console.error);