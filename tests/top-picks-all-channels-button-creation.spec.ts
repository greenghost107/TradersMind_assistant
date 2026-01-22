import { test, expect } from '@playwright/test';
import { ChannelScanner } from '../src/services/ChannelScanner';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { AnalysisLinker } from '../src/services/AnalysisLinker';
import { MessageRetention } from '../src/services/MessageRetention';
import { EphemeralHandler } from '../src/services/EphemeralHandler';
import { BotConfig } from '../src/types';

// Mock Discord components
const mockBotUser = { id: 'mock-bot-id', tag: 'TestBot#1234' };
const mockManagerId = 'mock-manager-user-123';

// Channel IDs for all 4 analysis/discussion channels
const LONG_ANALYSIS_CHANNEL = 'mock-long-analysis-123';
const SHORT_ANALYSIS_CHANNEL = 'mock-short-analysis-456';
const LONG_DISCUSSION_CHANNEL = 'mock-long-discussion-789';
const SHORT_DISCUSSION_CHANNEL = 'mock-short-discussion-012';
const MANAGER_GENERAL_MESSAGES_CHANNEL = 'mock-general-345';

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
    this.author = { bot: isBot, id: authorId };
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

test.describe('Top Picks All Channels Button Creation', () => {
  let channelScanner: ChannelScanner;
  let symbolDetector: SymbolDetector;
  let analysisLinker: AnalysisLinker;
  let messageRetention: MessageRetention;
  let ephemeralHandler: EphemeralHandler;
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

  // Helper function to setup mock analysis data
  async function setupMockAnalysisData(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      const mockMessage = {
        id: `analysis-${symbol.toLowerCase()}`,
        author: { bot: false, id: 'mock-analyst', tag: 'MockAnalyst#1234' },
        content: `$${symbol}\nמניה עם פוטנציאל לברייקאאוט וניהול סיכונים טוב.`,
        createdAt: new Date(),
        guildId: 'test-guild',
        channel: { id: 'analysis-channel', isThread: () => false },
        member: { displayName: 'MockAnalyst' },
        reference: null
      } as any;

      await analysisLinker.indexMessage(mockMessage);
    }

    console.log(`🗂️ Setup mock analysis data for ${symbols.length} symbols`);
  }

  test.beforeEach(async () => {
    // Reset tracking
    createSymbolButtonsCalls = [];

    // Initialize services
    mockClient = new MockClient();
    symbolDetector = new SymbolDetector();
    analysisLinker = new AnalysisLinker();
    messageRetention = new MessageRetention();
    ephemeralHandler = new EphemeralHandler(analysisLinker, messageRetention);
    channelScanner = new ChannelScanner(symbolDetector, ephemeralHandler, analysisLinker);

    // Setup bot config with all 4 channels
    botConfig = {
      generalNoticesChannel: MANAGER_GENERAL_MESSAGES_CHANNEL,
      analysisChannels: [LONG_ANALYSIS_CHANNEL, SHORT_ANALYSIS_CHANNEL],
      discussionChannels: [LONG_DISCUSSION_CHANNEL, SHORT_DISCUSSION_CHANNEL],
      guildId: 'mock-guild-id',
      managerId: mockManagerId
    };

    // Initialize message retention
    messageRetention.initialize(mockClient as any, botConfig);

    // Mock createSymbolButtons to track calls
    ephemeralHandler.createSymbolButtons = async (message: any, symbols: any[]) => {
      createSymbolButtonsCalls.push({ message, symbols });
      console.log(`🔘 createSymbolButtons called with ${symbols.length} symbols: ${symbols.map(s => s.symbol).join(', ')}`);
      return Promise.resolve();
    };

    console.log('🔧 Test setup completed');
  });

  test.afterEach(() => {
    createSymbolButtonsCalls = [];
    console.log('🧹 Test cleanup completed');
  });

  test('should create buttons for all top picks when analysis exists in all channels', async () => {
    console.log('🧪 Starting main test: all channels button creation...');

    // Phase 1: Index analysis messages across all 4 channels
    console.log('📋 Phase 1: Indexing analysis messages across all channels');

    // Index LONG_ANALYSIS_CHANNEL messages
    const longAnalysisSymbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'META'];
    for (const symbol of longAnalysisSymbols) {
      const msg = createAnalysisMessage(symbol, LONG_ANALYSIS_CHANNEL, `long-analysis-${symbol}`, true);
      await analysisLinker.indexMessage(msg as any);
    }
    console.log(`✅ Indexed ${longAnalysisSymbols.length} symbols in LONG_ANALYSIS_CHANNEL`);

    // Index SHORT_ANALYSIS_CHANNEL messages
    const shortAnalysisSymbols = ['AMZN', 'COIN', 'SQ', 'SPY', 'QQQ'];
    for (const symbol of shortAnalysisSymbols) {
      const msg = createAnalysisMessage(symbol, SHORT_ANALYSIS_CHANNEL, `short-analysis-${symbol}`, true);
      await analysisLinker.indexMessage(msg as any);
    }
    console.log(`✅ Indexed ${shortAnalysisSymbols.length} symbols in SHORT_ANALYSIS_CHANNEL`);

    // Index LONG_DISCUSSION_CHANNEL messages (must be from manager)
    const longDiscussionSymbols = ['ROKU', 'ZM', 'DOCU'];
    for (const symbol of longDiscussionSymbols) {
      const msg = createDiscussionMessage(symbol, LONG_DISCUSSION_CHANNEL, `long-discussion-${symbol}`);
      await analysisLinker.indexMessage(msg as any);
    }
    console.log(`✅ Indexed ${longDiscussionSymbols.length} symbols in LONG_DISCUSSION_CHANNEL`);

    // Index SHORT_DISCUSSION_CHANNEL messages (must be from manager)
    const shortDiscussionSymbols = ['MU', 'AMD', 'INTC'];
    for (const symbol of shortDiscussionSymbols) {
      const msg = createDiscussionMessage(symbol, SHORT_DISCUSSION_CHANNEL, `short-discussion-${symbol}`);
      await analysisLinker.indexMessage(msg as any);
    }
    console.log(`✅ Indexed ${shortDiscussionSymbols.length} symbols in SHORT_DISCUSSION_CHANNEL`);

    // Verify all symbols are indexed
    const allSymbols = [
      ...longAnalysisSymbols,
      ...shortAnalysisSymbols,
      ...longDiscussionSymbols,
      ...shortDiscussionSymbols
    ];
    console.log(`🔍 Verifying all ${allSymbols.length} symbols are indexed...`);
    for (const symbol of allSymbols) {
      const hasAnalysis = analysisLinker.hasAnalysisFor(symbol);
      expect(hasAnalysis).toBe(true);
    }
    console.log('✅ All symbols verified as indexed');

    // Phase 2: Create manager top picks message
    console.log('📋 Phase 2: Creating manager top picks message');

    const topPicksContent = `
מסכם את היום:

❕ טופ פיקס:
📈 long: AAPL, TSLA, NVDA, MSFT, GOOGL, META, AMZN, COIN, ROKU, ZM
📉 short: SPY, QQQ

כמה רמיינדרס:
🔹 זה שמניה תחת כותרת מסוימת לא אומר שהיא לא מתאימה גם להיות תחת כותרת אחרת.
🔹 לכל טיקר שכתוב פה יש גרף.
    `.trim();

    const managerMessage = new MockMessage(
      'manager-top-picks-msg',
      MANAGER_GENERAL_MESSAGES_CHANNEL,
      topPicksContent,
      mockManagerId,
      false
    );

    // Phase 3: Process manager message
    console.log('📋 Phase 3: Processing manager message through channel scanner');
    await channelScanner.handleMessage(managerMessage as any, botConfig);

    // Phase 4: Verify button creation
    console.log('📋 Phase 4: Verifying button creation');

    // Should have called createSymbolButtons
    expect(createSymbolButtonsCalls.length).toBeGreaterThan(0);
    console.log(`✅ createSymbolButtons called ${createSymbolButtonsCalls.length} time(s)`);

    // Extract all button symbols from calls
    const buttonSymbols = createSymbolButtonsCalls.flatMap(call =>
      call.symbols.map(s => s.symbol)
    );
    console.log(`🔘 Total buttons created: ${buttonSymbols.length}`);
    console.log(`🔘 Button symbols: ${buttonSymbols.join(', ')}`);

    // Verify all top picks that have analysis got buttons
    const expectedTopLongSymbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'META', 'AMZN', 'COIN', 'ROKU', 'ZM'];
    const expectedTopShortSymbols = ['SPY', 'QQQ'];
    const expectedAllTopPicks = [...expectedTopLongSymbols, ...expectedTopShortSymbols];

    for (const symbol of expectedAllTopPicks) {
      expect(buttonSymbols).toContain(symbol);
    }
    console.log('✅ All top picks with analysis received buttons');

    // Verify priority assignment
    const allButtonSymbolsWithPriority = createSymbolButtonsCalls.flatMap(call => call.symbols);
    const topLongButtons = allButtonSymbolsWithPriority.filter(s => s.priority === 'top_long');
    const topShortButtons = allButtonSymbolsWithPriority.filter(s => s.priority === 'top_short');

    expect(topLongButtons.length).toBe(expectedTopLongSymbols.length);
    expect(topShortButtons.length).toBe(expectedTopShortSymbols.length);
    console.log(`✅ Priority assignment correct: ${topLongButtons.length} top_long, ${topShortButtons.length} top_short`);

    // Verify symbols from all 4 channels are represented
    const longAnalysisInButtons = buttonSymbols.filter(s => longAnalysisSymbols.includes(s));
    const shortAnalysisInButtons = buttonSymbols.filter(s => shortAnalysisSymbols.includes(s));
    const longDiscussionInButtons = buttonSymbols.filter(s => longDiscussionSymbols.includes(s));
    const shortDiscussionInButtons = buttonSymbols.filter(s => shortDiscussionSymbols.includes(s));

    expect(longAnalysisInButtons.length).toBeGreaterThan(0);
    expect(shortAnalysisInButtons.length).toBeGreaterThan(0);
    expect(longDiscussionInButtons.length).toBeGreaterThan(0);
    // Note: MU, AMD, INTC are in short discussion but not in top picks, so won't have buttons

    console.log(`✅ Symbols from LONG_ANALYSIS: ${longAnalysisInButtons.length}`);
    console.log(`✅ Symbols from SHORT_ANALYSIS: ${shortAnalysisInButtons.length}`);
    console.log(`✅ Symbols from LONG_DISCUSSION: ${longDiscussionInButtons.length}`);

    console.log('✅ Test completed successfully!');
  });

  test('should only create buttons for top picks with existing analysis', async () => {
    console.log('🧪 Testing: only create buttons for symbols with analysis...');

    // Index only SOME of the top pick symbols
    const indexedSymbols = ['AAPL', 'TSLA', 'NVDA', 'SPY'];
    await setupMockAnalysisData(indexedSymbols);
    console.log(`🗂️ Indexed only: ${indexedSymbols.join(', ')}`);

    // Create top picks message with MORE symbols than indexed
    const topPicksContent = `
❕ טופ פיקס:
📈 long: AAPL, TSLA, NVDA, MSFT, GOOGL, META
📉 short: SPY, QQQ
    `.trim();

    const managerMessage = new MockMessage(
      'manager-partial-msg',
      MANAGER_GENERAL_MESSAGES_CHANNEL,
      topPicksContent,
      mockManagerId,
      false
    );

    // Process message
    await channelScanner.handleMessage(managerMessage as any, botConfig);

    // Verify only indexed symbols got buttons
    const buttonSymbols = createSymbolButtonsCalls.flatMap(call =>
      call.symbols.map(s => s.symbol)
    );

    console.log(`🔘 Buttons created for: ${buttonSymbols.join(', ')}`);

    // Should include indexed symbols
    expect(buttonSymbols).toContain('AAPL');
    expect(buttonSymbols).toContain('TSLA');
    expect(buttonSymbols).toContain('NVDA');
    expect(buttonSymbols).toContain('SPY');

    // Should NOT include non-indexed symbols
    expect(buttonSymbols).not.toContain('MSFT');
    expect(buttonSymbols).not.toContain('GOOGL');
    expect(buttonSymbols).not.toContain('META');
    expect(buttonSymbols).not.toContain('QQQ');

    console.log('✅ Correctly filtered to only symbols with analysis');
  });

  test('should handle messages from all channel types', async () => {
    console.log('🧪 Testing: handle messages from all channel types...');

    // Index one symbol from each channel type
    const longAnalysisMsg = createAnalysisMessage('AAPL', LONG_ANALYSIS_CHANNEL, 'msg-1');
    await analysisLinker.indexMessage(longAnalysisMsg as any);

    const shortAnalysisMsg = createAnalysisMessage('SPY', SHORT_ANALYSIS_CHANNEL, 'msg-2');
    await analysisLinker.indexMessage(shortAnalysisMsg as any);

    const longDiscussionMsg = createDiscussionMessage('TSLA', LONG_DISCUSSION_CHANNEL, 'msg-3');
    await analysisLinker.indexMessage(longDiscussionMsg as any);

    const shortDiscussionMsg = createDiscussionMessage('QQQ', SHORT_DISCUSSION_CHANNEL, 'msg-4');
    await analysisLinker.indexMessage(shortDiscussionMsg as any);

    console.log('✅ Indexed one symbol from each channel type');

    // Verify all are indexed
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('SPY')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('TSLA')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('QQQ')).toBe(true);

    // Create top picks with these symbols
    const topPicksContent = `
❕ טופ פיקס:
📈 long: AAPL, TSLA
📉 short: SPY, QQQ
    `.trim();

    const managerMessage = new MockMessage(
      'manager-all-channels-msg',
      MANAGER_GENERAL_MESSAGES_CHANNEL,
      topPicksContent,
      mockManagerId,
      false
    );

    // Process message
    await channelScanner.handleMessage(managerMessage as any, botConfig);

    // Verify buttons created for all
    const buttonSymbols = createSymbolButtonsCalls.flatMap(call =>
      call.symbols.map(s => s.symbol)
    );

    expect(buttonSymbols).toContain('AAPL'); // From LONG_ANALYSIS
    expect(buttonSymbols).toContain('SPY');  // From SHORT_ANALYSIS
    expect(buttonSymbols).toContain('TSLA'); // From LONG_DISCUSSION
    expect(buttonSymbols).toContain('QQQ');  // From SHORT_DISCUSSION

    console.log('✅ All channel types represented in buttons');
  });

  test('should not create buttons when no analysis exists', async () => {
    console.log('🧪 Testing: no buttons when no analysis exists...');

    // Don't index any symbols - fresh analysisLinker

    // Create top picks message
    const topPicksContent = `
❕ טופ פיקס:
📈 long: AAPL, TSLA, NVDA
📉 short: SPY
    `.trim();

    const managerMessage = new MockMessage(
      'manager-no-analysis-msg',
      MANAGER_GENERAL_MESSAGES_CHANNEL,
      topPicksContent,
      mockManagerId,
      false
    );

    // Process message
    await channelScanner.handleMessage(managerMessage as any, botConfig);

    // Verify NO buttons were created
    expect(createSymbolButtonsCalls.length).toBe(0);
    console.log('✅ Correctly created no buttons when no analysis exists');
  });

  test('should handle top picks with mix of indexed and non-indexed symbols', async () => {
    console.log('🧪 Testing: mix of indexed and non-indexed symbols...');

    // Index symbols from different channels
    const msg1 = createAnalysisMessage('AAPL', LONG_ANALYSIS_CHANNEL, 'msg-1');
    await analysisLinker.indexMessage(msg1 as any);

    const msg2 = createAnalysisMessage('NVDA', SHORT_ANALYSIS_CHANNEL, 'msg-2');
    await analysisLinker.indexMessage(msg2 as any);

    const msg3 = createDiscussionMessage('ROKU', LONG_DISCUSSION_CHANNEL, 'msg-3');
    await analysisLinker.indexMessage(msg3 as any);

    console.log('✅ Indexed: AAPL, NVDA, ROKU');

    // Create top picks with mix
    const topPicksContent = `
❕ טופ פיקס:
📈 long: AAPL, TSLA, NVDA, MSFT, ROKU, ZM
📉 short: SPY, QQQ
    `.trim();

    const managerMessage = new MockMessage(
      'manager-mix-msg',
      MANAGER_GENERAL_MESSAGES_CHANNEL,
      topPicksContent,
      mockManagerId,
      false
    );

    // Process message
    await channelScanner.handleMessage(managerMessage as any, botConfig);

    // Verify only indexed symbols got buttons
    const buttonSymbols = createSymbolButtonsCalls.flatMap(call =>
      call.symbols.map(s => s.symbol)
    );

    console.log(`🔘 Buttons: ${buttonSymbols.join(', ')}`);

    // Should have indexed symbols
    expect(buttonSymbols).toContain('AAPL');
    expect(buttonSymbols).toContain('NVDA');
    expect(buttonSymbols).toContain('ROKU');

    // Should not have non-indexed symbols
    expect(buttonSymbols).not.toContain('TSLA');
    expect(buttonSymbols).not.toContain('MSFT');
    expect(buttonSymbols).not.toContain('ZM');
    expect(buttonSymbols).not.toContain('SPY');
    expect(buttonSymbols).not.toContain('QQQ');

    expect(buttonSymbols.length).toBe(3);
    console.log('✅ Correctly created buttons only for indexed symbols');
  });
});
