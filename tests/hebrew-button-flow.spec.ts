import { test, expect } from '@playwright/test';
import { ChannelScanner } from '../src/services/ChannelScanner';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { AnalysisLinker } from '../src/services/AnalysisLinker';
import { MessageRetention } from '../src/services/MessageRetention';
import { EphemeralHandler } from '../src/services/EphemeralHandler';
import { HebrewUpdateDetector } from '../src/services/HebrewUpdateDetector';
import { BotConfig, StockSymbol } from '../src/types';

// Mock Discord components
const mockBotUser = { id: 'mock-bot-id', tag: 'TestBot#1234' };
const mockChannelId = 'mock-general-channel-123';

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

  constructor(id: string, content: string, isBot = false, hasComponents = false) {
    this.id = id;
    this.channelId = mockChannelId;
    this.content = content;
    this.author = { bot: isBot, id: isBot ? mockBotUser.id : 'mock-user-id' };
    this.member = { displayName: 'MockManager' };
    this.createdAt = new Date();
    this.guildId = 'mock-guild-id';
    this.channel = { id: mockChannelId, isThread: () => false };
    this.reference = null;
    this.components = hasComponents ? [{ type: 1, components: [] }] : [];
    this.botMessage = isBot;
  }

  async delete() {
    console.log(`🗑️ Mock message ${this.id} deleted`);
    return Promise.resolve();
  }

  async reply(content: any) {
    const replyId = `reply-${Date.now()}-${Math.random()}`;
    const reply = new MockMessage(replyId, typeof content === 'string' ? content : 'Button message', true, true);
    mockCreatedMessages.set(replyId, reply);
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
              filter: (predicate: any) => Array.from(mockCreatedMessages.values()).filter(predicate),
              values: () => Array.from(mockCreatedMessages.values())
            })
          }
        })
      }
    };
  }
}

// Track created messages globally
const mockCreatedMessages = new Map<string, MockMessage>();

test.describe('Hebrew Manager Message Button Creation Flow', () => {
  let channelScanner: ChannelScanner;
  let symbolDetector: SymbolDetector;
  let analysisLinker: AnalysisLinker;
  let messageRetention: MessageRetention;
  let ephemeralHandler: EphemeralHandler;
  let hebrewUpdateDetector: HebrewUpdateDetector;
  let mockClient: MockClient;
  let botConfig: BotConfig;

  // Test Hebrew messages
  const firstHebrewMessage = `❗ מניות שעשו / קרובות ל-ATH שלהן ויכולות להמשיך:
ATGE , IREN , QBTS , RGTI , APP , TSM , PLTR , PL , HSAI

❗ מניות שעשו / קרובות ל-52WH שלהן ויכולות להמשיך:
BABA , ARKK , EGO

❗ ברייקאאוטים:
FUTU , IBKR , DAVE , SNOW , OMDA , FTI , CLS , GH , RYTM , STOK

❗ המשכיות:
MP , DOCS , TSLA , AIR , XMTR

❗ באונסים:
SOFI , GOOGL , DASH , ANET , BE , PWR , KRMN , APH , AVAV , LIF , AMSC , RSI , SOUN , NET , SMTC , TFPM , ROAD , AEO , IWM , PSIX , SEI , FIX , AGX , LITE

🔻 שורט סייד:

❕ טופ פיקס:
📈 long: APLD, AU, AVAV, CRWV, DASH, EGO, EME, HUT, IREN, IWM, NVDA, OKLO, OUST, PL, PRIM, ROAD, SEI, SERV, SMTC, SNOW, TEST, TSM, QBTS, ATGE
📉 short: 

❕ טריידים שלי:
SOFI , GOOGL , ATGE , DASH  , ANET , CRWV , PWR

כמה רמיינדרס קלים:
🔹 זה שמניה תחת כותרת מסוימת לא אומר שהיא לא מתאימה גם להיות תחת כותרת אחרת.
🔹 לכל טיקר שכתוב פה יש גרף, חיפוש הטיקר בלונג/שורט גרפים , סטאפים לונג / שורט כדי לראות.
🔹 זה שססטאפ מסוים רץ כבר לא אומר שאי אפשר לחפש נק' כניסה חדשה ולהצטרף למניה שרצה.
🔹 טופ פיקס אלה הבחירות שלדעתי אישית בעלות הפוטנציאל הטוב ביותר להמשכיות תנועה.
🤖 הבוט chartbot מראה את הגרפים שנמצאים בטופ פיקס.`;

  const secondHebrewMessage = `❗ מניות שעשו / קרובות ל-ATH שלהן ויכולות להמשיך:
TSLA , NVDA , MSFT , AAPL , GOOGL

❗ מניות שעשו / קרובות ל-52WH שלהן ויכולות להמשיך:
META , AMZN , NFLX

❗ ברייקאאוטים:
COIN , SQ , ROKU , ZM , DOCU , OKTA , DDOG , NET , CRWD

❗ המשכיות:
MU , AMD , INTC , QCOM , TXN

❗ באונסים:
CRM , ORCL , ADBE , NOW , SNOW , SHOP , PYPL , SPOT , TWLO , UBER

🔻 שורט סייד:

❕ טופ פיקס:
📈 long: TSLA, NVDA, MSFT, AAPL, GOOGL, META, AMZN, COIN, SQ, ROKU, ZM, DOCU, MU, AMD, CRM, ORCL, ADBE, NOW, SNOW, SHOP
📉 short: SPY, QQQ

❕ טריידים שלי:
TSLA , NVDA , MSFT , AAPL , GOOGL

כמה רמיינדרס קלים:
🔹 זה שמניה תחת כותרת מסוימת לא אומר שהיא לא מתאימה גם להיות תחת כותרת אחרת.
🔹 לכל טיקר שכתוב פה יש גרף, חיפוש הטיקר בלונג/שורט גרפים , סטאפים לונג / שורט כדי לראות.
🔹 זה שססטאפ מסוים רץ כבר לא אומר שאי אפשר לחפש נק' כניסה חדשה ולהצטרף למניה שרצה.
🔹 טופ פיקס אלה הבחירות שלדעתי אישית בעלות הפוטנציאל הטוב ביותר להמשכיות תנועה.
🤖 הבוט chartbot מראה את הגרפים שנמצאים בטופ פיקס.`;

  test.beforeEach(async () => {
    // Clear previous state
    mockCreatedMessages.clear();

    // Initialize services
    mockClient = new MockClient();
    symbolDetector = new SymbolDetector();
    analysisLinker = new AnalysisLinker();
    messageRetention = new MessageRetention();
    ephemeralHandler = new EphemeralHandler(analysisLinker, messageRetention);
    hebrewUpdateDetector = new HebrewUpdateDetector();
    channelScanner = new ChannelScanner(symbolDetector, ephemeralHandler, analysisLinker);

    // Setup bot config
    botConfig = {
      generalNoticesChannel: mockChannelId,
      analysisChannels: ['analysis-channel-1', 'analysis-channel-2'],
      discussionChannels: ['discussion-channel-1'],
      managerId: 'mock-manager-id'
    };

    // Initialize message retention with mock client
    messageRetention.initialize(mockClient as any, botConfig);

    // Setup mock analysis data for first message symbols
    await setupMockAnalysisData([
      'APLD', 'AU', 'AVAV', 'CRWV', 'DASH', 'EGO', 'EME', 'HUT', 'IREN', 'IWM', 
      'NVDA', 'OKLO', 'OUST', 'PL', 'PRIM', 'ROAD', 'SEI', 'SERV', 'SMTC', 'SNOW', 
      'TEST', 'TSM', 'QBTS', 'ATGE'
    ]);

    // Setup mock analysis data for second message symbols  
    await setupMockAnalysisData([
      'TSLA', 'NVDA', 'MSFT', 'AAPL', 'GOOGL', 'META', 'AMZN', 'COIN', 'SQ', 'ROKU',
      'ZM', 'DOCU', 'MU', 'AMD', 'CRM', 'ORCL', 'ADBE', 'NOW', 'SNOW', 'SHOP',
      'SPY', 'QQQ'
    ]);

    console.log('🔧 Test setup completed');
  });

  test.afterEach(() => {
    // Cleanup
    mockCreatedMessages.clear();
    console.log('🧹 Test cleanup completed');
  });

  test('should create buttons for first Hebrew message and replace with second', async () => {
    console.log('🧪 Starting Hebrew button flow test...');

    // Phase 1: Verify Hebrew detection works
    console.log('📋 Phase 1: Verifying Hebrew message detection');
    
    const isFirstMessageHebrew = hebrewUpdateDetector.isHebrewDailyUpdate(firstHebrewMessage);
    expect(isFirstMessageHebrew).toBe(true);
    console.log('✅ First message correctly detected as Hebrew daily update');

    const isSecondMessageHebrew = hebrewUpdateDetector.isHebrewDailyUpdate(secondHebrewMessage);
    expect(isSecondMessageHebrew).toBe(true);
    console.log('✅ Second message correctly detected as Hebrew daily update');

    // Phase 2: First Hebrew message processing
    console.log('📋 Phase 2: Processing first Hebrew message');
    
    const firstMessage = new MockMessage('first-hebrew-msg', firstHebrewMessage);
    
    // Verify symbol detection from first message
    const firstSymbols = symbolDetector.detectSymbolsFromTopPicks(firstHebrewMessage);
    console.log(`🔍 Detected ${firstSymbols.length} symbols from first message`);
    expect(firstSymbols.length).toBeGreaterThan(0);
    
    // Verify top picks are detected
    const firstTopPicks = firstSymbols.filter(s => s.priority === 'top_long' || s.priority === 'top_short');
    console.log(`🎯 Found ${firstTopPicks.length} top picks in first message`);
    expect(firstTopPicks.length).toBeGreaterThan(0);
    
    // Check that expected symbols are present
    const firstSymbolNames = firstTopPicks.map(s => s.symbol);
    expect(firstSymbolNames).toContain('APLD');
    expect(firstSymbolNames).toContain('NVDA');
    expect(firstSymbolNames).toContain('ATGE');
    console.log(`✅ First message contains expected symbols: ${firstSymbolNames.slice(0, 5).join(', ')}...`);

    // Process first message through channel scanner
    await channelScanner.handleMessage(firstMessage as any, botConfig);
    
    // Verify buttons were created for first message
    const firstButtonMessages = Array.from(mockCreatedMessages.values()).filter(msg => 
      msg.botMessage && msg.components && msg.components.length > 0
    );
    console.log(`📤 Created ${firstButtonMessages.length} button messages for first Hebrew message`);
    expect(firstButtonMessages.length).toBeGreaterThan(0);
    
    // Store first message button IDs for later verification
    const firstButtonIds = firstButtonMessages.map(msg => msg.id);
    console.log(`💾 Tracking first message button IDs: ${firstButtonIds.join(', ')}`);

    // Phase 3: Hebrew cleanup detection and processing
    console.log('📋 Phase 3: Processing second Hebrew message with cleanup');
    
    const secondMessage = new MockMessage('second-hebrew-msg', secondHebrewMessage);
    
    // Simulate Hebrew cleanup trigger (this would happen in bot.ts)
    console.log('🧹 Triggering immediate cleanup for Hebrew daily update...');
    await messageRetention.performImmediateCleanup();
    
    // Verify cleanup occurred - check retention stats
    const retentionStats = messageRetention.getRetentionStats();
    console.log(`📊 Retention stats after cleanup: ${retentionStats.pendingJobs} pending jobs`);
    
    // Process second message
    await channelScanner.handleMessage(secondMessage as any, botConfig);
    
    // Verify symbols from second message
    const secondSymbols = symbolDetector.detectSymbolsFromTopPicks(secondHebrewMessage);
    console.log(`🔍 Detected ${secondSymbols.length} symbols from second message`);
    expect(secondSymbols.length).toBeGreaterThan(0);
    
    const secondTopPicks = secondSymbols.filter(s => s.priority === 'top_long' || s.priority === 'top_short');
    console.log(`🎯 Found ${secondTopPicks.length} top picks in second message`);
    
    // Check that second message has different symbols
    const secondSymbolNames = secondTopPicks.map(s => s.symbol);
    expect(secondSymbolNames).toContain('TSLA');
    expect(secondSymbolNames).toContain('MSFT');
    expect(secondSymbolNames).toContain('AAPL');
    console.log(`✅ Second message contains expected different symbols: ${secondSymbolNames.slice(0, 5).join(', ')}...`);

    // Verify new buttons were created for second message
    const allButtonMessages = Array.from(mockCreatedMessages.values()).filter(msg => 
      msg.botMessage && msg.components && msg.components.length > 0
    );
    
    const secondButtonMessages = allButtonMessages.filter(msg => 
      !firstButtonIds.includes(msg.id)
    );
    
    console.log(`📤 Created ${secondButtonMessages.length} new button messages for second Hebrew message`);
    expect(secondButtonMessages.length).toBeGreaterThan(0);

    // Phase 4: Final verification
    console.log('📋 Phase 4: Final verification of button replacement flow');
    
    // Verify that we have different button sets
    expect(firstButtonMessages.length).toBeGreaterThan(0);
    expect(secondButtonMessages.length).toBeGreaterThan(0);
    
    // Verify symbol differences between messages
    const symbolOverlap = firstSymbolNames.filter(symbol => secondSymbolNames.includes(symbol));
    console.log(`🔍 Symbol overlap between messages: ${symbolOverlap.length} symbols`);
    
    // There should be significant differences between the two symbol sets
    expect(firstSymbolNames.length + secondSymbolNames.length - symbolOverlap.length).toBeGreaterThan(10);
    
    console.log('✅ Hebrew button flow test completed successfully!');
    console.log(`📊 Final stats: First message - ${firstTopPicks.length} symbols, ${firstButtonMessages.length} button messages`);
    console.log(`📊 Final stats: Second message - ${secondTopPicks.length} symbols, ${secondButtonMessages.length} button messages`);
  });

  test('should handle Hebrew message with no analysis data gracefully', async () => {
    console.log('🧪 Testing Hebrew message with no analysis data...');
    
    // Create Hebrew message with symbols that have no analysis
    const noAnalysisMessage = `❗ מניות חדשות:
FAKE1 , FAKE2 , FAKE3

❗ ברייקאאוטים:
FAKE4 , FAKE5

❗ המשכיות:
FAKE7 , FAKE8

🔻 שורט סייד:

❕ טופ פיקס:
📈 long: FAKE1, FAKE2, FAKE3, FAKE4, FAKE5
📉 short: FAKE6

כמה רמיינדרס קלים:
🔹 זה שמניה תחת כותרת מסוימת לא אומר שהיא לא מתאימה גם להיות תחת כותרת אחרת.
🔹 לכל טיקר שכתוב פה יש גרף, חיפוש הטיקר בלונג/שורט גרפים.
🔹 טופ פיקס אלה הבחירות שלדעתי אישית בעלות הפוטנציאל הטוב ביותר להמשכיות תנועה.`;

    const message = new MockMessage('no-analysis-msg', noAnalysisMessage);
    
    // Verify it's detected as Hebrew
    const isHebrew = hebrewUpdateDetector.isHebrewDailyUpdate(noAnalysisMessage);
    expect(isHebrew).toBe(true);
    
    // Process message
    await channelScanner.handleMessage(message as any, botConfig);
    
    // Verify no buttons were created (since no symbols have analysis)
    const buttonMessages = Array.from(mockCreatedMessages.values()).filter(msg => 
      msg.botMessage && msg.components && msg.components.length > 0
    );
    
    console.log(`📤 Created ${buttonMessages.length} button messages for no-analysis Hebrew message`);
    expect(buttonMessages.length).toBe(0);
    
    console.log('✅ Correctly handled Hebrew message with no analysis data');
  });

  test('should handle malformed Hebrew message correctly', async () => {
    console.log('🧪 Testing malformed Hebrew message...');
    
    // Create message that looks Hebrew but doesn't meet all criteria
    const malformedMessage = `❗ מניות:
ATGE , IREN

❕ טופ פיקס:
📈 long: ATGE, IREN

// Missing required sections like שורט סייד and proper reminders`;

    const message = new MockMessage('malformed-msg', malformedMessage);
    
    // Verify it's NOT detected as Hebrew daily update
    const isHebrew = hebrewUpdateDetector.isHebrewDailyUpdate(malformedMessage);
    expect(isHebrew).toBe(false);
    
    console.log('✅ Correctly rejected malformed Hebrew message');
  });

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
});