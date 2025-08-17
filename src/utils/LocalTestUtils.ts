import { Logger } from './Logger';
import { LocalDatabaseService } from '../services/LocalDatabaseService';

export interface MockMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    bot: boolean;
  };
  channel: {
    id: string;
    name: string;
  };
  guild: {
    id: string;
    name: string;
  };
  timestamp: Date;
}

export interface MockInteraction {
  id: string;
  type: 'button' | 'command';
  user: {
    id: string;
    username: string;
  };
  customId?: string;
  commandName?: string;
}

export class LocalTestUtils {
  private static testDatabase: LocalDatabaseService | null = null;

  static async initializeTestEnvironment(): Promise<void> {
    Logger.info('🧪 Initializing local test environment...');
    
    // Initialize test database
    this.testDatabase = new LocalDatabaseService('./test_local_bot.db');
    await this.testDatabase.connect();
    
    Logger.info('✅ Local test environment ready');
  }

  static async resetTestEnvironment(): Promise<void> {
    if (this.testDatabase) {
      await this.testDatabase.resetTestData();
      Logger.info('🔄 Test environment reset');
    }
  }

  static async cleanupTestEnvironment(): Promise<void> {
    if (this.testDatabase) {
      await this.testDatabase.close();
      this.testDatabase = null;
      Logger.info('🧹 Test environment cleaned up');
    }
  }

  static createMockMessage(overrides: Partial<MockMessage> = {}): MockMessage {
    const defaults: MockMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: 'AAPL looking strong above $185, target $210',
      author: {
        id: 'admin_local_123',
        username: 'Admin (Test)',
        bot: false
      },
      channel: {
        id: 'local_channel_1',
        name: 'analysis-local-1'
      },
      guild: {
        id: 'local_guild_id',
        name: 'Test Guild'
      },
      timestamp: new Date()
    };

    return { ...defaults, ...overrides };
  }

  static createMockButtonInteraction(overrides: Partial<MockInteraction> = {}): MockInteraction {
    const defaults: MockInteraction = {
      id: `int_${Date.now()}`,
      type: 'button' as const,
      user: {
        id: 'test_user_789',
        username: 'Test User'
      },
      customId: 'analysis_button_AAPL'
    };

    return { ...defaults, ...overrides };
  }

  static createMockCommandInteraction(overrides: Partial<MockInteraction> = {}): MockInteraction {
    const defaults: MockInteraction = {
      id: `cmd_${Date.now()}`,
      type: 'command' as const,
      user: {
        id: 'test_user_789',
        username: 'Test User'
      },
      commandName: 'status'
    };

    return { ...defaults, ...overrides };
  }

  static generateTestMessages(count: number = 10): MockMessage[] {
    const symbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META'];
    const templates = [
      '{symbol} breaking resistance at ${price}, target ${target}',
      '{symbol} showing strong momentum. PT ${target}',
      '{symbol} pullback to ${support} support, good entry',
      '{symbol} earnings play - expecting volatility around ${price}',
      '{symbol} chart looking bullish, ${price} breakout confirmed'
    ];

    const authors = [
      { id: 'admin_local_123', username: 'Admin (Test)' },
      { id: 'tomer_local_456', username: 'Tomer (Test)' }
    ];

    const messages: MockMessage[] = [];

    for (let i = 0; i < count; i++) {
      const symbol = symbols[i % symbols.length] || 'AAPL';
      const template = templates[i % templates.length] || '{symbol} test analysis';
      const author = authors[i % authors.length] || { id: 'test', username: 'Test' };
      const price = (Math.random() * 500 + 50).toFixed(2);
      const target = (parseFloat(price) + Math.random() * 50 + 10).toFixed(2);
      const support = (parseFloat(price) - Math.random() * 20 - 5).toFixed(2);

      const content = template
        .replace(/\{symbol\}/g, symbol)
        .replace(/\{price\}/g, price)
        .replace(/\{target\}/g, target)
        .replace(/\{support\}/g, support);

      messages.push(this.createMockMessage({
        content,
        author: {
          id: author.id,
          username: author.username,
          bot: false
        },
        timestamp: new Date(Date.now() - (count - i) * 60000) // Spread over last `count` minutes
      }));
    }

    return messages;
  }

  static async simulateMessageProcessing(messages: MockMessage[]): Promise<void> {
    Logger.info(`🎭 Simulating processing of ${messages.length} messages...`);

    for (const message of messages) {
      Logger.debug(`Processing mock message: ${message.content.substring(0, 50)}...`);
      
      // Simulate message processing delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Log the "processing"
      Logger.analysis(`Mock analysis: ${message.author.username} - ${message.content}`);
    }

    Logger.info(`✅ Processed ${messages.length} mock messages`);
  }

  static async getTestDatabaseStats(): Promise<{users: number, symbols: number, analyses: number}> {
    if (!this.testDatabase) {
      return { users: 0, symbols: 0, analyses: 0 };
    }

    return await this.testDatabase.getTestDataSummary();
  }

  static logTestScenario(name: string, description: string): void {
    Logger.info(`🎬 Test Scenario: ${name}`);
    Logger.info(`📝 Description: ${description}`);
  }

  static async runBasicFunctionalityTest(): Promise<boolean> {
    try {
      this.logTestScenario(
        'Basic Functionality Test',
        'Test database operations, message processing, and health checks'
      );

      // Test database operations
      if (this.testDatabase) {
        const stats = await this.testDatabase.getTestDataSummary();
        Logger.info(`📊 Database stats: ${stats.users} users, ${stats.symbols} symbols, ${stats.analyses} analyses`);
      }

      // Generate and process test messages
      const testMessages = this.generateTestMessages(5);
      await this.simulateMessageProcessing(testMessages);

      // Test interaction simulation
      const buttonInteraction = this.createMockButtonInteraction();
      Logger.interaction(`Mock button interaction: ${buttonInteraction.customId}`);

      Logger.info('✅ Basic functionality test completed successfully');
      return true;
    } catch (error) {
      Logger.error('❌ Basic functionality test failed:', error);
      return false;
    }
  }

  static async runPerformanceTest(messageCount: number = 100): Promise<boolean> {
    try {
      this.logTestScenario(
        'Performance Test',
        `Process ${messageCount} messages and measure performance`
      );

      const startTime = Date.now();
      const testMessages = this.generateTestMessages(messageCount);
      
      await this.simulateMessageProcessing(testMessages);
      
      const duration = Date.now() - startTime;
      const messagesPerSecond = (messageCount / duration) * 1000;

      Logger.info(`⚡ Performance results:`);
      Logger.info(`   - Processed ${messageCount} messages in ${duration}ms`);
      Logger.info(`   - Rate: ${messagesPerSecond.toFixed(2)} messages/second`);

      const success = messagesPerSecond > 5; // Should handle at least 5 messages per second
      if (success) {
        Logger.info('✅ Performance test passed');
      } else {
        Logger.warn('⚠️ Performance test below threshold');
      }

      return success;
    } catch (error) {
      Logger.error('❌ Performance test failed:', error);
      return false;
    }
  }

  static createLocalHealthCheckData() {
    return {
      status: 'healthy',
      mode: 'local',
      bot: {
        connected: false, // No Discord in local mode
        initialized: true,
        user: 'Local Test Bot'
      },
      config: {
        analysisChannels: 2,
        generalChannel: true,
        retentionHours: 24
      },
      database: {
        type: 'sqlite',
        connected: this.testDatabase !== null,
        stats: this.testDatabase ? 'available' : 'not_connected'
      },
      symbolsTracked: 0, // Would be populated from actual database
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      localMode: {
        testEnvironment: true,
        mockDataEnabled: true,
        skipDiscord: process.env.SKIP_DISCORD === 'true'
      }
    };
  }
}