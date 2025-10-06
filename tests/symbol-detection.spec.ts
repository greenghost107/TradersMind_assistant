import { test, expect } from '@playwright/test';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { AnalysisLinker } from '../src/services/AnalysisLinker';
import { TopPicksParser } from '../src/services/TopPicksParser';

test.describe('Symbol Detection', () => {
  let symbolDetector: SymbolDetector;
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    symbolDetector = new SymbolDetector();
    analysisLinker = new AnalysisLinker();
  });

  test('should detect stock symbols in first line of message', () => {
    const message = 'AAPL is showing strong bullish signals\nThis is additional analysis content\nWith more details...';
    const symbols = symbolDetector.detectSymbols(message.split('\n')[0]!);
    
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.symbol).toBe('AAPL');
    expect(symbols[0]!.confidence).toBeGreaterThan(0.5);
  });

  test('should detect multiple symbols in first line', () => {
    const message = 'AAPL TSLA MSFT are all showing positive momentum\nDetailed analysis follows...';
    const symbols = symbolDetector.detectSymbols(message.split('\n')[0]!);
    
    expect(symbols.length).toBeGreaterThanOrEqual(3);
    expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['AAPL', 'TSLA', 'MSFT']));
  });

  test('should filter out common words', () => {
    const message = 'THE QUICK BROWN FOX jumps over AAPL';
    const symbols = symbolDetector.detectSymbols(message);
    
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.symbol).toBe('AAPL');
  });

  test('should boost confidence for $ prefix', () => {
    const message1 = 'AAPL is looking good';
    const message2 = '$AAPL is looking good';
    
    const symbols1 = symbolDetector.detectSymbols(message1);
    const symbols2 = symbolDetector.detectSymbols(message2);
    
    expect(symbols1).toHaveLength(1);
    expect(symbols2).toHaveLength(1);
    expect(symbols2[0]!.confidence).toBeGreaterThan(symbols1[0]!.confidence);
  });

  test('should validate symbol length and format', () => {
    const message = 'A I AAPL MICROSOFT TOOLONG';
    const symbols = symbolDetector.detectSymbols(message);
    
    // Should include A, I (valid single letters), AAPL (valid length)
    // Should exclude MICROSOFT (too long), TOOLONG (too long)
    expect(symbols.length).toBeGreaterThanOrEqual(1);
    expect(symbols.some(s => s.symbol === 'AAPL')).toBe(true);
  });

  test('should detect symbols with emojis in message', () => {
    const message = 'DOCS$ 🤌';
    const symbols = symbolDetector.detectSymbols(message);
    
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.symbol).toBe('DOCS');
    expect(symbols[0]!.confidence).toBeGreaterThan(0.5); // Should have $ prefix boost
  });

  test('should detect symbols mixed with emojis and other characters', () => {
    const message = 'AAPL 📈 TSLA 🚀 MSFT 💻';
    const symbols = symbolDetector.detectSymbols(message);
    
    expect(symbols.length).toBe(3);
    expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['AAPL', 'TSLA', 'MSFT']));
  });

  test('should handle symbols with various Unicode characters nearby', () => {
    const message = '🔥NVDA🔥 💎AMZN💎 ⚡GOOGL⚡';
    const symbols = symbolDetector.detectSymbols(message);
    
    expect(symbols.length).toBe(3);
    expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['NVDA', 'AMZN', 'GOOGL']));
  });

  test('should detect symbols in emoji-rich Discord messages', () => {
    const message = 'Check out AAPL 🍎 and TSLA 🚗 today! Both looking bullish 📊📈';
    const symbols = symbolDetector.detectSymbols(message);
    
    expect(symbols.length).toBe(2);
    expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['AAPL', 'TSLA']));
  });
});

test.describe('Single Letter Symbol Detection', () => {
  let symbolDetector: SymbolDetector;
  let topPicksParser: TopPicksParser;

  test.beforeEach(() => {
    symbolDetector = new SymbolDetector();
    topPicksParser = new TopPicksParser();
  });

  test('should reject single letters by default', () => {
    const message = 'F alone without context';
    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    expect(symbols).toHaveLength(0);
  });

  test('should accept hardcoded single letters A and I', () => {
    const message = 'A and I are valid symbols';
    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    expect(symbols.length).toBeGreaterThanOrEqual(2);
    expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['A', 'I']));
  });

  test('should accept single letters with strong prefix indicators', () => {
    const message = '$F target price updated';
    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    // Should detect F due to $ prefix context
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.symbol).toBe('F');
    expect(symbols[0]!.confidence).toBeGreaterThan(0.7); // High confidence due to $ prefix
  });

  test('should enable context trust in multi-symbol lists', () => {
    const message = 'AAPL, MSFT, F, C are all trending';
    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    // Should detect all symbols including F and C due to context trust
    expect(symbols).toHaveLength(4);
    expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['AAPL', 'MSFT', 'F', 'C']));
  });

  test('should reject single letters embedded in words', () => {
    const message = 'Federal Reserve announcement';
    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    // Should not detect F from "Federal"
    expect(symbols).toHaveLength(0);
  });

  test('should detect single letters in deals format', () => {
    const message = 'MSFT / SHOP / F / C 👀';
    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    // Should detect all symbols due to deals list context
    expect(symbols).toHaveLength(4);
    expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['MSFT', 'SHOP', 'F', 'C']));
  });

  test('should handle Hebrew text with single letter stock symbols', () => {
    const message = 'פורד מוטורס $F✅ slow and steady...';
    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    // Should detect F due to $ prefix
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.symbol).toBe('F');
  });

  test('should detect single letters in top picks context', () => {
    const content = `טופ פיקס:
    📈 long: AAPL, MSFT, F, C
    📉 short: TSLA, NVDA`;
    
    const result = topPicksParser.parseTopPicks(content);
    
    // Should detect all long picks including F and C
    expect(result.longPicks).toHaveLength(4);
    expect(result.longPicks).toEqual(expect.arrayContaining(['AAPL', 'MSFT', 'F', 'C']));
    expect(result.shortPicks).toEqual(expect.arrayContaining(['TSLA', 'NVDA']));
  });

  test('should handle mixed single and multi-letter symbols in top picks', () => {
    const content = `❕ טופ פיקס:
    📈 long: ATGE, MSFT, C, SHOP, SOUN, F
    📉 short: X, SPCE`;
    
    const result = topPicksParser.parseTopPicks(content);
    
    // Should detect all symbols including single letters C, F, X
    expect(result.longPicks).toHaveLength(6);
    expect(result.longPicks).toEqual(expect.arrayContaining(['ATGE', 'MSFT', 'C', 'SHOP', 'SOUN', 'F']));
    expect(result.shortPicks).toHaveLength(2);
    expect(result.shortPicks).toEqual(expect.arrayContaining(['X', 'SPCE']));
  });

  test('should validate context-aware symbol validation method', () => {
    const contextSymbols = ['AAPL', 'MSFT', 'F', 'RANDOM'];
    
    // Multi-letter symbols should use standard validation
    expect(symbolDetector.isValidSymbolWithContext('AAPL', contextSymbols)).toBe(true);
    expect(symbolDetector.isValidSymbolWithContext('TOOLONGTEXT', contextSymbols)).toBe(false);
    
    // Single letter F should be valid due to context (2+ valid symbols present)
    expect(symbolDetector.isValidSymbolWithContext('F', contextSymbols)).toBe(true);
    
    // Single letter without sufficient context should be invalid
    expect(symbolDetector.isValidSymbolWithContext('F', ['ONLY'])).toBe(false);
  });

  test('should handle edge case with only single letters', () => {
    const message = 'F C X alone';
    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    // No multi-letter symbols to provide context, so single letters should be rejected
    expect(symbols).toHaveLength(0);
  });

  test('should detect symbols with various separators', () => {
    const testCases = [
      'AAPL/F/C',
      'AAPL / F / C',
      'AAPL, F, C',
      'AAPL F C',
      'AAPL　F　C', // Full-width space
    ];
    
    testCases.forEach(message => {
      const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
      expect(symbols).toHaveLength(3);
      expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['AAPL', 'F', 'C']));
    });
  });

  test('should handle complex emoji-rich messages with single letters', () => {
    const message = '🔥AAPL🔥 💎F💎 ⚡C⚡ watch these!';
    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    // Should detect all symbols including single letters due to context
    expect(symbols).toHaveLength(3);
    expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['AAPL', 'F', 'C']));
  });

  test('should prioritize $ prefix over context for confidence', () => {
    const message1 = 'AAPL MSFT F'; // Context trust
    const message2 = 'AAPL MSFT $F'; // $ prefix + context
    
    const symbols1 = symbolDetector.detectSymbolsFromAnalysis(message1);
    const symbols2 = symbolDetector.detectSymbolsFromAnalysis(message2);
    
    const fSymbol1 = symbols1.find(s => s.symbol === 'F');
    const fSymbol2 = symbols2.find(s => s.symbol === 'F');
    
    expect(fSymbol1).toBeTruthy();
    expect(fSymbol2).toBeTruthy();
    expect(fSymbol2!.confidence).toBeGreaterThan(fSymbol1!.confidence);
  });

  test('should detect $F in Hebrew analysis message with emoji - Case 1', () => {
    const message = `פורד מוטורס $F✅ 
slow and steady...
✍️ פריצה מבייס של שנה וחודשיים מיולי 2024.`;
    
    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    // Should detect F symbol with high confidence due to $ prefix and Hebrew analysis context
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.symbol).toBe('F');
    expect(symbols[0]!.confidence).toBeGreaterThan(0.8); // High confidence due to $ prefix + Hebrew keywords
  });

  test('should detect $F in Hebrew analysis message - Case 2', () => {
    const message = `פורד מוטורס $F
אינסייד קנדל מהזן ה-juicy לדעתי מעל בייס של שנה וחודשיים מיולי 2024.`;
    
    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    // Should detect F symbol with high confidence due to $ prefix and Hebrew analysis context
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.symbol).toBe('F');
    expect(symbols[0]!.confidence).toBeGreaterThan(0.8); // High confidence due to $ prefix + Hebrew keywords
  });

  test('should handle Hebrew technical analysis keywords for single letters', () => {
    const testCases = [
      { message: 'פריצה $F above resistance', expectedConfidence: 0.8 },
      { message: 'אינסייד קנדל $C formation', expectedConfidence: 0.8 },
      { message: 'בייס $X strong support', expectedConfidence: 0.8 },
    ];
    
    testCases.forEach(({ message, expectedConfidence }) => {
      const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
      expect(symbols).toHaveLength(1);
      expect(symbols[0]!.confidence).toBeGreaterThan(expectedConfidence);
    });
  });

  test('should extract symbols correctly with Unicode emojis and Hebrew text', () => {
    const message = 'Testing $F✅ with emoji and Hebrew פריצה';
    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    // Should detect F despite Unicode emoji
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.symbol).toBe('F');
  });
});

test.describe('Analysis Linking', () => {
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
  });

  test('should create proper message URL format', async () => {
    const mockMessage = {
      id: '123456789',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nThis is analysis content',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    const url = analysisLinker.getLatestAnalysisUrl('AAPL');
    
    expect(url).toBe('https://discord.com/channels/987654321/456789123/123456789');
  });

  test('should extract symbol from first line only', async () => {
    const mockMessage = {
      id: '123456789',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nDetailed analysis content here. This mentions TSLA but it should not be indexed since TSLA is not in the first line.',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.getLatestAnalysisUrl('AAPL')).toBeTruthy();
    expect(analysisLinker.getLatestAnalysisUrl('TSLA')).toBeNull();
  });

  test('should store latest analysis per symbol', async () => {
    const mockMessage1 = {
      id: '111111111',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nFirst analysis',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(Date.now() - 60000), // 1 minute ago
      channel: { id: '456789123' }
    } as any;

    const mockMessage2 = {
      id: '222222222',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nSecond analysis (more recent)',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(), // Now
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockMessage1);
    await analysisLinker.indexMessage(mockMessage2);
    
    const latestUrl = analysisLinker.getLatestAnalysisUrl('AAPL');
    expect(latestUrl).toBe('https://discord.com/channels/987654321/456789123/222222222');
  });

  test('should extract symbols with emojis from first line of analysis', async () => {
    const mockMessage = {
      id: '333333333',
      guildId: '987654321',
      channelId: '456789123',
      content: 'DOCS$ 🤌\nThis is analysis for DOCS with emojis\nSecond line mentions other stocks but should be ignored',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.getLatestAnalysisUrl('DOCS')).toBeTruthy();
    expect(analysisLinker.getLatestAnalysisUrl('DOCS')).toBe('https://discord.com/channels/987654321/456789123/333333333');
  });

  test('should handle multiple symbols with emojis in first line', async () => {
    const mockMessage = {
      id: '444444444',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL 🍎 TSLA 🚗 MSFT 💻\nMultiple tech stocks analysis with emojis',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.getLatestAnalysisUrl('AAPL')).toBeTruthy();
    expect(analysisLinker.getLatestAnalysisUrl('TSLA')).toBeTruthy();
    expect(analysisLinker.getLatestAnalysisUrl('MSFT')).toBeTruthy();
    
    // All should point to the same message
    const urls = ['AAPL', 'TSLA', 'MSFT'].map(symbol => 
      analysisLinker.getLatestAnalysisUrl(symbol)
    );
    expect(urls.every(url => url === 'https://discord.com/channels/987654321/456789123/444444444')).toBe(true);
  });

  test('should initialize from historical data map', async () => {
    const historicalData = new Map();
    
    const analysisData1 = {
      messageId: 'hist1',
      channelId: '111111111',
      authorId: 'analyst1',
      content: 'AAPL\nHistorical Apple analysis',
      symbols: ['AAPL'],
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      relevanceScore: 0.8,
      messageUrl: 'https://discord.com/channels/999/111111111/hist1'
    };
    
    const analysisData2 = {
      messageId: 'hist2',
      channelId: '222222222',
      authorId: 'analyst2',
      content: 'TSLA 🚗\nHistorical Tesla analysis with emoji',
      symbols: ['TSLA'],
      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
      relevanceScore: 0.9,
      messageUrl: 'https://discord.com/channels/999/222222222/hist2'
    };
    
    historicalData.set('AAPL', analysisData1);
    historicalData.set('TSLA', analysisData2);
    
    // Initialize from historical data
    analysisLinker.initializeFromHistoricalData(historicalData);
    
    // Verify data was loaded correctly
    expect(analysisLinker.getLatestAnalysisUrl('AAPL')).toBe('https://discord.com/channels/999/111111111/hist1');
    expect(analysisLinker.getLatestAnalysisUrl('TSLA')).toBe('https://discord.com/channels/999/222222222/hist2');
    
    // Verify getLatestAnalysis also works
    const appleAnalyses = await analysisLinker.getLatestAnalysis('AAPL');
    expect(appleAnalyses).toHaveLength(1);
    expect(appleAnalyses[0]!.content).toBe('AAPL\nHistorical Apple analysis');
    
    const teslaAnalyses = await analysisLinker.getLatestAnalysis('TSLA');
    expect(teslaAnalyses).toHaveLength(1);
    expect(teslaAnalyses[0]!.content).toBe('TSLA 🚗\nHistorical Tesla analysis with emoji');
  });

  test('should clear existing data when initializing from historical data', async () => {
    // First add some data through normal message indexing
    const mockMessage = {
      id: 'existing123',
      guildId: '987654321',
      channelId: '456789123',
      content: 'MSFT\nExisting analysis',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    expect(analysisLinker.getLatestAnalysisUrl('MSFT')).toBeTruthy();
    
    // Now initialize with historical data (should clear existing)
    const historicalData = new Map();
    const analysisData = {
      messageId: 'hist1',
      channelId: '111111111',
      authorId: 'analyst1',
      content: 'AAPL\nHistorical analysis only',
      symbols: ['AAPL'],
      timestamp: new Date(),
      relevanceScore: 0.8,
      messageUrl: 'https://discord.com/channels/999/111111111/hist1'
    };
    
    historicalData.set('AAPL', analysisData);
    analysisLinker.initializeFromHistoricalData(historicalData);
    
    // Old data should be cleared, new data should be loaded
    expect(analysisLinker.getLatestAnalysisUrl('MSFT')).toBeNull();
    expect(analysisLinker.getLatestAnalysisUrl('AAPL')).toBe('https://discord.com/channels/999/111111111/hist1');
  });
});

test.describe('False Positive Detection Prevention', () => {
  let symbolDetector: SymbolDetector;

  test.beforeEach(() => {
    symbolDetector = new SymbolDetector();
  });

  test('Should reject S&P false positive detection', async () => {
    // Hebrew message with S&P reference - should not be indexed
    const hebrewSPMessage = `אינדקסים כמעט ירוקים. איזה יום מדהים, סוחרים נמדדים ברגעים האלה.
שהכל טוב ויפה קל להגיד אני סוחר ביי דה סיסטם.
💎 וכמובן לעד Pro's at the close💎 
לעד amatures ינסו לחזות דברים וצ'מפיונס פשוט יעקבו אחרי הפרייס אקשן.
מדהים. טרייד לייק צ'מפיונס🏆 
לקרוא שוב את ההודעת S&P היומית בבקשה בחדר כללי🙏 
@everyone`;

    const symbols = symbolDetector.detectSymbolsFromAnalysis(hebrewSPMessage);
    
    // Should not detect any symbols (especially not S and P)
    expect(symbols).toHaveLength(0);
    
    // Verify specific symbols are not detected
    const symbolNames = symbols.map(s => s.symbol);
    expect(symbolNames).not.toContain('S');
    expect(symbolNames).not.toContain('P');
  });

  test('Should reject technical analysis terms as false positives', async () => {
    // Hebrew message with technical analysis terms - should not be indexed
    const technicalAnalysisMessage = `משתמש בממוצע אקספוננציאלי רק לממוצע 20, כלומר EMA20 , כחול אצלי בגרפים.
ממוצעים רגילים 50 (ירוק) ו-200 (אדום) , נקרא DMA / SMA / MA --> הכל אותו דבר.

ה-EMA אצלי הוא תמיד רק על ה-20. 
כי זה השורט טרם טרנד, והוא אקספוננציאלי כי הוא נותן עדיפות בחישוב הממוצע לימי המסחר האחרונים וזה מה שאני רוצה לראות בחישוב הממוצע של הטרנד בטווח הקצר.
השאר ה-50/200 הם קבועם ורגילים. אפשר לקרוא להם SMA שזה Simple Moving Average או DMA כמו שאני קורא להם Daily Moving Average.

אני יודע שאתה יודע את זה יוחאי, פשוט למען מי שהצטרף לאחרונה ואולי לא יודע מה כל ממוצע אצלי בגרף`;

    const symbols = symbolDetector.detectSymbolsFromAnalysis(technicalAnalysisMessage);
    
    // Should not detect any symbols (especially not EMA, DMA, SMA, MA)
    expect(symbols).toHaveLength(0);
    
    // Verify specific technical terms are not detected
    const symbolNames = symbols.map(s => s.symbol);
    expect(symbolNames).not.toContain('EMA');
    expect(symbolNames).not.toContain('DMA');
    expect(symbolNames).not.toContain('SMA');
    expect(symbolNames).not.toContain('MA');
  });

  test('Should reject geographic codes as false positives', async () => {
    // Message with geographic reference - should not be indexed
    const geographicMessage = `US Investing Champion
https://x.com/LeifSoreide/status/1974142178168615332`;

    const symbols = symbolDetector.detectSymbolsFromAnalysis(geographicMessage);
    
    // Should not detect any symbols (especially not US)
    expect(symbols).toHaveLength(0);
    
    // Verify US is not detected
    const symbolNames = symbols.map(s => s.symbol);
    expect(symbolNames).not.toContain('US');
  });

  test('Should detect legitimate AU stock symbol', async () => {
    // Hebrew message with AU stock (AngloGold Ashanti) - should be indexed
    const auMessage = `מניית $AU✅
עוד שיא חדש היום לאחר ששברה השבוע את השיא הקודם מאוגוסט 1987🚀 👏
חלק מה-קאפ לארג בתחום הזהב בשבוע הזה.
מקום 36 ברשימת הליידינג ורייד ווינרס.
הנר השנתי שלה מדהים!`;

    const symbols = symbolDetector.detectSymbolsFromAnalysis(auMessage);
    
    // Should detect AU symbol (may also detect other legitimate symbols from the text)
    expect(symbols.length).toBeGreaterThanOrEqual(1);
    expect(symbols.map(s => s.symbol)).toContain('AU');
    const auSymbol = symbols.find(s => s.symbol === 'AU');
    expect(auSymbol).toBeTruthy();
    expect(auSymbol!.confidence).toBeGreaterThan(0.8); // High confidence due to $ prefix + Hebrew keywords
  });

  test('Should detect legitimate IWM ETF symbol', async () => {
    // Hebrew message with IWM ETF (Russell 2000) - should be indexed
    const iwmMessage = `ראסל $IWM ✅
לא סתם אני חופר כל עוד הממוצע נשמר רוכבים.
עושה לנו שיא חדש היום🚀
תנועה מדהימה מאז הפריצה, ריטסט והאינסייד קנדל.
אם זה ייצא לפועל כמו בתחילת 2024 אז התנועה פה רק מתחילה⬇️
⁠כללי🔸⁠
✍️ ברייקאאוט של קו פריצה אלכסון מהשיא -> ירידה לריטסט -> אינסייד קנדל בונה קריירות על קו הפריצה האלכסון מהשיא + הממוצע -> באונס והמשכיות התנועה לבלו סקייס.`;

    const symbols = symbolDetector.detectSymbolsFromAnalysis(iwmMessage);
    
    // Should detect IWM symbol (may also detect other legitimate symbols from the text)
    expect(symbols.length).toBeGreaterThanOrEqual(1);
    expect(symbols.map(s => s.symbol)).toContain('IWM');
    const iwmSymbol = symbols.find(s => s.symbol === 'IWM');
    expect(iwmSymbol).toBeTruthy();
    expect(iwmSymbol!.confidence).toBeGreaterThan(0.8); // High confidence due to $ prefix + Hebrew keywords
  });

  test('Should reject WH technical term as false positive', async () => {
    // Message with WH (week high) technical term - should not be indexed
    const whMessage = `לדעתי כן. הסטאפ שלה יוצא לפועל בצורה נהדרת. דעתי האישית היא בדרך ל-52WH חדש.
עשתה 52WH --> תיקנה ונתמכה ב-AVWAP מהסווינג לואו --> באונס ופריצה יפה של קו הברייקאאוט + AVWAP 52 WH`;

    const symbols = symbolDetector.detectSymbolsFromAnalysis(whMessage);
    
    // Should not detect any symbols (especially not WH)
    expect(symbols).toHaveLength(0);
    
    // Verify WH is not detected
    const symbolNames = symbols.map(s => s.symbol);
    expect(symbolNames).not.toContain('WH');
  });

  test('Regression test: legitimate symbols should still work', async () => {
    // Test that our fixes don't break legitimate cases
    
    // 1. Deals format should still work
    const dealsMessage = 'F / ATGE 👀';
    const dealsSymbols = symbolDetector.detectSymbolsFromAnalysis(dealsMessage);
    expect(dealsSymbols).toHaveLength(2);
    expect(dealsSymbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['F', 'ATGE']));
    
    // 2. Hebrew $F should still work
    const hebrewFMessage = 'פורד מוטורס $F✅ slow and steady...';
    const hebrewFSymbols = symbolDetector.detectSymbolsFromAnalysis(hebrewFMessage);
    expect(hebrewFSymbols).toHaveLength(1);
    expect(hebrewFSymbols[0].symbol).toBe('F');
    
    // 3. Multi-symbol lists should still work
    const multiSymbolMessage = 'AAPL, MSFT, F, C are all trending';
    const multiSymbols = symbolDetector.detectSymbolsFromAnalysis(multiSymbolMessage);
    expect(multiSymbols).toHaveLength(4);
    expect(multiSymbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['AAPL', 'MSFT', 'F', 'C']));
  });
});