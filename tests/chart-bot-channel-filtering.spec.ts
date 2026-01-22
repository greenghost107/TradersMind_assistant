import { test, expect } from '@playwright/test';
import { ChannelScanner } from '../src/services/ChannelScanner';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { AnalysisLinker } from '../src/services/AnalysisLinker';
import { MessageRetention } from '../src/services/MessageRetention';
import { EphemeralHandler } from '../src/services/EphemeralHandler';
import { DiscussionChannelHandler } from '../src/services/DiscussionChannelHandler';
import { BotConfig } from '../src/types';
import * as createbuttonsCommand from '../src/commands/createbuttons';
import * as config from '../src/config';

// Mock Discord components
const mockBotUser = { id: 'mock-bot-id', tag: 'TestBot#1234' };
const mockManagerId = 'mock-manager-user-123';

// Channel IDs for all 4 analysis/discussion channels
const LONG_ANALYSIS_CHANNEL = 'mock-long-analysis-123';
const SHORT_ANALYSIS_CHANNEL = 'mock-short-analysis-456';
const LONG_DISCUSSION_CHANNEL = 'mock-long-discussion-789';
const SHORT_DISCUSSION_CHANNEL = 'mock-short-discussion-012';
const MANAGER_GENERAL_MESSAGES_CHANNEL = 'mock-general-345';

// Mock ChatInputCommandInteraction for /createbuttons
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

    this.channel = {
      id: channelId,
      messages: {
        fetch: async (options: any) => {
          const filteredMessages = mockMessages || new Map();

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
  id: string;
  channelId: string;
  content: string;
  author: any;
  member: any;
  createdAt: Date;
  guildId: string;
  channel: any;
  reference: any;
  components: any[];
  botMessage: boolean;

  constructor(id: string, channelId: string, content: string, authorId: string = 'mock-user-id', isBot = false) {
    this.id = id;
    this.channelId = channelId;
    this.content = content;
    this.author = { id: authorId, bot: isBot, tag: authorId === mockManagerId ? 'Manager#1234' : 'User#1234' };
    this.member = { displayName: authorId === mockManagerId ? 'MockManager' : 'MockUser' };
    this.createdAt = new Date();
    this.guildId = 'mock-guild-id';
    this.channel = { id: channelId, isThread: () => false };
    this.reference = null;
    this.components = [];
    this.botMessage = isBot;
  }

  async reply(content: any) {
    const replyId = `reply-${Date.now()}-${Math.random()}`;
    const reply = new MockMessage(replyId, this.channelId, 'Button message', mockBotUser.id, true);
    reply.components = [{ type: 1, components: [] }];
    console.log(`📤 Mock reply created: ${replyId}`);
    return reply;
  }
}

// Mock Discord client
class MockClient {
  user = mockBotUser;

  isReady() { return true; }
  destroy() { return Promise.resolve(); }

  get channels() {
    return {
      cache: {
        get: (id: string) => ({
          id,
          name: 'mock-channel',
          messages: {
            fetch: async () => ({
              filter: (predicate: any) => [],
              values: () => []
            })
          }
        })
      }
    };
  }
}

test.describe('Chart Bot Channel Filtering', () => {
  let channelScanner: ChannelScanner;
  let symbolDetector: SymbolDetector;
  let analysisLinker: AnalysisLinker;
  let messageRetention: MessageRetention;
  let ephemeralHandler: EphemeralHandler;
  let discussionChannelHandler: DiscussionChannelHandler;
  let mockClient: MockClient;
  let botConfig: BotConfig;
  let createSymbolButtonsCalls: { message: any, symbols: any[] }[];

  // Helper function to create analysis message with Hebrew technical content
  function createAnalysisMessage(
    symbol: string,
    channelId: string,
    messageId: string,
    isHebrew: boolean = true
  ): MockMessage {
    const hebrewContent = `$${symbol}
מניה עם פוטנציאל גבוה לברייקאאוט מעל EMA20
רואים relative strength חזק מול השוק
נפח טוב והמומנטום חיובי
המניה קרובה ל-ATH ויכולה להמשיך
https://chart.example.com/${symbol.toLowerCase()}.png`;

    const englishContent = `$${symbol}
Stock showing strong breakout potential above EMA20
Good relative strength vs market
Strong momentum with good volume
Near ATH with continuation potential
https://chart.example.com/${symbol.toLowerCase()}.png`;

    const content = isHebrew ? hebrewContent : englishContent;
    return new MockMessage(messageId, channelId, content, 'mock-analyst-user');
  }

  // Helper function to create discussion message from manager
  function createDiscussionMessage(
    symbol: string,
    channelId: string,
    messageId: string
  ): MockMessage {
    const content = `${symbol} - מניה מעניינת עם פוטנציאל
רואים מבנה טוב בגרף
כדאי לשים לב להמשכיות
@everyone`;

    return new MockMessage(messageId, channelId, content, mockManagerId, false);
  }

  test.beforeEach(() => {
    // Reset tracking
    createSymbolButtonsCalls = [];

    // Initialize services
    mockClient = new MockClient();
    symbolDetector = new SymbolDetector();
    analysisLinker = new AnalysisLinker();
    messageRetention = new MessageRetention();
    ephemeralHandler = new EphemeralHandler(analysisLinker, messageRetention);
    discussionChannelHandler = new DiscussionChannelHandler();
    channelScanner = new ChannelScanner(symbolDetector, ephemeralHandler, analysisLinker);

    // Setup bot config with all 4 channels
    botConfig = {
      generalNoticesChannel: MANAGER_GENERAL_MESSAGES_CHANNEL,
      analysisChannels: [LONG_ANALYSIS_CHANNEL, SHORT_ANALYSIS_CHANNEL],
      discussionChannels: [LONG_DISCUSSION_CHANNEL, SHORT_DISCUSSION_CHANNEL],
      guildId: 'mock-guild-id',
      managerId: mockManagerId
    };

    // Mock getBotConfig to return our test config
    config.getBotConfig = () => botConfig;

    // Initialize message retention
    messageRetention.initialize(mockClient as any, botConfig);

    // Mock createSymbolButtons to track calls
    ephemeralHandler.createSymbolButtons = async (message: any, symbols: any[]) => {
      createSymbolButtonsCalls.push({ message, symbols });
      console.log(`🔘 createSymbolButtons called with ${symbols.length} symbols: ${symbols.map(s => s.symbol).join(', ')}`);
      return Promise.resolve();
    };

    // Initialize createbuttons command services
    createbuttonsCommand.initializeServices(
      discussionChannelHandler,
      symbolDetector,
      ephemeralHandler
    );

    console.log('🔧 Test setup completed');
  });

  test.afterEach(() => {
    createSymbolButtonsCalls = [];
    console.log('🧹 Test cleanup completed');
  });

  test('should filter buttons to SHORT channels when chart-bot activated in SHORT_ANALYSIS_CHANNEL', async () => {
    console.log('🧪 Starting chart bot SHORT channel filtering test...');

    // Phase 1: Index messages across all 4 channels
    console.log('📋 Phase 1: Indexing analysis messages across all channels');

    // LONG channels - stocks that should NOT appear when filtering for SHORT
    const longAnalysisSymbols = ['AAPL', 'TSLA', 'NVDA'];
    for (const symbol of longAnalysisSymbols) {
      const msg = createAnalysisMessage(symbol, LONG_ANALYSIS_CHANNEL, `long-analysis-${symbol}`, true);
      await analysisLinker.indexMessage(msg as any);
    }
    console.log(`✅ Indexed ${longAnalysisSymbols.length} symbols in LONG_ANALYSIS_CHANNEL`);

    const longDiscussionSymbols = ['MSFT', 'GOOGL'];
    for (const symbol of longDiscussionSymbols) {
      const msg = createDiscussionMessage(symbol, LONG_DISCUSSION_CHANNEL, `long-discussion-${symbol}`);
      await analysisLinker.indexMessage(msg as any);
    }
    console.log(`✅ Indexed ${longDiscussionSymbols.length} symbols in LONG_DISCUSSION_CHANNEL`);

    // SHORT channels - stocks that SHOULD appear when filtering for SHORT
    const shortAnalysisSymbols = ['SPY', 'QQQ', 'SQQQ'];
    for (const symbol of shortAnalysisSymbols) {
      const msg = createAnalysisMessage(symbol, SHORT_ANALYSIS_CHANNEL, `short-analysis-${symbol}`, true);
      await analysisLinker.indexMessage(msg as any);
    }
    console.log(`✅ Indexed ${shortAnalysisSymbols.length} symbols in SHORT_ANALYSIS_CHANNEL`);

    const shortDiscussionSymbols = ['TLT', 'UVXY'];
    for (const symbol of shortDiscussionSymbols) {
      const msg = createDiscussionMessage(symbol, SHORT_DISCUSSION_CHANNEL, `short-discussion-${symbol}`);
      await analysisLinker.indexMessage(msg as any);
    }
    console.log(`✅ Indexed ${shortDiscussionSymbols.length} symbols in SHORT_DISCUSSION_CHANNEL`);

    // Verify all symbols are indexed
    const allSymbols = [...longAnalysisSymbols, ...longDiscussionSymbols, ...shortAnalysisSymbols, ...shortDiscussionSymbols];
    for (const symbol of allSymbols) {
      expect(analysisLinker.hasAnalysisFor(symbol)).toBe(true);
    }
    console.log(`✅ Verified all ${allSymbols.length} symbols are indexed`);

    // Phase 2: Manager posts daily message with top picks from ALL channels
    console.log('📋 Phase 2: Manager posts daily message with mixed top picks');

    const dailyMessageContent = `
מסכם את היום:

❕ טופ פיקס:
📈 long: AAPL, TSLA, NVDA, MSFT, GOOGL
📉 short: SPY, QQQ, SQQQ, TLT, UVXY

כמה רמיינדרס:
🔹 לכל טיקר שכתוב פה יש גרף.
    `.trim();

    const dailyMessage = new MockMessage(
      'manager-daily-msg',
      MANAGER_GENERAL_MESSAGES_CHANNEL,
      dailyMessageContent,
      mockManagerId,
      false
    );

    // Process daily message through channel scanner (creates buttons for ALL with analysis)
    await channelScanner.handleMessage(dailyMessage as any, botConfig);
    console.log('✅ Daily message processed');

    // Verify buttons were created for ALL symbols with analysis
    expect(createSymbolButtonsCalls.length).toBeGreaterThan(0);
    const allButtonSymbols = createSymbolButtonsCalls.flatMap(call => call.symbols.map(s => s.symbol));
    console.log(`📊 Daily message created buttons for: ${allButtonSymbols.join(', ')}`);
    expect(allButtonSymbols.length).toBe(10); // All 10 symbols have analysis

    // Reset calls for next phase
    createSymbolButtonsCalls = [];

    // Phase 3: Manager activates chart-bot in SHORT_ANALYSIS_CHANNEL
    console.log('📋 Phase 3: Manager activates chart-bot in SHORT_ANALYSIS_CHANNEL using /createbuttons');

    // Create a manager message in SHORT_ANALYSIS_CHANNEL that references the top picks
    const shortChannelMessage = new MockMessage(
      'short-channel-chart-request',
      SHORT_ANALYSIS_CHANNEL,
      'SPY / QQQ / SQQQ / TLT / UVXY / AAPL / TSLA 👀', // Mix of SHORT and LONG symbols
      mockManagerId,
      false
    );

    const mockMessages = new Map([[shortChannelMessage.id, shortChannelMessage]]);
    const interaction = new MockCommandInteraction(SHORT_ANALYSIS_CHANNEL, mockManagerId, mockMessages);

    // Execute /createbuttons command in SHORT_ANALYSIS_CHANNEL
    await createbuttonsCommand.execute(interaction as any);

    // Phase 4: Verify only SHORT channel symbols get buttons
    console.log('📋 Phase 4: Verifying filtering to SHORT channels only');

    expect(createSymbolButtonsCalls.length).toBeGreaterThan(0);

    const chartBotButtonSymbols = createSymbolButtonsCalls.flatMap(call =>
      call.symbols.map(s => s.symbol)
    );

    console.log(`🔘 Chart bot created buttons for: ${chartBotButtonSymbols.join(', ')}`);

    // Expected SHORT channel symbols
    const expectedShortSymbols = [...shortAnalysisSymbols, ...shortDiscussionSymbols];

    // Should include SHORT channel symbols
    for (const symbol of expectedShortSymbols) {
      expect(chartBotButtonSymbols).toContain(symbol);
    }
    console.log(`✅ All SHORT channel symbols present: ${expectedShortSymbols.join(', ')}`);

    // Should NOT include LONG channel symbols (AAPL, TSLA, NVDA, MSFT, GOOGL)
    const longSymbolsNotExpected = [...longAnalysisSymbols, ...longDiscussionSymbols];
    for (const symbol of longSymbolsNotExpected) {
      expect(chartBotButtonSymbols).not.toContain(symbol);
    }
    console.log(`✅ LONG channel symbols correctly excluded: ${longSymbolsNotExpected.join(', ')}`);

    // Verify exact count
    expect(chartBotButtonSymbols.length).toBe(expectedShortSymbols.length);
    console.log(`✅ Exact symbol count match: ${chartBotButtonSymbols.length} symbols`);

    console.log('✅ Chart bot SHORT channel filtering test completed successfully!');
  });

  test('should filter buttons to LONG channels when chart-bot activated in LONG_ANALYSIS_CHANNEL', async () => {
    console.log('🧪 Starting chart bot LONG channel filtering test...');

    // Index messages across all channels
    const longAnalysisSymbols = ['AAPL', 'TSLA', 'NVDA'];
    for (const symbol of longAnalysisSymbols) {
      const msg = createAnalysisMessage(symbol, LONG_ANALYSIS_CHANNEL, `long-analysis-${symbol}`);
      await analysisLinker.indexMessage(msg as any);
    }

    const longDiscussionSymbols = ['MSFT', 'GOOGL'];
    for (const symbol of longDiscussionSymbols) {
      const msg = createDiscussionMessage(symbol, LONG_DISCUSSION_CHANNEL, `long-discussion-${symbol}`);
      await analysisLinker.indexMessage(msg as any);
    }

    const shortAnalysisSymbols = ['SPY', 'QQQ'];
    for (const symbol of shortAnalysisSymbols) {
      const msg = createAnalysisMessage(symbol, SHORT_ANALYSIS_CHANNEL, `short-analysis-${symbol}`);
      await analysisLinker.indexMessage(msg as any);
    }

    console.log('✅ Indexed messages in all channels');

    // Manager posts daily message
    const dailyMessageContent = `
❕ טופ פיקס:
📈 long: AAPL, TSLA, NVDA, MSFT, GOOGL
📉 short: SPY, QQQ
    `.trim();

    const dailyMessage = new MockMessage(
      'manager-daily-msg',
      MANAGER_GENERAL_MESSAGES_CHANNEL,
      dailyMessageContent,
      mockManagerId
    );

    await channelScanner.handleMessage(dailyMessage as any, botConfig);
    createSymbolButtonsCalls = []; // Reset

    // Manager activates chart-bot in LONG_ANALYSIS_CHANNEL
    const longChannelMessage = new MockMessage(
      'long-channel-chart-request',
      LONG_ANALYSIS_CHANNEL,
      'AAPL / TSLA / NVDA / MSFT / GOOGL / SPY / QQQ 👀',
      mockManagerId
    );

    const mockMessages = new Map([[longChannelMessage.id, longChannelMessage]]);
    const interaction = new MockCommandInteraction(LONG_ANALYSIS_CHANNEL, mockManagerId, mockMessages);

    await createbuttonsCommand.execute(interaction as any);

    // Verify only LONG channel symbols
    const chartBotButtonSymbols = createSymbolButtonsCalls.flatMap(call =>
      call.symbols.map(s => s.symbol)
    );

    console.log(`🔘 Chart bot created buttons for: ${chartBotButtonSymbols.join(', ')}`);

    const expectedLongSymbols = [...longAnalysisSymbols, ...longDiscussionSymbols];

    for (const symbol of expectedLongSymbols) {
      expect(chartBotButtonSymbols).toContain(symbol);
    }

    for (const symbol of shortAnalysisSymbols) {
      expect(chartBotButtonSymbols).not.toContain(symbol);
    }

    expect(chartBotButtonSymbols.length).toBe(expectedLongSymbols.length);

    console.log('✅ Chart bot LONG channel filtering test completed successfully!');
  });

  test('should include symbols from both ANALYSIS and DISCUSSION channels of same type', async () => {
    console.log('🧪 Testing: both analysis and discussion channels of same type...');

    // Index only in SHORT channels
    const shortAnalysisSymbols = ['SPY', 'QQQ'];
    for (const symbol of shortAnalysisSymbols) {
      const msg = createAnalysisMessage(symbol, SHORT_ANALYSIS_CHANNEL, `short-analysis-${symbol}`);
      await analysisLinker.indexMessage(msg as any);
    }

    const shortDiscussionSymbols = ['SQQQ', 'TLT'];
    for (const symbol of shortDiscussionSymbols) {
      const msg = createDiscussionMessage(symbol, SHORT_DISCUSSION_CHANNEL, `short-discussion-${symbol}`);
      await analysisLinker.indexMessage(msg as any);
    }

    console.log('✅ Indexed in SHORT_ANALYSIS and SHORT_DISCUSSION channels');

    // Activate chart-bot in SHORT_ANALYSIS_CHANNEL
    const shortMessage = new MockMessage(
      'short-request',
      SHORT_ANALYSIS_CHANNEL,
      'SPY / QQQ / SQQQ / TLT 👀',
      mockManagerId
    );

    const mockMessages = new Map([[shortMessage.id, shortMessage]]);
    const interaction = new MockCommandInteraction(SHORT_ANALYSIS_CHANNEL, mockManagerId, mockMessages);

    await createbuttonsCommand.execute(interaction as any);

    const buttonSymbols = createSymbolButtonsCalls.flatMap(call => call.symbols.map(s => s.symbol));

    // Should include symbols from BOTH SHORT_ANALYSIS and SHORT_DISCUSSION
    expect(buttonSymbols).toContain('SPY');   // From SHORT_ANALYSIS
    expect(buttonSymbols).toContain('QQQ');   // From SHORT_ANALYSIS
    expect(buttonSymbols).toContain('SQQQ');  // From SHORT_DISCUSSION
    expect(buttonSymbols).toContain('TLT');   // From SHORT_DISCUSSION

    expect(buttonSymbols.length).toBe(4);

    console.log('✅ Both ANALYSIS and DISCUSSION channels of same type included');
  });

  test('should handle empty results when no matching channel analysis exists', async () => {
    console.log('🧪 Testing: empty results when no matching analysis...');

    // Index only LONG symbols
    const longSymbols = ['AAPL', 'TSLA'];
    for (const symbol of longSymbols) {
      const msg = createAnalysisMessage(symbol, LONG_ANALYSIS_CHANNEL, `long-${symbol}`);
      await analysisLinker.indexMessage(msg as any);
    }

    // Try to activate chart-bot in SHORT_ANALYSIS_CHANNEL
    const shortMessage = new MockMessage(
      'short-request-no-analysis',
      SHORT_ANALYSIS_CHANNEL,
      'SPY / QQQ / SQQQ 👀', // These don't have analysis in SHORT channels
      mockManagerId
    );

    const mockMessages = new Map([[shortMessage.id, shortMessage]]);
    const interaction = new MockCommandInteraction(SHORT_ANALYSIS_CHANNEL, mockManagerId, mockMessages);

    await createbuttonsCommand.execute(interaction as any);

    // Should have no buttons created (or error message about no valid symbols)
    const buttonSymbols = createSymbolButtonsCalls.flatMap(call => call.symbols.map(s => s.symbol));

    expect(buttonSymbols.length).toBe(0);
    expect(interaction.replyContent).toContain('No valid symbols');

    console.log('✅ Correctly handled empty results');
  });
});
