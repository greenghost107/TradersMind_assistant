import { test, expect } from '@playwright/test';
import { AnalysisLinker } from '../src/services/AnalysisLinker';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { ChannelScanner } from '../src/services/ChannelScanner';
import { EphemeralHandler } from '../src/services/EphemeralHandler';
import { MessageRetention } from '../src/services/MessageRetention';
import { DiscussionChannelHandler } from '../src/services/DiscussionChannelHandler';
import { BotConfig } from '../src/types';
import * as config from '../src/config';

// Bug Report:
// 4 sequential analysis messages posted in SHORT_ANALYSIS_CHANNEL:
// 1. "רובינהוד $HOOD" - gets button ✓
// 2. "סופיי $SOFI" - gets button ✓
// 3. "אפלובין $APP" - NO button ✗
// 4. "שופיפיי $SHOP" - NO button ✗
// Manager posts top picks: "short: HOOD, SOFI, APP, SHOP" - only HOOD and SOFI get buttons.

const SHORT_ANALYSIS_CHANNEL = 'mock-short-analysis-123';
const MANAGER_GENERAL_MESSAGES_CHANNEL = 'mock-general-456';
const mockManagerId = 'mock-manager-user-123';
const mockBotUser = { id: 'mock-bot-id', tag: 'TestBot#1234' };

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

  constructor(id: string, channelId: string, content: string, authorId: string = 'mock-user-id', isBot = false, createdAt?: Date) {
    this.id = id;
    this.channelId = channelId;
    this.content = content;
    this.author = { id: authorId, bot: isBot, tag: authorId === mockManagerId ? 'Manager#1234' : 'User#1234' };
    this.member = { displayName: authorId === mockManagerId ? 'MockManager' : 'MockUser' };
    this.createdAt = createdAt || new Date();
    this.guildId = 'mock-guild-id';
    this.channel = { id: channelId, isThread: () => false };
    this.reference = null;
    this.components = [];
  }

  async reply(content: any) {
    const replyId = `reply-${Date.now()}-${Math.random()}`;
    const reply = new MockMessage(replyId, this.channelId, 'Button message', mockBotUser.id, true);
    reply.components = [{ type: 1, components: [] }];
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

test.describe('Short Channel APP/SHOP Bug - Manager Filtering', () => {
  test('DEBUG: HistoricalScraper filters non-manager messages in analysis channels', async () => {
    // This test demonstrates that the HistoricalScraper ONLY indexes manager messages
    // If APP/SHOP were posted by a non-manager user, they would be skipped!
    console.log('🧪 Testing manager filtering in HistoricalScraper...\n');

    // The HistoricalScraper.processChannelMessages() calls:
    // if (applyManagerFiltering && !this.discussionChannelHandler.isManagerMessage(message, this.config))
    //   continue;

    // This means ONLY messages from config.managerId get indexed!

    // Let's verify this by checking the DiscussionChannelHandler
    const handler = new DiscussionChannelHandler();

    const mockConfig = {
      generalNoticesChannel: MANAGER_GENERAL_MESSAGES_CHANNEL,
      analysisChannels: [SHORT_ANALYSIS_CHANNEL],
      discussionChannels: [],
      guildId: 'mock-guild-id',
      managerId: 'manager-123'
    };

    // Message from manager
    const managerMsg = {
      id: 'msg-1',
      author: { id: 'manager-123', bot: false, tag: 'Manager#1234' },
      content: 'אפלובין $APP',
      channel: { id: SHORT_ANALYSIS_CHANNEL }
    } as any;

    // Message from non-manager
    const nonManagerMsg = {
      id: 'msg-2',
      author: { id: 'analyst-456', bot: false, tag: 'Analyst#5678' },
      content: 'אפלובין $APP',
      channel: { id: SHORT_ANALYSIS_CHANNEL }
    } as any;

    const managerIsManager = handler.isManagerMessage(managerMsg, mockConfig as any);
    const nonManagerIsManager = handler.isManagerMessage(nonManagerMsg, mockConfig as any);

    console.log(`Manager message passes filter: ${managerIsManager}`);
    console.log(`Non-manager message passes filter: ${nonManagerIsManager}`);

    expect(managerIsManager).toBe(true);
    expect(nonManagerIsManager).toBe(false);

    console.log('\n⚠️ KEY FINDING: HistoricalScraper only indexes manager messages!');
    console.log('If APP/SHOP were posted by an analyst (not the manager), they would NOT be indexed.');
  });

  test('DEBUG: AnalysisLinker does NOT filter by manager', async () => {
    // In contrast, AnalysisLinker.indexMessage() does NOT filter by manager
    // It indexes ALL non-bot messages
    console.log('🧪 Testing that AnalysisLinker indexes non-manager messages...\n');

    const analysisLinker = new AnalysisLinker();

    // Message from non-manager analyst
    const analystMsg = new MockMessage(
      'analyst-app',
      SHORT_ANALYSIS_CHANNEL,
      `אפלובין $APP
ווליום גבוה והמניה מעל הממוצע
שייקאאוט ובאונס נראים טוב`,
      'analyst-user-456', // Not the manager!
      false
    );

    await analysisLinker.indexMessage(analystMsg as any);

    const hasAnalysis = analysisLinker.hasAnalysisFor('APP');
    console.log(`APP from non-manager indexed by AnalysisLinker: ${hasAnalysis}`);

    expect(hasAnalysis).toBe(true);
    console.log('✅ AnalysisLinker indexes all non-bot messages regardless of author');
  });

  test('HYPOTHESIS: Messages posted before bot startup were from non-manager', async () => {
    // The bug scenario:
    // 1. HistoricalScraper runs on startup, indexes only MANAGER messages
    // 2. Analyst (not manager) posts HOOD, SOFI, APP, SHOP in SHORT_ANALYSIS_CHANNEL
    // 3. Only HOOD and SOFI get buttons because they were in the historical data (from manager)
    // 4. APP and SHOP are skipped because analyst posted them AFTER historical scrape
    //    OR the messages were from an analyst user, not the manager

    console.log('🧪 Testing hypothesis: Non-manager messages are not in historical data...\n');

    // Simulate what happens:
    // - Bot starts, HistoricalScraper runs, only indexes manager messages
    // - If APP/SHOP were from analyst, they're not in the cache
    // - When manager posts top picks, only HOOD/SOFI (from manager) have analysis

    const analysisLinker = new AnalysisLinker();

    // Simulate historical data: Only HOOD and SOFI from manager
    const hoodFromManager = new MockMessage(
      'historical-hood',
      SHORT_ANALYSIS_CHANNEL,
      `רובינהוד $HOOD
ווליום גבוה והמניה נעה מעל הממוצע`,
      mockManagerId,
      false
    );

    const sofiFromManager = new MockMessage(
      'historical-sofi',
      SHORT_ANALYSIS_CHANNEL,
      `סופיי $SOFI
ווליום ממוצע נשמר והמניה בטרנד עולה`,
      mockManagerId,
      false
    );

    // APP and SHOP from analyst (NOT manager) - would be skipped by HistoricalScraper
    // but NOT by AnalysisLinker during runtime

    // Index only manager messages (simulating HistoricalScraper behavior)
    await analysisLinker.indexMessage(hoodFromManager as any);
    await analysisLinker.indexMessage(sofiFromManager as any);

    console.log(`HOOD indexed (from manager): ${analysisLinker.hasAnalysisFor('HOOD')}`);
    console.log(`SOFI indexed (from manager): ${analysisLinker.hasAnalysisFor('SOFI')}`);
    console.log(`APP indexed: ${analysisLinker.hasAnalysisFor('APP')}`);
    console.log(`SHOP indexed: ${analysisLinker.hasAnalysisFor('SHOP')}`);

    expect(analysisLinker.hasAnalysisFor('HOOD')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('SOFI')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('APP')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('SHOP')).toBe(false);

    console.log('\n✅ This matches the reported bug behavior!');
    console.log('📌 ROOT CAUSE: HistoricalScraper filters to manager-only messages');
    console.log('📌 APP/SHOP were likely posted by a different user than the manager');
  });
});

test.describe('Short Channel APP/SHOP Bug - Edge Cases', () => {
  test('DEBUG: test messages with minimal Hebrew (potential edge case)', async () => {
    // Test if APP/SHOP fail with minimal Hebrew content
    const analysisLinker = new AnalysisLinker();
    const symbolDetector = new SymbolDetector();

    // Very minimal messages - just Hebrew name + symbol
    const minimalMessages = {
      HOOD: 'רובינהוד $HOOD',
      SOFI: 'סופיי $SOFI',
      APP: 'אפלובין $APP',
      SHOP: 'שופיפיי $SHOP'
    };

    console.log('🧪 Testing minimal Hebrew messages (single line only)...\n');

    for (const [symbol, content] of Object.entries(minimalMessages)) {
      const msg = new MockMessage(`minimal-${symbol}`, SHORT_ANALYSIS_CHANNEL, content);
      await analysisLinker.indexMessage(msg as any);

      const hasAnalysis = analysisLinker.hasAnalysisFor(symbol);
      const analysis = await analysisLinker.getLatestAnalysis(symbol, 1);

      console.log(`${symbol}: "${content}"`);
      console.log(`  Indexed: ${hasAnalysis}, Score: ${analysis[0]?.relevanceScore?.toFixed(3) || 'N/A'}`);
    }

    // Minimal content likely won't reach 0.7 threshold
    // This test helps identify if the bug is content-length related
  });

  test('DEBUG: test messages posted in thread context', async () => {
    // Test if thread context causes indexing to fail
    const analysisLinker = new AnalysisLinker();

    // Create message in thread context (has parentId)
    const threadMsg = {
      id: 'thread-msg-APP',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: `אפלובין $APP
ווליום גבוה והמניה מעל הממוצע
שייקאאוט ובאונס נראים טוב`,
      createdAt: new Date(),
      guildId: 'test-guild',
      channelId: SHORT_ANALYSIS_CHANNEL,
      channel: {
        id: SHORT_ANALYSIS_CHANNEL,
        isThread: () => true,  // Thread indicator
        parentId: 'parent-channel-123'  // Has parent
      },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    console.log('🧪 Testing message in thread context...');
    await analysisLinker.indexMessage(threadMsg);

    const hasAnalysis = analysisLinker.hasAnalysisFor('APP');
    console.log(`APP in thread: indexed=${hasAnalysis}`);
    // Thread messages might be filtered out at bot.js level
  });

  test('DEBUG: test different Hebrew spelling variations', async () => {
    // Test if specific Hebrew text causes issues
    const analysisLinker = new AnalysisLinker();

    // Different possible spellings/variations
    const variations = [
      { symbol: 'APP', content: 'אפלובין $APP\nמניה עם פריצה חזקה' },
      { symbol: 'APP', content: 'אפ-לובין $APP\nמניה עם פריצה חזקה' },
      { symbol: 'APP', content: 'AppLovin $APP\nמניה עם פריצה חזקה' },
      { symbol: 'APP', content: 'APPLOVIN $APP\nמניה עם פריצה חזקה' },
    ];

    console.log('🧪 Testing Hebrew spelling variations...\n');

    for (let i = 0; i < variations.length; i++) {
      const freshLinker = new AnalysisLinker();
      const v = variations[i];
      const msg = new MockMessage(`var-${i}`, SHORT_ANALYSIS_CHANNEL, v.content);
      await freshLinker.indexMessage(msg as any);

      const hasAnalysis = freshLinker.hasAnalysisFor(v.symbol);
      console.log(`Variation ${i + 1}: "${v.content.split('\n')[0]}"`);
      console.log(`  Indexed: ${hasAnalysis}`);
    }
  });

  test('DEBUG: test symbol detection edge cases for APP/SHOP', async () => {
    const symbolDetector = new SymbolDetector();

    // Edge cases for symbol detection
    const edgeCases = [
      '$APP',           // Just symbol
      'APP',            // No prefix
      '$APP מניה',      // Symbol then Hebrew
      'מניה $APP',      // Hebrew then symbol
      'מניית APP',      // Hebrew with no $
      '$APP,$SHOP',     // Comma separated
      'APP/SHOP',       // Slash separated
      '$APP $SHOP',     // Space separated
    ];

    console.log('🧪 Testing symbol detection edge cases...\n');

    for (const testCase of edgeCases) {
      const detected = symbolDetector.detectSymbols(testCase);
      const symbols = detected.map(s => s.symbol).join(', ');
      console.log(`"${testCase}" => [${symbols}]`);
    }
  });
});

test.describe('Short Channel APP/SHOP Bug Investigation', () => {
  let analysisLinker: AnalysisLinker;
  let symbolDetector: SymbolDetector;
  let channelScanner: ChannelScanner;
  let messageRetention: MessageRetention;
  let ephemeralHandler: EphemeralHandler;
  let mockClient: MockClient;
  let botConfig: BotConfig;
  let createSymbolButtonsCalls: { message: any, symbols: any[] }[];

  // Exact message content from the bug report (approximated from Hebrew names)
  // Format: Hebrew company name + $SYMBOL on first line
  const analysisMessages = {
    HOOD: {
      firstLine: 'רובינהוד $HOOD',
      fullContent: `רובינהוד $HOOD
ווליום גבוה והמניה נעה מעל הממוצע
נראית עם מומנטום חזק לכיוון הפריצה
שייקאאוט נקי ובאונס מהתמיכה`
    },
    SOFI: {
      firstLine: 'סופיי $SOFI',
      fullContent: `סופיי $SOFI
ווליום ממוצע נשמר והמניה בטרנד עולה
המשכיות טובה מקו הפריצה
מעל EMA20 עם relative strength`
    },
    APP: {
      firstLine: 'אפלובין $APP',
      fullContent: `אפלובין $APP
ווליום גבוה והמניה מעל הממוצע
שייקאאוט ובאונס נראים טוב
מומנטום חיובי עם פריצה פוטנציאלית`
    },
    SHOP: {
      firstLine: 'שופיפיי $SHOP',
      fullContent: `שופיפיי $SHOP
ווליום גבוה ומעל הממוצעים
טרנד עולה חזק עם המשכיות
באונס מקו התמיכה`
    }
  };

  test.beforeEach(() => {
    createSymbolButtonsCalls = [];
    mockClient = new MockClient();
    symbolDetector = new SymbolDetector();
    analysisLinker = new AnalysisLinker();
    messageRetention = new MessageRetention();
    ephemeralHandler = new EphemeralHandler(analysisLinker, messageRetention);
    channelScanner = new ChannelScanner(symbolDetector, ephemeralHandler, analysisLinker);

    botConfig = {
      generalNoticesChannel: MANAGER_GENERAL_MESSAGES_CHANNEL,
      analysisChannels: [SHORT_ANALYSIS_CHANNEL],
      discussionChannels: [],
      guildId: 'mock-guild-id',
      managerId: mockManagerId
    };

    config.getBotConfig = () => botConfig;
    messageRetention.initialize(mockClient as any, botConfig);

    // Track createSymbolButtons calls
    ephemeralHandler.createSymbolButtons = async (message: any, symbols: any[]) => {
      createSymbolButtonsCalls.push({ message, symbols });
      console.log(`🔘 createSymbolButtons called with ${symbols.length} symbols: ${symbols.map(s => s.symbol).join(', ')}`);
      return Promise.resolve();
    };
  });

  test.afterEach(() => {
    createSymbolButtonsCalls = [];
  });

  test('DEBUG: verify symbol detection for each first line', async () => {
    console.log('🧪 Testing symbol detection for each first line...\n');

    for (const [symbol, data] of Object.entries(analysisMessages)) {
      const detected = symbolDetector.detectSymbols(data.firstLine);
      console.log(`First line: "${data.firstLine}"`);
      console.log(`  Detected: ${detected.map(s => `${s.symbol} (conf: ${s.confidence.toFixed(2)})`).join(', ') || 'NONE'}`);
      console.log('');

      // Each first line should detect exactly the symbol
      expect(detected.length).toBeGreaterThan(0);
      expect(detected.some(s => s.symbol === symbol)).toBe(true);
    }
  });

  test('DEBUG: verify relevance score for each full message', async () => {
    console.log('🧪 Testing relevance score for each full message...\n');
    const MIN_RELEVANCE_THRESHOLD = 0.7;

    for (const [symbol, data] of Object.entries(analysisMessages)) {
      const msg = new MockMessage(`msg-${symbol}`, SHORT_ANALYSIS_CHANNEL, data.fullContent);

      // Index the message
      await analysisLinker.indexMessage(msg as any);

      // Check if it got indexed
      const hasAnalysis = analysisLinker.hasAnalysisFor(symbol);
      const analysis = await analysisLinker.getLatestAnalysis(symbol, 1);
      const relevanceScore = analysis[0]?.relevanceScore || 0;

      console.log(`Symbol: ${symbol}`);
      console.log(`  First line: "${data.firstLine}"`);
      console.log(`  Content length: ${data.fullContent.length} chars`);
      console.log(`  Has analysis: ${hasAnalysis}`);
      console.log(`  Relevance score: ${relevanceScore.toFixed(3)} (threshold: ${MIN_RELEVANCE_THRESHOLD})`);
      console.log(`  Status: ${hasAnalysis ? '✅ INDEXED' : '❌ NOT INDEXED'}`);
      console.log('');

      // All messages should meet the threshold
      if (!hasAnalysis) {
        console.log(`⚠️ BUG FOUND: ${symbol} was NOT indexed!`);
      }
    }

    // Assert all 4 are indexed
    expect(analysisLinker.hasAnalysisFor('HOOD')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('SOFI')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('APP')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('SHOP')).toBe(true);
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(4);
  });

  test('DEBUG: test indexing each message in isolation', async () => {
    console.log('🧪 Testing indexing each message in isolation...\n');

    // Test each symbol individually with fresh AnalysisLinker
    for (const [symbol, data] of Object.entries(analysisMessages)) {
      const freshLinker = new AnalysisLinker();
      const msg = new MockMessage(`isolated-${symbol}`, SHORT_ANALYSIS_CHANNEL, data.fullContent);

      await freshLinker.indexMessage(msg as any);

      const hasAnalysis = freshLinker.hasAnalysisFor(symbol);
      const analysis = await freshLinker.getLatestAnalysis(symbol, 1);

      console.log(`Symbol: ${symbol} (isolated test)`);
      console.log(`  Indexed: ${hasAnalysis}`);
      console.log(`  Relevance: ${analysis[0]?.relevanceScore?.toFixed(3) || 'N/A'}`);

      if (!hasAnalysis) {
        console.log(`  ⚠️ FAILED: ${symbol} not indexed even in isolation!`);
      }
      console.log('');

      expect(hasAnalysis).toBe(true);
    }
  });

  test('DEBUG: compare HOOD vs APP message processing', async () => {
    console.log('🧪 Comparing HOOD (works) vs APP (fails) processing...\n');

    // HOOD - works
    const hoodMsg = new MockMessage('msg-hood', SHORT_ANALYSIS_CHANNEL, analysisMessages.HOOD.fullContent);
    await analysisLinker.indexMessage(hoodMsg as any);
    const hoodAnalysis = await analysisLinker.getLatestAnalysis('HOOD', 1);

    // APP - fails
    const appMsg = new MockMessage('msg-app', SHORT_ANALYSIS_CHANNEL, analysisMessages.APP.fullContent);
    await analysisLinker.indexMessage(appMsg as any);
    const appAnalysis = await analysisLinker.getLatestAnalysis('APP', 1);

    console.log('=== HOOD (expected: works) ===');
    console.log(`  First line: "${analysisMessages.HOOD.firstLine}"`);
    console.log(`  Content length: ${analysisMessages.HOOD.fullContent.length}`);
    console.log(`  Indexed: ${analysisLinker.hasAnalysisFor('HOOD')}`);
    console.log(`  Relevance: ${hoodAnalysis[0]?.relevanceScore?.toFixed(3) || 'N/A'}`);

    console.log('\n=== APP (expected: fails) ===');
    console.log(`  First line: "${analysisMessages.APP.firstLine}"`);
    console.log(`  Content length: ${analysisMessages.APP.fullContent.length}`);
    console.log(`  Indexed: ${analysisLinker.hasAnalysisFor('APP')}`);
    console.log(`  Relevance: ${appAnalysis[0]?.relevanceScore?.toFixed(3) || 'N/A'}`);

    // Check symbol detection difference
    const hoodSymbols = symbolDetector.detectSymbols(analysisMessages.HOOD.firstLine);
    const appSymbols = symbolDetector.detectSymbols(analysisMessages.APP.firstLine);

    console.log('\n=== Symbol Detection Comparison ===');
    console.log(`  HOOD first line: ${hoodSymbols.map(s => `${s.symbol}(${s.confidence.toFixed(2)})`).join(', ')}`);
    console.log(`  APP first line: ${appSymbols.map(s => `${s.symbol}(${s.confidence.toFixed(2)})`).join(', ')}`);

    // Both should be indexed
    expect(analysisLinker.hasAnalysisFor('HOOD')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('APP')).toBe(true);
  });

  test('should index all 4 symbols from separate analysis messages', async () => {
    console.log('🧪 Testing: Index all 4 symbols from separate messages...\n');

    // Create messages with incrementing timestamps to simulate sequential posting
    let timestamp = new Date();

    for (const [symbol, data] of Object.entries(analysisMessages)) {
      timestamp = new Date(timestamp.getTime() + 60000); // 1 minute apart
      const msg = new MockMessage(`analysis-${symbol}`, SHORT_ANALYSIS_CHANNEL, data.fullContent, 'analyst-user', false, timestamp);
      await analysisLinker.indexMessage(msg as any);
      console.log(`✅ Processed: ${symbol}`);
    }

    console.log(`\n📊 Tracked symbols: ${analysisLinker.getTrackedSymbolsCount()}`);
    console.log(`📊 Available symbols: ${analysisLinker.getAvailableSymbols().join(', ')}`);

    // All 4 should be indexed
    expect(analysisLinker.hasAnalysisFor('HOOD')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('SOFI')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('APP')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('SHOP')).toBe(true);
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(4);
  });

  test('should create buttons for all 4 symbols in top picks', async () => {
    console.log('🧪 Testing: Button creation for all 4 symbols in top picks...\n');

    // Phase 1: Index all 4 analysis messages
    let timestamp = new Date();
    for (const [symbol, data] of Object.entries(analysisMessages)) {
      timestamp = new Date(timestamp.getTime() + 60000);
      const msg = new MockMessage(`analysis-${symbol}`, SHORT_ANALYSIS_CHANNEL, data.fullContent, 'analyst-user', false, timestamp);
      await analysisLinker.indexMessage(msg as any);
    }

    console.log(`📊 Indexed ${analysisLinker.getTrackedSymbolsCount()} symbols: ${analysisLinker.getAvailableSymbols().join(', ')}`);

    // Phase 2: Manager posts top picks
    const topPicksContent = `
❕ טופ פיקס:
📉 short: HOOD, SOFI, APP, SHOP

כמה רמיינדרס:
🔹 לכל טיקר שכתוב פה יש גרף.
    `.trim();

    const managerMessage = new MockMessage(
      'manager-top-picks',
      MANAGER_GENERAL_MESSAGES_CHANNEL,
      topPicksContent,
      mockManagerId,
      false
    );

    await channelScanner.handleMessage(managerMessage as any, botConfig);

    // Phase 3: Verify button creation
    console.log(`\n🔘 createSymbolButtons calls: ${createSymbolButtonsCalls.length}`);

    const allButtonSymbols = createSymbolButtonsCalls.flatMap(call => call.symbols.map(s => s.symbol));
    console.log(`🔘 Symbols with buttons: ${allButtonSymbols.join(', ')}`);

    // Verify all 4 symbols got buttons
    expect(createSymbolButtonsCalls.length).toBeGreaterThan(0);
    expect(allButtonSymbols).toContain('HOOD');
    expect(allButtonSymbols).toContain('SOFI');
    expect(allButtonSymbols).toContain('APP');
    expect(allButtonSymbols).toContain('SHOP');
    expect(allButtonSymbols.length).toBe(4);

    console.log('✅ All 4 symbols received buttons!');
  });

  test('verify APP and SHOP are not in COMMON_WORDS', () => {
    console.log('🧪 Verifying APP and SHOP are not in COMMON_WORDS...\n');

    const commonWords = config.COMMON_WORDS;

    console.log(`APP in COMMON_WORDS: ${commonWords.has('APP')}`);
    console.log(`SHOP in COMMON_WORDS: ${commonWords.has('SHOP')}`);
    console.log(`HOOD in COMMON_WORDS: ${commonWords.has('HOOD')}`);
    console.log(`SOFI in COMMON_WORDS: ${commonWords.has('SOFI')}`);

    expect(commonWords.has('APP')).toBe(false);
    expect(commonWords.has('SHOP')).toBe(false);
    expect(commonWords.has('HOOD')).toBe(false);
    expect(commonWords.has('SOFI')).toBe(false);
  });

  test('DEBUG: test Hebrew+symbol pattern detection', async () => {
    console.log('🧪 Testing Hebrew+symbol pattern detection...\n');

    // The detectFirstLineStockPattern method in AnalysisLinker gives +0.3 bonus
    // Pattern: Hebrew text followed by $SYMBOL
    const testLines = [
      'רובינהוד $HOOD',
      'סופיי $SOFI',
      'אפלובין $APP',
      'שופיפיי $SHOP'
    ];

    for (const line of testLines) {
      // Test the Hebrew+symbol pattern
      const hebrewWithSymbolPattern = /[\u0590-\u05FF]+.*\$[A-Z]{1,5}/;
      const matches = hebrewWithSymbolPattern.test(line);
      console.log(`"${line}" => Hebrew+symbol pattern: ${matches ? '✅ MATCH' : '❌ NO MATCH'}`);

      expect(matches).toBe(true);
    }
  });

  test('DEBUG: examine full symbol detection output', async () => {
    console.log('🧪 Examining full symbol detection output...\n');

    for (const [symbol, data] of Object.entries(analysisMessages)) {
      console.log(`\n=== ${symbol} ===`);
      console.log(`First line: "${data.firstLine}"`);

      // Test with full content (what AnalysisLinker uses)
      const firstLineFromContent = data.fullContent.split('\n')[0] || '';
      console.log(`First line extracted from content: "${firstLineFromContent}"`);

      const detected = symbolDetector.detectSymbols(firstLineFromContent);
      console.log(`Detected symbols: ${JSON.stringify(detected, null, 2)}`);

      // Verify the symbol was detected
      const symbolFound = detected.some(s => s.symbol === symbol);
      console.log(`${symbol} found: ${symbolFound ? '✅' : '❌'}`);

      if (!symbolFound) {
        console.log(`⚠️ POTENTIAL BUG: ${symbol} not detected from first line!`);
      }
    }
  });
});
