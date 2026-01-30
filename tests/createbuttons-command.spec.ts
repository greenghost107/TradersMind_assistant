import { test, expect } from '@playwright/test';
import { DiscussionChannelHandler } from '../src/services/DiscussionChannelHandler';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { EphemeralHandler } from '../src/services/EphemeralHandler';
import { MessageRetention } from '../src/services/MessageRetention';
import { AnalysisLinker } from '../src/services/AnalysisLinker';
import { BotConfig } from '../src/types';
import * as createbuttonsCommand from '../src/commands/createbuttons';
import * as config from '../src/config';

// Mock Discord components for slash command testing
const mockBotUser = { id: 'mock-bot-id', tag: 'TestBot#1234' };
const mockLongAnalysisChannelId = 'mock-long-analysis-123';
const mockShortAnalysisChannelId = 'mock-short-analysis-456';
const mockGeneralChannelId = 'mock-general-789';
const mockDiscussionChannelId = 'mock-discussion-101';
const mockManagerId = 'mock-manager-user-456';

// Mock ChatInputCommandInteraction
class MockCommandInteraction {
  public replied: boolean = false;
  public deferred: boolean = false;
  public ephemeralResponse: string = '';
  public channel: any;
  public user: any;
  public guildId: string;
  public commandName: string = 'createbuttons';
  public member: any;
  public deleteReplyCalled: boolean = false;
  public replyContent: string = '';

  constructor(channelId: string, userId: string = mockManagerId, mockMessages?: Map<string, MockMessage>) {
    this.user = { id: userId, tag: 'TestManager#1234' };
    this.guildId = 'mock-guild-id';
    this.member = { displayName: 'TestManager' };
    
    // Create mock messages for the channel
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
              for (const [id, msg] of filteredMessages) {
                if (filterFn(msg)) {
                  filtered.set(id, msg);
                }
              }
              return {
                size: filtered.size,
                first: () => filtered.values().next().value || null
              };
            }
          };
        }
      }
    };
  }

  async reply(content: any) {
    this.replied = true;
    if (typeof content === 'object' && content.content) {
      this.replyContent = content.content;
      this.ephemeralResponse = content.ephemeral ? content.content : '';
    } else if (typeof content === 'string') {
      this.replyContent = content;
    }
    
    return {
      id: `reply-${Date.now()}`,
      content: this.replyContent
    };
  }

  async editReply(content: any) {
    if (typeof content === 'object' && content.content) {
      this.replyContent = content.content;
    } else if (typeof content === 'string') {
      this.replyContent = content;
    }
    
    return {
      id: `reply-${Date.now()}`,
      content: this.replyContent
    };
  }

  async deleteReply() {
    this.deleteReplyCalled = true;
  }
}

// Mock Message class  
class MockMessage {
  public id: string;
  public channelId: string;
  public content: string;
  public author: any;
  public createdAt: Date;
  public channel: any;
  public guild: any;
  public member: any;

  constructor(id: string, content: string, authorId: string = mockManagerId, channelId: string = mockLongAnalysisChannelId) {
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
          return new Map([['msg-1', this]]);
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
    const longAnalysisChannel = {
      id: mockLongAnalysisChannelId,
      messages: {
        fetch: async (options: any) => {
          const managerMessage = new MockMessage(
            'manager-msg-123',
            'QUBT / BKV / MSFT / VEEV 👀\n@everyone',
            mockManagerId,
            mockLongAnalysisChannelId
          );
          return new Map([['manager-msg-123', managerMessage]]);
        }
      }
    };
    
    const shortAnalysisChannel = {
      id: mockShortAnalysisChannelId,
      messages: {
        fetch: async (options: any) => {
          const managerMessage = new MockMessage(
            'manager-msg-456',
            'TSLA / NVDA / AMD 📈',
            mockManagerId,
            mockShortAnalysisChannelId
          );
          return new Map([['manager-msg-456', managerMessage]]);
        }
      }
    };
    
    this.channels = {
      cache: new Map([
        [mockLongAnalysisChannelId, longAnalysisChannel],
        [mockShortAnalysisChannelId, shortAnalysisChannel]
      ])
    };
  }

  isReady() { return true; }
}

test.describe('CreateButtons Command', () => {
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
    
    // Setup bot config with analysis channels
    botConfig = {
      analysisChannels: [mockLongAnalysisChannelId, mockShortAnalysisChannelId],
      discussionChannels: [mockDiscussionChannelId],
      generalNoticesChannel: mockGeneralChannelId,
      guildId: 'mock-guild-id',
      managerId: mockManagerId
    };
    
    // Mock getBotConfig to return our test config
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
      createSymbolButtonsCalls.push({ message, symbols });
      return Promise.resolve();
    };
    
    // Initialize createbuttons command services
    createbuttonsCommand.initializeServices(
      discussionChannelHandler,
      symbolDetector,
      ephemeralHandler,
      analysisLinker
    );
  });
  
  test.afterEach(() => {
    // Reset tracking arrays
    createSymbolButtonsCalls = [];
  });

  test.describe('Happy Path - Manager Creates Buttons in Analysis Channels', () => {
    test('should create buttons when manager uses /createbuttons in long analysis channel', async () => {
      // Arrange: Manager has posted symbols in long analysis channel
      const managerMessage = new MockMessage(
        'manager-msg-123',
        'QUBT / BKV / MSFT / VEEV 👀\n@everyone',
        mockManagerId,
        mockLongAnalysisChannelId
      );

      // Create mock analysis message for indexing (simulates production messageCreate handler)
      const mockAnalysisMessage = {
        id: 'manager-msg-123',
        author: { bot: false, id: mockManagerId, tag: 'Manager#1234' },
        content: '$QUBT / $BKV / $MSFT / $VEEV\nטכני analysis עם ברייקאאוט פריצה מעל מומנטום חזק relative strength ווליום גבוה',
        createdAt: new Date(),
        guildId: 'mock-guild-id',
        channel: { id: mockLongAnalysisChannelId, isThread: () => false },
        member: { displayName: 'Manager' },
        reference: null
      } as any;

      // Index the message first (simulates production messageCreate handler)
      await analysisLinker.indexMessage(mockAnalysisMessage);

      const mockMessages = new Map([['manager-msg-123', managerMessage]]);
      const interaction = new MockCommandInteraction(mockLongAnalysisChannelId, mockManagerId, mockMessages);

      // Act: Execute the command
      await createbuttonsCommand.execute(interaction as any);

      // Assert: Should create buttons successfully
      expect(interaction.replied).toBe(true);
      expect(interaction.replyContent).toContain('✅ Created symbol buttons for 4 symbols: QUBT, BKV, MSFT, VEEV');
      expect(createSymbolButtonsCalls.length).toBe(1);
      expect(createSymbolButtonsCalls[0].symbols.length).toBe(4);
      expect(createSymbolButtonsCalls[0].symbols.map(s => s.symbol)).toEqual(['QUBT', 'BKV', 'MSFT', 'VEEV']);
    });

    test('should create buttons when manager uses /createbuttons in short analysis channel', async () => {
      // Arrange: Manager has posted symbols in short analysis channel
      const managerMessage = new MockMessage(
        'manager-msg-456',
        'TSLA / NVDA / AMD 📈',
        mockManagerId,
        mockShortAnalysisChannelId
      );

      // Create mock analysis message for indexing (simulates production messageCreate handler)
      const mockAnalysisMessage = {
        id: 'manager-msg-456',
        author: { bot: false, id: mockManagerId, tag: 'Manager#1234' },
        content: '$TSLA / $NVDA / $AMD\nשורט אנליזה עם ברייקדאון חולשה יחסית relative weakness מומנטום שלילי טרנד יורד',
        createdAt: new Date(),
        guildId: 'mock-guild-id',
        channel: { id: mockShortAnalysisChannelId, isThread: () => false },
        member: { displayName: 'Manager' },
        reference: null
      } as any;

      // Index the message first (simulates production messageCreate handler)
      await analysisLinker.indexMessage(mockAnalysisMessage);

      const mockMessages = new Map([['manager-msg-456', managerMessage]]);
      const interaction = new MockCommandInteraction(mockShortAnalysisChannelId, mockManagerId, mockMessages);

      // Act: Execute the command
      await createbuttonsCommand.execute(interaction as any);

      // Assert: Should create buttons successfully
      expect(interaction.replied).toBe(true);
      expect(interaction.replyContent).toContain('✅ Created symbol buttons for 3 symbols: TSLA, NVDA, AMD');
      expect(createSymbolButtonsCalls.length).toBe(1);
      expect(createSymbolButtonsCalls[0].symbols.length).toBe(3);
      expect(createSymbolButtonsCalls[0].symbols.map(s => s.symbol)).toEqual(['TSLA', 'NVDA', 'AMD']);
    });

    test('should handle various symbol formats correctly', async () => {
      // Test different symbol formats that should all work
      const testCases = [
        { content: 'AAPL / MSFT / GOOGL 👀', expected: ['AAPL', 'MSFT', 'GOOGL'] },
        { content: 'AAPL/MSFT/GOOGL', expected: ['AAPL', 'MSFT', 'GOOGL'] },
        { content: 'AAPL MSFT GOOGL', expected: ['AAPL', 'MSFT', 'GOOGL'] },
        // Note: Single letter symbols need context trust, so use known symbols
        { content: 'NVDA / AMD / INTC 🚀', expected: ['NVDA', 'AMD', 'INTC'] },
      ];

      for (const testCase of testCases) {
        // Reset call tracking
        createSymbolButtonsCalls = [];

        const messageId = `manager-msg-${Date.now()}`;
        const managerMessage = new MockMessage(
          messageId,
          testCase.content,
          mockManagerId,
          mockLongAnalysisChannelId
        );

        // Create mock analysis message for indexing (simulates production messageCreate handler)
        const symbolsWithPrefix = testCase.expected.map(s => `$${s}`).join(' / ');
        const mockAnalysisMessage = {
          id: messageId,
          author: { bot: false, id: mockManagerId, tag: 'Manager#1234' },
          content: `${symbolsWithPrefix}\nטכני analysis עם ברייקאאוט פריצה מעל מומנטום חזק relative strength ווליום גבוה`,
          createdAt: new Date(),
          guildId: 'mock-guild-id',
          channel: { id: mockLongAnalysisChannelId, isThread: () => false },
          member: { displayName: 'Manager' },
          reference: null
        } as any;

        // Index the message first (simulates production messageCreate handler)
        await analysisLinker.indexMessage(mockAnalysisMessage);

        const mockMessages = new Map([[managerMessage.id, managerMessage]]);
        const interaction = new MockCommandInteraction(mockLongAnalysisChannelId, mockManagerId, mockMessages);

        // Act
        await createbuttonsCommand.execute(interaction as any);

        // Assert
        expect(interaction.replied).toBe(true);
        expect(interaction.replyContent).toContain(`✅ Created symbol buttons for ${testCase.expected.length} symbols: ${testCase.expected.join(', ')}`);
        expect(createSymbolButtonsCalls.length).toBe(1);
        expect(createSymbolButtonsCalls[0].symbols.map(s => s.symbol)).toEqual(testCase.expected);
      }
    });
  });

  test.describe('Channel Validation', () => {
    test('should reject command in general notices channel', async () => {
      // Arrange: User tries to use command in general channel
      const interaction = new MockCommandInteraction(mockGeneralChannelId, mockManagerId);

      // Act: Execute the command
      await createbuttonsCommand.execute(interaction as any);

      // Assert: Should reject with channel error
      expect(interaction.replied).toBe(true);
      expect(interaction.replyContent).toContain('❌ This command only works in analysis channels');
      expect(createSymbolButtonsCalls.length).toBe(0);
    });

    test('should reject command in discussion channel', async () => {
      // Arrange: User tries to use command in discussion channel
      const interaction = new MockCommandInteraction(mockDiscussionChannelId, mockManagerId);

      // Act: Execute the command
      await createbuttonsCommand.execute(interaction as any);

      // Assert: Should reject with channel error
      expect(interaction.replied).toBe(true);
      expect(interaction.replyContent).toContain('❌ This command only works in analysis channels');
      expect(createSymbolButtonsCalls.length).toBe(0);
    });

    test('should reject command in unknown channel', async () => {
      // Arrange: User tries to use command in unknown channel
      const unknownChannelId = 'unknown-channel-999';
      const interaction = new MockCommandInteraction(unknownChannelId, mockManagerId);

      // Act: Execute the command
      await createbuttonsCommand.execute(interaction as any);

      // Assert: Should reject with channel error
      expect(interaction.replied).toBe(true);
      expect(interaction.replyContent).toContain('❌ This command only works in analysis channels');
      expect(createSymbolButtonsCalls.length).toBe(0);
    });
  });

  test.describe('Permission Validation', () => {
    test('should reject command from non-manager user', async () => {
      // Arrange: Non-manager tries to use command in analysis channel
      const nonManagerId = 'non-manager-user-789';
      const interaction = new MockCommandInteraction(mockLongAnalysisChannelId, nonManagerId);

      // Act: Execute the command
      await createbuttonsCommand.execute(interaction as any);

      // Assert: Should reject with permission error
      expect(interaction.replied).toBe(true);
      expect(interaction.replyContent).toContain('❌ Only managers can use this command');
      expect(createSymbolButtonsCalls.length).toBe(0);
    });

    test('should allow command from manager user', async () => {
      // Arrange: Manager uses command in analysis channel
      const managerMessage = new MockMessage(
        'manager-msg-permission',
        'AAPL / MSFT 📊',
        mockManagerId,
        mockLongAnalysisChannelId
      );

      // Create mock analysis message for indexing (simulates production messageCreate handler)
      const mockAnalysisMessage = {
        id: 'manager-msg-permission',
        author: { bot: false, id: mockManagerId, tag: 'Manager#1234' },
        content: '$AAPL / $MSFT\nטכני analysis עם ברייקאאוט פריצה מעל מומנטום חזק relative strength ווליום גבוה',
        createdAt: new Date(),
        guildId: 'mock-guild-id',
        channel: { id: mockLongAnalysisChannelId, isThread: () => false },
        member: { displayName: 'Manager' },
        reference: null
      } as any;

      // Index the message first (simulates production messageCreate handler)
      await analysisLinker.indexMessage(mockAnalysisMessage);

      const mockMessages = new Map([['manager-msg-permission', managerMessage]]);
      const interaction = new MockCommandInteraction(mockLongAnalysisChannelId, mockManagerId, mockMessages);

      // Act: Execute the command
      await createbuttonsCommand.execute(interaction as any);

      // Assert: Should allow and create buttons
      expect(interaction.replied).toBe(true);
      expect(interaction.replyContent).toContain('✅ Created symbol buttons for 2 symbols: AAPL, MSFT');
      expect(createSymbolButtonsCalls.length).toBe(1);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle case when no recent message found', async () => {
      // Arrange: Manager has no recent messages
      const emptyMessages = new Map();
      const interaction = new MockCommandInteraction(mockLongAnalysisChannelId, mockManagerId, emptyMessages);

      // Act: Execute the command
      await createbuttonsCommand.execute(interaction as any);

      // Assert: Should return appropriate error message
      expect(interaction.replyContent).toContain('❌ No recent message found to create');
      expect(createSymbolButtonsCalls.length).toBe(0);
    });

    test('should handle case when no valid symbols found', async () => {
      // Arrange: Manager message with no valid symbols (use words that are in COMMON_WORDS exclusion list)
      const managerMessage = new MockMessage(
        'manager-msg-nosymbols',
        'THE QUICK BROWN FOX JUMPS OVER THEM ALL 🌟', // All these words are in COMMON_WORDS
        mockManagerId,
        mockLongAnalysisChannelId
      );
      
      const mockMessages = new Map([['manager-msg-nosymbols', managerMessage]]);
      const interaction = new MockCommandInteraction(mockLongAnalysisChannelId, mockManagerId, mockMessages);

      // Act: Execute the command
      await createbuttonsCommand.execute(interaction as any);

      // Assert: Should return no symbols error
      expect(interaction.replied).toBe(true);
      expect(interaction.replyContent).toContain('❌ No valid symbols found in your message');
      expect(createSymbolButtonsCalls.length).toBe(0);
    });

    test('should handle bot configuration error', async () => {
      // Arrange: Mock config to return null (configuration error)
      config.getBotConfig = () => null;
      
      const interaction = new MockCommandInteraction(mockLongAnalysisChannelId, mockManagerId);

      // Act: Execute the command
      await createbuttonsCommand.execute(interaction as any);

      // Assert: Should return configuration error
      expect(interaction.replied).toBe(true);
      expect(interaction.replyContent).toContain('❌ Bot configuration error - please contact administrator');
      expect(createSymbolButtonsCalls.length).toBe(0);
    });

    test('should handle ephemeral handler initialization error', async () => {
      // Arrange: Mock getBotConfig to return valid config, but break the ephemeral handler
      const managerMessage = new MockMessage(
        'manager-msg-service-error',
        'AAPL / MSFT 📊',
        mockManagerId,
        mockLongAnalysisChannelId
      );

      // Create mock analysis message for indexing (simulates production messageCreate handler)
      const mockAnalysisMessage = {
        id: 'manager-msg-service-error',
        author: { bot: false, id: mockManagerId, tag: 'Manager#1234' },
        content: '$AAPL / $MSFT\nטכני analysis עם ברייקאאוט פריצה מעל מומנטום חזק relative strength ווליום גבוה',
        createdAt: new Date(),
        guildId: 'mock-guild-id',
        channel: { id: mockLongAnalysisChannelId, isThread: () => false },
        member: { displayName: 'Manager' },
        reference: null
      } as any;

      // Index the message first (simulates production messageCreate handler)
      await analysisLinker.indexMessage(mockAnalysisMessage);

      const mockMessages = new Map([['manager-msg-service-error', managerMessage]]);
      const interaction = new MockCommandInteraction(mockLongAnalysisChannelId, mockManagerId, mockMessages);

      // Store original ephemeral handler and set to null to simulate initialization error
      const originalEphemeralHandler = ephemeralHandler;
      createbuttonsCommand.initializeServices(
        discussionChannelHandler,
        symbolDetector,
        null as any, // This will cause the service initialization error
        analysisLinker
      );

      // Act: Execute the command
      await createbuttonsCommand.execute(interaction as any);

      // Assert: Should return service error
      expect(interaction.replied).toBe(true);
      expect(interaction.replyContent).toContain('❌ Service initialization error - please contact administrator');
      expect(createSymbolButtonsCalls.length).toBe(0);

      // Restore services for other tests
      createbuttonsCommand.initializeServices(
        discussionChannelHandler,
        symbolDetector,
        originalEphemeralHandler,
        analysisLinker
      );
    });
  });

  test.describe('Auto-Deletion Behavior', () => {
    test('should call deleteReply after successful button creation', async () => {
      // Arrange: Manager posts symbols
      const managerMessage = new MockMessage(
        'manager-msg-autodelete',
        'AAPL / MSFT 📊',
        mockManagerId,
        mockLongAnalysisChannelId
      );

      // Create mock analysis message for indexing (simulates production messageCreate handler)
      const mockAnalysisMessage = {
        id: 'manager-msg-autodelete',
        author: { bot: false, id: mockManagerId, tag: 'Manager#1234' },
        content: '$AAPL / $MSFT\nטכני analysis עם ברייקאאוט פריצה מעל מומנטום חזק relative strength ווליום גבוה',
        createdAt: new Date(),
        guildId: 'mock-guild-id',
        channel: { id: mockLongAnalysisChannelId, isThread: () => false },
        member: { displayName: 'Manager' },
        reference: null
      } as any;

      // Index the message first (simulates production messageCreate handler)
      await analysisLinker.indexMessage(mockAnalysisMessage);

      const mockMessages = new Map([['manager-msg-autodelete', managerMessage]]);
      const interaction = new MockCommandInteraction(mockLongAnalysisChannelId, mockManagerId, mockMessages);

      // Act: Execute the command and wait for auto-deletion
      await createbuttonsCommand.execute(interaction as any);

      // Wait for the 5-second timeout plus a small buffer
      await new Promise(resolve => setTimeout(resolve, 5100));

      // Assert: Should have called deleteReply
      expect(interaction.deleteReplyCalled).toBe(true);
    });
  });
});