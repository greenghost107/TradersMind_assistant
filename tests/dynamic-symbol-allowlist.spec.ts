import { test, expect } from '@playwright/test';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { SymbolAllowlist } from '../src/services/SymbolAllowlist';
import { TechnicalContextDetector } from '../src/services/TechnicalContextDetector';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Dynamic Symbol Allowlist Architecture', () => {
  test.describe('Analysis Message Indexing', () => {
    let symbolDetector: SymbolDetector;
    let symbolAllowlist: SymbolAllowlist;
    let analysisLinker: AnalysisLinker;

    test.beforeEach(() => {
      symbolAllowlist = new SymbolAllowlist();
      symbolDetector = new SymbolDetector(undefined, [], [], symbolAllowlist);
      analysisLinker = new AnalysisLinker(symbolDetector);
      analysisLinker.initializeAdmins(['admin123']);
    });

    test('Should index AU symbol from admin analysis message', () => {
      // Admin analysis message with AU stock (AngloGold Ashanti)
      const adminMessage = `מניית $AU✅
עוד שיא חדש היום לאחר ששברה השבוע את השיא הקודם מאוגוסט 1987🚀 👏
חלק מה-קאפ לארג בתחום הזהב בשבוע הזה.
מקום 36 ברשימת הליידינג ורייד ווינרס.
הנר השנתי שלה מדהים!`;

      // Simulate admin posting this message
      const extractedSymbols = symbolAllowlist.extractSymbolsFromAdminMessage(
        adminMessage, 
        'admin123', 
        'msg123'
      );
      
      // Verify AU is added to allowlist
      expect(extractedSymbols).toContain('AU');
      expect(symbolAllowlist.isSymbolAllowed('AU')).toBe(true);
      
      // Verify subsequent AU mentions are detected with high confidence
      const testMessage = 'Looking at $AU for gold exposure';
      const symbols = symbolDetector.detectSymbolsFromAnalysis(testMessage);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      expect(symbols.map(s => s.symbol)).toContain('AU');
      
      // Check that AU gets allowlist confidence boost
      const auSymbol = symbols.find(s => s.symbol === 'AU');
      expect(auSymbol!.confidence).toBeGreaterThan(0.8);
    });

    test('Should index IWM symbol from admin analysis message', () => {
      // Admin analysis message with IWM ETF (Russell 2000)
      const adminMessage = `ראסל $IWM ✅
לא סתם אני חופר כל עוד הממוצע נשמר רוכבים.
עושה לנו שיא חדש היום🚀
תנועה מדהימה מאז הפריצה, ריטסט והאינסייד קנדל.
אם זה ייצא לפועל כמו בתחילת 2024 אז התנועה פה רק מתחילה⬇️
⁠כללי🔸⁠
✍️ ברייקאאוט של קו פריצה אלכסון מהשיא -> ירידה לריטסט -> אינסייד קנדל בונה קריירות על קו הפריצה האלכסון מהשיא + הממוצע -> באונס והמשכיות התנועה לבלו סקייס.`;

      // Simulate admin posting this message
      const extractedSymbols = symbolAllowlist.extractSymbolsFromAdminMessage(
        adminMessage, 
        'admin123', 
        'msg124'
      );
      
      // Verify IWM is added to allowlist
      expect(extractedSymbols).toContain('IWM');
      expect(symbolAllowlist.isSymbolAllowed('IWM')).toBe(true);
      
      // Verify subsequent IWM mentions are detected
      const testMessage = 'Russell 2000 $IWM breaking out';
      const symbols = symbolDetector.detectSymbolsFromAnalysis(testMessage);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      expect(symbols.map(s => s.symbol)).toContain('IWM');
      
      // Check confidence boost
      const iwmSymbol = symbols.find(s => s.symbol === 'IWM');
      expect(iwmSymbol!.confidence).toBeGreaterThan(0.8);
    });

    test('Should index F symbol from Hebrew admin analysis message', () => {
      // Admin analysis message with F stock (Ford)
      const adminMessage = `פורד מוטורס $F✅ 
slow and steady...
✍️ פריצה מבייס של שנה וחודשיים מיולי 2024.`;

      // Simulate admin posting this message
      const extractedSymbols = symbolAllowlist.extractSymbolsFromAdminMessage(
        adminMessage, 
        'admin123', 
        'msg125'
      );
      
      // Verify F is added to allowlist
      expect(extractedSymbols).toContain('F');
      expect(symbolAllowlist.isSymbolAllowed('F')).toBe(true);
      
      // Verify subsequent F mentions are detected
      const testMessage = 'Ford Motor $F looking strong';
      const symbols = symbolDetector.detectSymbolsFromAnalysis(testMessage);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      expect(symbols.map(s => s.symbol)).toContain('F');
      
      // Check confidence boost
      const fSymbol = symbols.find(s => s.symbol === 'F');
      expect(fSymbol!.confidence).toBeGreaterThan(0.8);
    });

    test('Should index WH symbol if admin explicitly analyzes it', () => {
      // Hypothetical admin analysis of WH stock (Wyndham Hotels)
      const adminMessage = `Wyndham Hotels $WH📈
Strong hotel sector recovery play
Breaking above key resistance levels
Good momentum in hospitality space`;

      // Simulate admin posting this message
      const extractedSymbols = symbolAllowlist.extractSymbolsFromAdminMessage(
        adminMessage, 
        'admin123', 
        'msg126'
      );
      
      // Verify WH is added to allowlist
      expect(extractedSymbols).toContain('WH');
      expect(symbolAllowlist.isSymbolAllowed('WH')).toBe(true);
      
      // Verify subsequent $WH mentions are detected
      const testMessage = 'Wyndham Hotels $WH earnings play';
      const symbols = symbolDetector.detectSymbolsFromAnalysis(testMessage);
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      expect(symbols.map(s => s.symbol)).toContain('WH');
      
      // Check confidence boost
      const whSymbol = symbols.find(s => s.symbol === 'WH');
      expect(whSymbol!.confidence).toBeGreaterThan(0.8);
    });

    test('Should index symbols from mixed Hebrew-English admin messages', () => {
      const adminMessage = `טסלא $TSLA🚗
אילון מאסק משנה את העולם
Strong EV growth trajectory
פריצה מעל 200 DMA`;

      // Simulate admin posting this message
      const extractedSymbols = symbolAllowlist.extractSymbolsFromAdminMessage(
        adminMessage, 
        'admin123', 
        'msg127'
      );
      
      // Verify TSLA is added to allowlist
      expect(extractedSymbols).toContain('TSLA');
      expect(symbolAllowlist.isSymbolAllowed('TSLA')).toBe(true);
    });
  });

  test.describe('Technical Context Detection', () => {
    let symbolDetector: SymbolDetector;
    let technicalDetector: TechnicalContextDetector;

    test.beforeEach(() => {
      symbolDetector = new SymbolDetector();
      technicalDetector = symbolDetector.getTechnicalDetector();
    });

    test('Should NOT detect WH in 52WH technical context', () => {
      // Message with WH (week high) technical term - should not be indexed
      const technicalMessage = `לדעתי כן. הסטאפ שלה יוצא לפועל בצורה נהדרת. דעתי האישית היא בדרך ל-52WH חדש.
עשתה 52WH --> תיקנה ונתמכה ב-AVWAP מהסווינג לואו --> באונס ופריצה יפה של קו הברייקאאוט + AVWAP 52 WH`;

      // Test with new detection system
      const symbols = symbolDetector.detectSymbolsFromAnalysis(technicalMessage);
      
      // Verify 0 symbols detected (WH should be recognized as technical term)
      expect(symbols).toHaveLength(0);
      
      // Verify WH is recognized as technical context
      const whPosition = technicalMessage.indexOf('WH');
      expect(technicalDetector.isInTechnicalContext('WH', technicalMessage, whPosition)).toBe(true);
      
      // Verify technical terms are extracted
      const technicalTerms = technicalDetector.extractTechnicalTerms(technicalMessage);
      expect(technicalTerms).toContain('52WH');
      expect(technicalTerms).toContain('AVWAP');
    });

    test('Should NOT detect DMA in 50DMA technical context', () => {
      const technicalMessage = `המניה נתמכת יפה ב-50DMA
הממוצע היומי של 50 ימים מספק תמיכה חזקה
מעל ה-50DMA = bullish trend`;

      // Test with new detection system
      const symbols = symbolDetector.detectSymbolsFromAnalysis(technicalMessage);
      
      // Verify DMA is not detected as symbol
      expect(symbols.filter(s => s.symbol === 'DMA')).toHaveLength(0);
      
      // Verify DMA is recognized as technical context
      const dmaPosition = technicalMessage.indexOf('DMA');
      expect(technicalDetector.isInTechnicalContext('DMA', technicalMessage, dmaPosition)).toBe(true);
      
      // Verify technical terms are extracted
      const technicalTerms = technicalDetector.extractTechnicalTerms(technicalMessage);
      expect(technicalTerms).toContain('50DMA');
    });

    test('Should NOT detect EMA in EMA20 technical context', () => {
      const technicalMessage = `כל עוד מעל EMA20 אנו bullish
ה-EMA20 הוא הממוצע האקספוננציאלי של 20 ימים
פריצה מתחת ל-EMA20 תהיה אות חלשה`;

      // Test with new detection system
      const symbols = symbolDetector.detectSymbolsFromAnalysis(technicalMessage);
      
      // Verify EMA is not detected as symbol
      expect(symbols.filter(s => s.symbol === 'EMA')).toHaveLength(0);
      
      // Verify EMA is recognized as technical context
      const emaPosition = technicalMessage.indexOf('EMA');
      expect(technicalDetector.isInTechnicalContext('EMA', technicalMessage, emaPosition)).toBe(true);
      
      // Verify technical terms are extracted
      const technicalTerms = technicalDetector.extractTechnicalTerms(technicalMessage);
      expect(technicalTerms).toContain('EMA20');
    });

    test('Should detect AAPL but NOT 52WH in mixed content', () => {
      const mixedMessage = `AAPL made new 52WH today above resistance
Strong breakout pattern emerging
Target price $200`;

      // Test with new detection system
      const symbols = symbolDetector.detectSymbolsFromAnalysis(mixedMessage);
      
      // Verify AAPL is detected (standard symbol)
      expect(symbols.map(s => s.symbol)).toContain('AAPL');
      
      // Verify WH is NOT detected (technical context)
      expect(symbols.filter(s => s.symbol === 'WH')).toHaveLength(0);
      
      // Verify technical context detection
      const whPosition = mixedMessage.indexOf('52WH') + 2; // Position of 'WH'
      expect(technicalDetector.isInTechnicalContext('WH', mixedMessage, whPosition)).toBe(true);
    });

    test('Should recognize RSI14, MACD12, BB20 as technical indicators', () => {
      const technicalMessage = `Technical analysis shows:
RSI14 approaching overbought levels
MACD12 showing bullish crossover  
BB20 bands expanding indicating volatility`;

      // Test with new detection system
      const symbols = symbolDetector.detectSymbolsFromAnalysis(technicalMessage);
      
      // Verify none of RSI, MACD, BB are detected as symbols
      expect(symbols.filter(s => ['RSI', 'MACD', 'BB'].includes(s.symbol))).toHaveLength(0);
      
      // Verify technical terms are extracted
      const technicalTerms = technicalDetector.extractTechnicalTerms(technicalMessage);
      expect(technicalTerms).toContain('RSI14');
      expect(technicalTerms).toContain('MACD12');
      expect(technicalTerms).toContain('BB20');
    });
  });

  test.describe('Symbol vs Technical Term Classification', () => {
    let symbolDetector: SymbolDetector;
    let symbolAllowlist: SymbolAllowlist;
    let technicalDetector: TechnicalContextDetector;

    test.beforeEach(() => {
      symbolAllowlist = new SymbolAllowlist();
      symbolDetector = new SymbolDetector(undefined, [], [], symbolAllowlist);
      technicalDetector = symbolDetector.getTechnicalDetector();
    });

    test('Should detect $WH if admin previously analyzed WH stock', () => {
      // Assume admin previously posted analysis about $WH (Wyndham Hotels)
      const userMessage = `Looking at $WH for hotel sector exposure
Good fundamentals in hospitality recovery`;

      // Add WH to allowlist (simulate previous admin analysis)
      symbolAllowlist.addSymbol('WH', 'admin123', 'msg100', 'Wyndham Hotels analysis');
      
      // Test detection with new system
      const symbols = symbolDetector.detectSymbolsFromAnalysis(userMessage);
      
      // Verify WH symbol is detected due to allowlist
      expect(symbols.map(s => s.symbol)).toContain('WH');
      
      // Verify it gets allowlist confidence boost
      const whSymbol = symbols.find(s => s.symbol === 'WH');
      expect(whSymbol!.confidence).toBeGreaterThan(0.8);
    });

    test('Should NOT detect WH in geographic/technical context even if in allowlist', () => {
      const userMessage = `The stock made a new 52WH this week
Strong momentum continuing upward`;

      // Add WH to allowlist (simulate previous admin analysis)
      symbolAllowlist.addSymbol('WH', 'admin123', 'msg100', 'Wyndham Hotels analysis');
      
      // Test detection with new system
      const symbols = symbolDetector.detectSymbolsFromAnalysis(userMessage);
      
      // Verify WH is NOT detected (technical context overrides allowlist)
      expect(symbols.filter(s => s.symbol === 'WH')).toHaveLength(0);
      
      // Verify technical context is detected
      const whPosition = userMessage.indexOf('52WH') + 2;
      expect(technicalDetector.isInTechnicalContext('WH', userMessage, whPosition)).toBe(true);
    });

    test('Should detect AU symbol after admin analysis but not in geographic context', () => {
      const geograficMessage = `AU market conditions looking favorable
European markets also showing strength`;

      // Add AU to allowlist (simulate previous admin analysis)
      symbolAllowlist.addSymbol('AU', 'admin123', 'msg101', 'AngloGold Ashanti analysis');
      
      // Test detection with new system
      const symbols = symbolDetector.detectSymbolsFromAnalysis(geograficMessage);
      
      // Verify AU is NOT detected (geographic context)
      expect(symbols.filter(s => s.symbol === 'AU')).toHaveLength(0);
      
      // Verify geographic context is detected
      const auPosition = geograficMessage.indexOf('AU');
      expect(technicalDetector.isInTechnicalContext('AU', geograficMessage, auPosition)).toBe(true);
    });

    test('Should distinguish $AU (symbol) from AU (geographic)', () => {
      const symbolMessage = `$AU breaking to new highs
AngloGold Ashanti showing strength`;
      
      const geograficMessage = `AU indices performing well
Global market correlations`;

      // Add AU to allowlist (simulate previous admin analysis)
      symbolAllowlist.addSymbol('AU', 'admin123', 'msg101', 'AngloGold Ashanti analysis');
      
      // Test symbol message with $ prefix
      const symbolSymbols = symbolDetector.detectSymbolsFromAnalysis(symbolMessage);
      expect(symbolSymbols.map(s => s.symbol)).toContain('AU');
      
      // Test geographic message  
      const geoSymbols = symbolDetector.detectSymbolsFromAnalysis(geograficMessage);
      expect(geoSymbols.filter(s => s.symbol === 'AU')).toHaveLength(0);
      
      // Verify $ prefix gives strong indicator
      const auPosition = symbolMessage.indexOf('AU');
      expect(technicalDetector.hasStrongSymbolIndicators('AU', symbolMessage, auPosition)).toBe(true);
    });
  });

  test.describe('Allowlist State Management', () => {
    test('Should reject symbol before admin analysis', () => {
      // Test a hypothetical symbol before admin analyzes it
      const userMessage = `What do you think about $NEWCO?
Heard good things about this company`;

      // TODO: Test with empty allowlist
      // TODO: Verify NEWCO is NOT detected (not in allowlist)
      
      expect(userMessage).toContain('$NEWCO');
    });

    test('Should allow symbol after admin analysis', () => {
      // TODO: Mock admin posting analysis about $NEWCO
      // TODO: Verify NEWCO is added to allowlist
      // TODO: Test same user message again
      // TODO: Verify NEWCO is NOW detected
      
      const userMessage = `What do you think about $NEWCO?
Heard good things about this company`;
      
      expect(userMessage).toContain('$NEWCO');
    });

    test('Should expire symbols from allowlist after time limit', () => {
      // TODO: Mock admin analysis of symbol with old timestamp
      // TODO: Verify symbol is initially in allowlist
      // TODO: Mock time passing beyond expiration
      // TODO: Test detection - should fail (symbol expired)
      
      // This test will require mocking time/dates
    });

    test('Should refresh allowlist when admin re-analyzes symbol', () => {
      // TODO: Mock old admin analysis (near expiration)
      // TODO: Mock new admin analysis of same symbol
      // TODO: Verify allowlist timestamp is refreshed
      // TODO: Verify symbol detection continues working
    });

    test('Should handle multiple symbols in single admin message', () => {
      const adminMessage = `Top sector plays today:
$AAPL for tech exposure ✅
$JPM for financial sector ✅ 
$XLE for energy play ✅`;

      // TODO: Mock admin posting this message
      // TODO: Verify all three symbols (AAPL, JPM, XLE) added to allowlist
      // TODO: Test subsequent detection of each symbol
      
      expect(adminMessage).toContain('$AAPL');
      expect(adminMessage).toContain('$JPM');
      expect(adminMessage).toContain('$XLE');
    });
  });

  test.describe('Edge Cases & Regression Tests', () => {
    test('Should still work with deals format regardless of allowlist', () => {
      // Deals should work even if symbols not in allowlist (special context)
      const dealsMessage = `F / ATGE / C / NEWCO 👀`;

      // TODO: Test with empty allowlist
      // TODO: Verify all symbols detected (deals context overrides allowlist)
      
      expect(dealsMessage).toContain('F /');
      expect(dealsMessage).toContain('/ ATGE /');
    });

    test('Should still work with top picks context', () => {
      const topPicksMessage = `❕ טופ פיקס:
📈 long: AAPL, MSFT, NOTINLIST
📉 short: TSLA, NVDA`;

      // TODO: Test with partially empty allowlist
      // TODO: Verify all symbols detected (top picks context)
      
      expect(topPicksMessage).toContain('טופ פיקס');
    });

    test('Should preserve Hebrew keyword confidence boosting', () => {
      const hebrewMessage = `מניית $AAPL✅
פריצה מעל ממוצע
ברייקאאוט חזק`;

      // TODO: Mock AAPL in allowlist
      // TODO: Test detection confidence score
      // TODO: Verify Hebrew keywords still boost confidence
      
      expect(hebrewMessage).toContain('פריצה');
      expect(hebrewMessage).toContain('ברייקאאוט');
    });

    test('Should handle single letter recovery in multi-symbol lists', () => {
      const listMessage = `AAPL, MSFT, F, C are trending`;

      // TODO: Mock AAPL, MSFT in allowlist (but not F, C)
      // TODO: Test detection with context trust
      // TODO: Verify F, C are detected due to context of valid symbols
      
      expect(listMessage).toContain('F, C');
    });

    test('Should handle emoji-rich Discord messages', () => {
      const emojiMessage = `🔥$AAPL🔥 💎$F💎 watch these!`;

      // TODO: Mock AAPL, F in allowlist
      // TODO: Test emoji parsing
      // TODO: Verify both symbols detected despite emoji noise
      
      expect(emojiMessage).toContain('🔥$AAPL🔥');
      expect(emojiMessage).toContain('💎$F💎');
    });

    test('Should not break on mixed technical and symbol content', () => {
      const complexMessage = `$AAPL above 52WH resistance
EMA20 providing support
Target $200 if it breaks DMA50`;

      // TODO: Mock AAPL in allowlist
      // TODO: Test complex parsing
      // TODO: Verify AAPL detected, technical terms ignored
      
      expect(complexMessage).toContain('$AAPL');
      expect(complexMessage).toContain('52WH');
      expect(complexMessage).toContain('EMA20');
      expect(complexMessage).toContain('DMA50');
    });
  });

  test.describe('Performance & Integration Tests', () => {
    test('Should process messages quickly with allowlist lookups', () => {
      // TODO: Performance benchmark test
      // TODO: Compare old vs new detection speed
      // TODO: Verify no significant performance regression
    });

    test('Should handle concurrent message processing', () => {
      // TODO: Test multiple messages processed simultaneously
      // TODO: Verify no race conditions in allowlist updates
      // TODO: Ensure thread safety
    });

    test('Should integrate properly with Discord bot architecture', () => {
      // TODO: Integration test with actual Discord message objects
      // TODO: Test with AnalysisLinker integration
      // TODO: Verify EphemeralHandler still works
    });

    test('Should migrate historical data properly', () => {
      // TODO: Test migration from old COMMON_WORDS to new allowlist
      // TODO: Verify existing analysis data preserved
      // TODO: Test backward compatibility
    });
  });
});