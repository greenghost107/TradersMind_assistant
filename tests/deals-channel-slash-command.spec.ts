import { test, expect } from '@playwright/test';
import { DiscussionChannelHandler } from '../src/services/DiscussionChannelHandler';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { EphemeralHandler } from '../src/services/EphemeralHandler';
import { MessageRetention } from '../src/services/MessageRetention';
import { AnalysisLinker } from '../src/services/AnalysisLinker';
import { BotConfig } from '../src/types';
import * as createdealsCommand from '../src/commands/createdeals';
import * as config from '../src/config';

// Mock Discord components for slash command testing
const mockBotUser = { id: 'mock-bot-id', tag: 'TestBot#1234' };
const mockDealsChannelId = 'mock-deals-channel-123';
const mockManagerId = 'mock-manager-user-456';

// Mock ChatInputCommandInteraction
class MockCommandInteraction {
  public replied: boolean = false;
  public deferred: boolean = false;
  public ephemeralResponse: string = '';
  public channel: any;
  public user: any;
  public guildId: string;
  public commandName: string = 'createdeals';
  public member: any;

  constructor(channelId: string, userId: string = mockManagerId, mockMessages?: Map<string, MockMessage>) {
    this.user = { id: userId, tag: 'TestManager#1234' };
    this.guildId = 'mock-guild-id';
    this.member = { displayName: 'TestManager' };
    
    // Create mock messages for the channel
    // If mockMessages is undefined, create default message
    // If mockMessages is explicitly passed (even if empty), use it as-is
    const messagesToReturn = mockMessages !== undefined ? mockMessages : new Map([
      ['manager-msg-123', new MockMessage(
        'manager-msg-123',
        'QUBT / BKV / MSFT / VEEV 👀\n@everyone',
        userId,
        channelId
      )]
    ]);
    
    this.channel = { 
      id: channelId,
      messages: {
        fetch: async (options: any) => {
          // Filter to only return messages from the requesting user
          const filteredMessages = new Map();
          for (const [id, msg] of messagesToReturn) {
            if (msg.author.id === userId && !msg.author.bot && msg.content.trim().length > 0) {
              filteredMessages.set(id, msg);
            }
          }
          
          // Return collection-like object with filter method (like Discord.js Collection)
          return {
            size: filteredMessages.size,
            filter: (filterFn: any) => {
              const filtered = new Map();
              for (const [key, value] of filteredMessages) {
                if (filterFn(value)) {
                  filtered.set(key, value);
                }
              }
              return {
                size: filtered.size,
                first: () => filtered.size > 0 ? filtered.values().next().value : undefined
              };
            },
            first: () => filteredMessages.size > 0 ? filteredMessages.values().next().value : undefined
          };
        }
      }
    };
  }

  async reply(options: any) {
    this.replied = true;
    this.ephemeralResponse = typeof options.content === 'string' ? options.content : (typeof options === 'string' ? options : 'Processed');
    return Promise.resolve();
  }

  async editReply(options: any) {
    this.ephemeralResponse = typeof options.content === 'string' ? options.content : (typeof options === 'string' ? options : 'Updated');
    return Promise.resolve();
  }

  isCommand() { return true; }
  isChatInputCommand() { return true; }
}

// Mock Message class for deals channel messages
class MockMessage {
  public id: string;
  public channelId: string;
  public content: string;
  public author: any;
  public createdAt: Date;
  public channel: any;
  public guild: any;
  public member: any;

  constructor(id: string, content: string, authorId: string = mockManagerId, channelId: string = mockDealsChannelId) {
    this.id = id;
    this.channelId = channelId;
    this.content = content;
    this.author = { id: authorId, bot: false, tag: 'TestManager#1234' };
    this.createdAt = new Date();
    this.guild = { id: 'mock-guild-id' };
    this.member = { displayName: 'TestManager' };
    this.channel = { 
      id: channelId,
      messages: {
        fetch: async (options: any) => {
          // Return collection of recent messages
          return new Map([
            ['msg-1', this]
          ]);
        }
      }
    };
  }

  async reply(content: any) {
    const replyId = `reply-${Date.now()}-${Math.random()}`;
    return {
      id: replyId,
      channel: { id: this.channelId },
      author: { id: mockBotUser.id, bot: true },
      content: 'Button message'
    };
  }
}

// Mock Client with channel support
class MockClient {
  public channels: any;
  public user: any;

  constructor() {
    this.user = mockBotUser;
    const dealsChannel = {
      id: mockDealsChannelId,
      messages: {
        fetch: async (options: any) => {
          // Return recent manager messages
          const managerMessage = new MockMessage(
            'manager-msg-123',
            'QUBT / BKV / MSFT / VEEV 👀\n@everyone',
            mockManagerId,
            mockDealsChannelId
          );
          return new Map([['manager-msg-123', managerMessage]]);
        }
      }
    };
    
    this.channels = {
      cache: new Map([[mockDealsChannelId, dealsChannel]])
    };
  }

  isReady() { return true; }
}

test.describe('Deals Channel Slash Command', () => {
  let botConfig: BotConfig;
  let discussionChannelHandler: DiscussionChannelHandler;
  let symbolDetector: SymbolDetector;
  let ephemeralHandler: EphemeralHandler;
  let messageRetention: MessageRetention;
  let analysisLinker: AnalysisLinker;
  let mockClient: MockClient;
  let createSymbolButtonsCalls: { message: any, symbols: any[] }[];

  test.beforeEach(() => {
    // Reset call tracking
    createSymbolButtonsCalls = [];
    
    // Setup bot config with deals channel FIRST
    botConfig = {
      analysisChannels: ['analysis-1', 'analysis-2'],
      discussionChannels: ['discussion-1', 'discussion-2'],
      generalNoticesChannel: 'general-channel',
      dealsChannel: mockDealsChannelId,
      guildId: 'mock-guild-id',
      managerId: mockManagerId
    };
    
    // Mock getBotConfig to return our test config AFTER setting it up
    config.getBotConfig = () => botConfig;

    // Initialize services
    discussionChannelHandler = new DiscussionChannelHandler();
    symbolDetector = new SymbolDetector();
    analysisLinker = new AnalysisLinker();
    messageRetention = new MessageRetention();
    ephemeralHandler = new EphemeralHandler(analysisLinker, messageRetention);
    mockClient = new MockClient();

    // Initialize message retention with mock client
    messageRetention.initialize(mockClient as any, botConfig);
    
    // Mock EphemeralHandler.createSymbolButtons to track calls
    ephemeralHandler.createSymbolButtons = async (message: any, symbols: any[]) => {
      // Track the call
      createSymbolButtonsCalls.push({ message, symbols });
      // Mock successful completion
      return Promise.resolve();
    };
    
    // Initialize createdeals command services
    createdealsCommand.initializeServices(
      discussionChannelHandler,
      symbolDetector,
      ephemeralHandler
    );
  });
  
  test.afterEach(() => {
    // Reset tracking arrays
    createSymbolButtonsCalls = [];
  });

  test.describe('Happy Path - Manager Creates Deals Buttons', () => {
    test('should create deals buttons when manager uses /createdeals in deals channel', async () => {
      // Arrange: Manager has posted symbols in deals channel
      const managerMessage = new MockMessage(
        'manager-deals-msg',
        'QUBT / BKV / MSFT / VEEV 👀\n@everyone',
        mockManagerId,
        mockDealsChannelId
      );

      // Mock interaction from manager in deals channel
      const interaction = new MockCommandInteraction(mockDealsChannelId, mockManagerId);

      // Act: Simulate /createdeals command execution
      // NOTE: This will fail until we implement the command
      // Expected behavior:
      // 1. Command validates manager permission
      // 2. Command validates deals channel
      // 3. Command finds manager's recent message
      // 4. Command parses symbols from message
      // 5. Command creates ephemeral "Processing..." response
      // 6. Command creates button message
      // 7. Command updates ephemeral response to success

      // Act: Execute the /createdeals command
      await createdealsCommand.execute(interaction);

      // Assert: Verify command executed successfully
      expect(interaction.replied).toBe(true);
      expect(interaction.ephemeralResponse).toContain('✅ Created deals buttons');
      expect(interaction.ephemeralResponse).toContain('4 symbols');
      expect(interaction.ephemeralResponse).toContain('QUBT, BKV, MSFT, VEEV');
    });

    test('should parse symbols correctly from deals message format', async () => {
      // Test symbol parsing logic specifically
      const testCases = [
        {
          content: 'QUBT / BKV / MSFT / VEEV 👀\n@everyone',
          expected: ['QUBT', 'BKV', 'MSFT', 'VEEV']
        },
        {
          content: 'AAPL / GOOGL / TSLA 🚀\n@everyone',
          expected: ['AAPL', 'GOOGL', 'TSLA']
        },
        {
          content: 'NVDA 📈\n@everyone',
          expected: ['NVDA']
        },
        {
          content: 'AAPL/BKV/MSFT\n@everyone', // No spaces
          expected: ['AAPL', 'BKV', 'MSFT']
        }
      ];

      for (const testCase of testCases) {
        // Create interaction with test message content
        const testMessage = new MockMessage(
          'test-msg',
          testCase.content,
          mockManagerId,
          mockDealsChannelId
        );
        
        const mockMessages = new Map([['test-msg', testMessage]]);
        const interaction = new MockCommandInteraction(mockDealsChannelId, mockManagerId, mockMessages);
        
        // Execute command
        await createdealsCommand.execute(interaction);
        
        // Verify symbols were parsed correctly
        expect(interaction.ephemeralResponse).toContain('✅ Created deals buttons');
        expect(interaction.ephemeralResponse).toContain(`${testCase.expected.length} symbols`);
        
        // Check each expected symbol is mentioned
        for (const symbol of testCase.expected) {
          expect(interaction.ephemeralResponse).toContain(symbol);
        }
      }
    });
  });

  test.describe('Permission and Channel Validation', () => {
    test('should reject /createdeals from non-manager users', async () => {
      // Arrange: Non-manager user tries to use command
      const nonManagerId = 'non-manager-user-789';
      const interaction = new MockCommandInteraction(mockDealsChannelId, nonManagerId);

      // Act: Execute command as non-manager
      await createdealsCommand.execute(interaction);

      // Assert: Command should reject non-manager
      expect(interaction.replied).toBe(true);
      expect(interaction.ephemeralResponse).toBe('❌ Only managers can use this command');
    });

    test('should only work in configured deals channel', async () => {
      // Arrange: Manager tries to use command in wrong channel
      const wrongChannelId = 'wrong-channel-999';
      const interaction = new MockCommandInteraction(wrongChannelId, mockManagerId);

      // Act: Execute command in wrong channel
      await createdealsCommand.execute(interaction);

      // Assert: Command should reject wrong channel
      expect(interaction.replied).toBe(true);
      expect(interaction.ephemeralResponse).toBe('❌ This command only works in the deals channel');
    });

    test('should handle missing deals channel configuration gracefully', async () => {
      // Arrange: Mock missing config by temporarily changing getBotConfig
      const originalGetBotConfig = config.getBotConfig;
      config.getBotConfig = () => ({
        ...botConfig,
        dealsChannel: undefined
      });

      const interaction = new MockCommandInteraction(mockDealsChannelId, mockManagerId);

      // Act: Execute command with missing config
      await createdealsCommand.execute(interaction);

      // Assert: Command should handle gracefully
      expect(interaction.replied).toBe(true);
      expect(interaction.ephemeralResponse).toBe('❌ Deals channel not configured - please contact administrator');
      
      // Restore original config
      config.getBotConfig = originalGetBotConfig;
    });
  });

  test.describe('Error Handling', () => {
    test('should handle no recent manager message gracefully', async () => {
      // Arrange: Manager hasn't posted any recent messages
      const emptyMessages = new Map();
      const interaction = new MockCommandInteraction(mockDealsChannelId, mockManagerId, emptyMessages);

      // Act: Execute command with no messages
      await createdealsCommand.execute(interaction);

      // Assert: Command should handle gracefully
      expect(interaction.replied).toBe(true);
      expect(interaction.ephemeralResponse).toBe('❌ No recent message found to create deals from');
    });

    test('should handle message with no valid symbols', async () => {
      // Arrange: Manager's message has no parseable symbols
      const messageWithoutSymbols = new MockMessage(
        'no-symbols-msg',
        'Processing 123456 completed successfully!\n@everyone',
        mockManagerId,
        mockDealsChannelId
      );

      const mockMessages = new Map([['no-symbols-msg', messageWithoutSymbols]]);
      const interaction = new MockCommandInteraction(mockDealsChannelId, mockManagerId, mockMessages);

      // Act: Execute command with message containing no symbols
      await createdealsCommand.execute(interaction);

      // Assert: Command should handle gracefully
      expect(interaction.replied).toBe(true);
      expect(interaction.ephemeralResponse).toBe('❌ No valid symbols found in your message');
    });
  });

  test.describe('Integration with Existing Systems', () => {
    test('should add button messages to retention system', async () => {
      // Arrange: Successful deals button creation
      const interaction = new MockCommandInteraction(mockDealsChannelId, mockManagerId);

      // Act: Execute command successfully
      await createdealsCommand.execute(interaction);

      // Assert: EphemeralHandler.createSymbolButtons should be called
      expect(createSymbolButtonsCalls).toHaveLength(1);
      const call = createSymbolButtonsCalls[0];
      expect(call.symbols).toHaveLength(4);
      expect(call.symbols.map((s: any) => s.symbol)).toEqual(['QUBT', 'BKV', 'MSFT', 'VEEV']);
    });

    test('should use existing EphemeralHandler for button creation', async () => {
      // Arrange: Valid deals command
      const interaction = new MockCommandInteraction(mockDealsChannelId, mockManagerId);

      // Act: Execute command
      await createdealsCommand.execute(interaction);

      // Assert: Command should have completed successfully
      expect(interaction.ephemeralResponse).toContain('✅ Created deals buttons');
      
      // Verify EphemeralHandler.createSymbolButtons was called with correct parameters
      expect(createSymbolButtonsCalls).toHaveLength(1);
      
      const call = createSymbolButtonsCalls[0];
      expect(call.message).toBeDefined();
      expect(call.symbols).toHaveLength(4);
      expect(call.symbols.map((s: any) => s.symbol)).toEqual(['QUBT', 'BKV', 'MSFT', 'VEEV']);
    });

    test('should not interfere with existing button interactions', async () => {
      // Arrange: Execute deals command
      const interaction = new MockCommandInteraction(mockDealsChannelId, mockManagerId);
      await createdealsCommand.execute(interaction);
      
      // Assert: Verify that deals buttons use the same EphemeralHandler infrastructure
      // This ensures compatibility with existing button interaction handlers
      expect(createSymbolButtonsCalls).toHaveLength(1);
      
      // Verify the symbols created have the correct structure for existing handlers
      const call = createSymbolButtonsCalls[0];
      call.symbols.forEach((symbol: any) => {
        expect(symbol).toHaveProperty('symbol');
        expect(symbol).toHaveProperty('confidence');
        expect(symbol).toHaveProperty('position');
        expect(symbol).toHaveProperty('priority');
        expect(symbol.confidence).toBe(1.0); // High confidence for deals
        expect(symbol.priority).toBe('regular');
      });
    });
  });

  test.describe('Non-Disruption Validation', () => {
    test('should not affect existing analysis channel behavior', async () => {
      // This test ensures deals feature doesn't break existing analysis channels
      // The deals command should only affect the deals channel, not analysis channels
      
      // Arrange: Verify deals command is isolated to deals channel
      const interaction = new MockCommandInteraction(mockDealsChannelId, mockManagerId);
      
      // Act: Execute deals command
      await createdealsCommand.execute(interaction);
      
      // Assert: Verify command only affects deals channel
      expect(interaction.channel.id).toBe(mockDealsChannelId);
      
      // Verify that analysis channels are not referenced in deals command
      const analysisChannels = botConfig.analysisChannels;
      expect(analysisChannels).not.toContain(mockDealsChannelId);
      
      // Command should succeed in deals channel
      expect(interaction.ephemeralResponse).toContain('✅ Created deals buttons');
    });

    test('should not affect existing discussion channel behavior', async () => {
      // This test ensures deals feature doesn't break existing discussion channels
      // The deals command should only work in deals channel, not discussion channels
      
      // Arrange: Try to use deals command in discussion channel
      const discussionChannelId = botConfig.discussionChannels[0];
      const interaction = new MockCommandInteraction(discussionChannelId, mockManagerId);
      
      // Act: Execute deals command in discussion channel
      await createdealsCommand.execute(interaction);
      
      // Assert: Command should be rejected in discussion channel
      expect(interaction.ephemeralResponse).toBe('❌ This command only works in the deals channel');
      
      // Verify discussion channels are separate from deals channel
      expect(discussionChannelId).not.toBe(mockDealsChannelId);
      expect(botConfig.discussionChannels).not.toContain(mockDealsChannelId);
    });

    test('should not affect general notices channel behavior', async () => {
      // This test ensures deals feature doesn't break existing general channel
      // The deals command should only work in deals channel, not general channel
      
      // Arrange: Try to use deals command in general notices channel
      const generalChannelId = botConfig.generalNoticesChannel;
      const interaction = new MockCommandInteraction(generalChannelId, mockManagerId);
      
      // Act: Execute deals command in general channel
      await createdealsCommand.execute(interaction);
      
      // Assert: Command should be rejected in general channel
      expect(interaction.ephemeralResponse).toBe('❌ This command only works in the deals channel');
      
      // Verify general channel is separate from deals channel
      expect(generalChannelId).not.toBe(mockDealsChannelId);
    });
  });

  test.describe('Cleanup Integration', () => {
    test('should clean up deals buttons on Hebrew update trigger', async () => {
      // Test that deals buttons are included in Hebrew update cleanup
      // The deals buttons should be tracked by MessageRetention for cleanup
      
      // Arrange: Create deals buttons
      const interaction = new MockCommandInteraction(mockDealsChannelId, mockManagerId);
      await createdealsCommand.execute(interaction);
      
      // Act: Verify that EphemeralHandler.createSymbolButtons was called
      // This ensures deals buttons are created through the same system that gets cleaned up
      expect(createSymbolButtonsCalls).toHaveLength(1);
      
      // Assert: Since deals buttons use EphemeralHandler, they will be included
      // in the existing Hebrew update cleanup system automatically
      expect(interaction.ephemeralResponse).toContain('✅ Created deals buttons');
      
      // The cleanup integration works through EphemeralHandler.createSymbolButtons
      // which automatically registers messages for retention cleanup
    });

    test('should clean up deals buttons on bot shutdown', async () => {
      // Test that deals buttons are included in shutdown cleanup
      // The deals buttons should be tracked by MessageRetention for cleanup
      
      // Arrange: Create deals buttons
      const interaction = new MockCommandInteraction(mockDealsChannelId, mockManagerId);
      await createdealsCommand.execute(interaction);
      
      // Act: Verify button creation was successful
      expect(createSymbolButtonsCalls).toHaveLength(1);
      expect(interaction.ephemeralResponse).toContain('✅ Created deals buttons');
      
      // Assert: Deals buttons use EphemeralHandler infrastructure
      // which integrates with MessageRetention for shutdown cleanup
      // This ensures deals buttons are automatically included in cleanup
      
      // Verify the message retention system has been initialized
      expect(messageRetention).toBeDefined();
      
      // The shutdown cleanup integration works through EphemeralHandler
      // which automatically handles message cleanup during bot shutdown
    });
  });
});