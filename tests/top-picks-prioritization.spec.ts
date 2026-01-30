import { test, expect } from '@playwright/test';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { TopPicksParser } from '../src/services/TopPicksParser';

test.describe('Top Picks Parsing', () => {
  let topPicksParser: TopPicksParser;

  test.beforeEach(() => {
    topPicksParser = new TopPicksParser();
  });

  test('should parse Hebrew top picks format correctly', () => {
    const message = `
Market analysis here...

❕ טופ פיקס:
📈 long: TTAN , PL , PSIX , PLTR , HNGE , MU , IREN , RDDT , DASH , ARQT
📉 short: SPY , QQQ , UVXY

More content after...
    `;

    const result = topPicksParser.parseTopPicks(message);
    
    expect(result.longPicks).toEqual(['TTAN', 'PL', 'PSIX', 'PLTR', 'HNGE', 'MU', 'IREN', 'RDDT', 'DASH', 'ARQT']);
    expect(result.shortPicks).toEqual(['SPY', 'QQQ', 'UVXY']);
  });

  test('should handle empty short picks section', () => {
    const message = `
❕ טופ פיקס:
📈 long: AAPL , TSLA , MSFT
📉 short: 
    `;

    const result = topPicksParser.parseTopPicks(message);
    
    expect(result.longPicks).toEqual(['AAPL', 'TSLA', 'MSFT']);
    expect(result.shortPicks).toEqual([]);
  });

  test('should handle English "top picks" format', () => {
    const message = `
Analysis content...

Top Picks:
📈 long: NVDA, AMD, INTC
📉 short: SPY
    `;

    const result = topPicksParser.parseTopPicks(message);
    
    expect(result.longPicks).toEqual(['NVDA', 'AMD', 'INTC']);
    expect(result.shortPicks).toEqual(['SPY']);
  });

  test('should return empty arrays when no top picks found', () => {
    const message = 'Regular analysis without top picks section\nAAPL TSLA MSFT mentioned here';

    const result = topPicksParser.parseTopPicks(message);
    
    expect(result.longPicks).toEqual([]);
    expect(result.shortPicks).toEqual([]);
  });

  test('should filter out invalid symbols and common words', () => {
    const message = `
❕ טופ פיקס:
📈 long: AAPL , THE , TOOLONGNAME , A , TSLA , USD , MSFT
📉 short: SHORT , SPY , API , QQQ
    `;

    const result = topPicksParser.parseTopPicks(message);
    
    // Should include valid symbols: AAPL, A (allowed single letter), TSLA, MSFT, SPY, QQQ
    // Should exclude: THE, TOOLONGNAME, USD, SHORT, API (common words or invalid)
    expect(result.longPicks).toEqual(['AAPL', 'A', 'TSLA', 'MSFT']);
    expect(result.shortPicks).toEqual(['SPY', 'QQQ']);
  });

  test('should handle different separators and whitespace', () => {
    const message = `
❕ טופ פיקס:
📈 long: AAPL,TSLA , MSFT，NVDA、AMD   INTC
📉 short: SPY,  QQQ
    `;

    const result = topPicksParser.parseTopPicks(message);
    
    expect(result.longPicks).toEqual(['AAPL', 'TSLA', 'MSFT', 'NVDA', 'AMD', 'INTC']);
    expect(result.shortPicks).toEqual(['SPY', 'QQQ']);
  });

  test('should detect if message has top picks', () => {
    const messageWithPicks = '❕ טופ פיקס:\n📈 long: AAPL';
    const messageWithoutPicks = 'Regular analysis AAPL TSLA';
    const messageWithEnglishPicks = 'Top picks:\n📈 long: MSFT';

    expect(topPicksParser.hasTopPicks(messageWithPicks)).toBe(true);
    expect(topPicksParser.hasTopPicks(messageWithoutPicks)).toBe(false);
    expect(topPicksParser.hasTopPicks(messageWithEnglishPicks)).toBe(true);
  });
});

test.describe('Symbol Detection with Prioritization', () => {
  let symbolDetector: SymbolDetector;

  test.beforeEach(() => {
    symbolDetector = new SymbolDetector();
  });

  test('should prioritize top long picks first', () => {
    const message = `
Regular symbols: NVDA INTC AMD CRM ORCL ADBE

❕ טופ פיקס:
📈 long: AAPL , TSLA , MSFT
📉 short: SPY

More symbols: GOOGL META NFLX
    `;

    const symbols = symbolDetector.detectSymbolsFromTopPicks(message);
    
    // Top long picks should appear first
    expect(symbols.slice(0, 3).map(s => s.symbol)).toEqual(
      expect.arrayContaining(['AAPL', 'TSLA', 'MSFT'])
    );
    expect(symbols.slice(0, 3).every(s => s.priority === 'top_long')).toBe(true);
    
    // Top short picks should appear next
    const shortPickIndex = symbols.findIndex(s => s.symbol === 'SPY');
    expect(shortPickIndex).toBeGreaterThanOrEqual(3);
    expect(symbols[shortPickIndex]!.priority).toBe('top_short');
  });

  test('should handle message with more than 25 symbols, prioritizing top picks', () => {
    const message = `
❕ טופ פיקס:
📈 long: TTAN , PL , PSIX , PLTR , HNGE , MU , IREN , RDDT , DASH , ARQT , AMZN , GOOGL , APP , TSM , ALAB , CRDO , PODD , BABA , WAY , APH , INOD , APLD , WULF , HUT
📉 short: SPY , QQQ

Regular symbols: NVDA INTC AMD CRM ORCL ADBE NOW SNOW COIN SQ PYPL SHOP ROKU ZM DOCU OKTA DDOG NET CRWD S MDB ESTC TEAM ZS PANW UBER LYFT ABNB DIS NFLX
    `;

    const symbols = symbolDetector.detectSymbolsFromTopPicks(message);

    // No 25-symbol limit - all top picks are parsed (24 long + 2 short = 26 total)
    // Button limit of 20 per message is handled by EphemeralHandler, not SymbolDetector
    expect(symbols).toHaveLength(26);

    // All top picks should be included (24 long + 2 short = 26 total)
    const topLongCount = symbols.filter(s => s.priority === 'top_long').length;
    const topShortCount = symbols.filter(s => s.priority === 'top_short').length;

    expect(topLongCount).toBe(24);
    expect(topShortCount).toBe(2);

    // Top long picks should come first, then short picks
    const firstTopPicks = symbols.slice(0, topLongCount + topShortCount);
    expect(firstTopPicks.every(s => s.priority !== 'regular')).toBe(true);
  });

  test('should assign regular priority when no top picks present', () => {
    const message = 'Analysis for AAPL TSLA MSFT without top picks section';

    const symbols = symbolDetector.detectSymbolsFromAnalysis(message);
    
    expect(symbols).toHaveLength(3);
    expect(symbols.every(s => s.priority === 'regular')).toBe(true);
  });

  test('should maintain confidence scoring within priority groups', () => {
    const message = `
❕ טופ פיקס:
📈 long: $AAPL , TSLA , #MSFT
📉 short: SPY

Regular: $NVDA GOOGL
    `;

    const symbols = symbolDetector.detectSymbolsFromTopPicks(message);
    
    // All top picks should have confidence 1.0 and position 0
    const topLongs = symbols.filter(s => s.priority === 'top_long');
    const aaplSymbol = topLongs.find(s => s.symbol === 'AAPL');
    const tslaSymbol = topLongs.find(s => s.symbol === 'TSLA');
    const msftSymbol = topLongs.find(s => s.symbol === 'MSFT');
    
    expect(aaplSymbol).toBeDefined();
    expect(tslaSymbol).toBeDefined();
    expect(msftSymbol).toBeDefined();
    
    // All top picks get confidence 1.0
    expect(aaplSymbol!.confidence).toBe(1.0);
    expect(tslaSymbol!.confidence).toBe(1.0);
    expect(msftSymbol!.confidence).toBe(1.0);
  });

  test('should handle case where top picks exactly fill 25 button limit', () => {
    // Create exactly 25 top picks (23 long + 2 short) using valid symbol format
    const longPicks = [
      'AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'NFLX', 'ADBE', 'CRM',
      'ORCL', 'INTC', 'AMD', 'QCOM', 'TXN', 'AVGO', 'MU', 'LRCX', 'KLAC', 'MRVL',
      'SNPS', 'CDNS', 'FTNT'
    ];
    const shortPicks = ['SPY', 'QQQ'];
    
    const message = `
❕ טופ פיקס:
📈 long: ${longPicks.join(' , ')}
📉 short: ${shortPicks.join(' , ')}

Regular symbols: NOW SNOW COIN SQ PYPL SHOP
    `;

    const symbols = symbolDetector.detectSymbolsFromTopPicks(message);
    
    // Should return exactly 25 symbols
    expect(symbols).toHaveLength(25);
    
    // All should be top picks, no regular symbols
    expect(symbols.filter(s => s.priority === 'top_long')).toHaveLength(23);
    expect(symbols.filter(s => s.priority === 'top_short')).toHaveLength(2);
    expect(symbols.filter(s => s.priority === 'regular')).toHaveLength(0);
    
    // Verify all top picks are included
    const symbolStrings = symbols.map(s => s.symbol);
    longPicks.forEach(pick => {
      expect(symbolStrings).toContain(pick);
    });
    shortPicks.forEach(pick => {
      expect(symbolStrings).toContain(pick);
    });
  });

  test('should deduplicate symbols appearing in both top picks and regular text', () => {
    const message = `
❕ טופ פיקס:
📈 long: AAPL , TSLA , AAPL
📉 short: SPY

Regular analysis mentions AAPL and TSLA again, plus MSFT
    `;

    const symbols = symbolDetector.detectSymbolsFromTopPicks(message);
    
    // Should not have duplicates (AAPL listed twice in top picks)
    const symbolStrings = symbols.map(s => s.symbol);
    const uniqueSymbols = [...new Set(symbolStrings)];
    expect(symbolStrings).toHaveLength(uniqueSymbols.length);
    
    // AAPL and TSLA should have top pick priority
    const aaplSymbol = symbols.find(s => s.symbol === 'AAPL');
    const tslaSymbol = symbols.find(s => s.symbol === 'TSLA');
    const spySymbol = symbols.find(s => s.symbol === 'SPY');
    
    expect(aaplSymbol?.priority).toBe('top_long');
    expect(tslaSymbol?.priority).toBe('top_long');
    expect(spySymbol?.priority).toBe('top_short');
  });

  test('should sort by priority first, then confidence', () => {
    const message = `
❕ טופ פיקס:
📈 long: PLTR
📉 short: $SPY

High confidence regular symbol: $NVDA
    `;

    const symbols = symbolDetector.detectSymbolsFromTopPicks(message);
    
    // detectSymbolsFromTopPicks only returns top picks
    // top_long comes first, then top_short
    expect(symbols[0]!.priority).toBe('top_long');
    expect(symbols[0]!.symbol).toBe('PLTR');
    
    expect(symbols[1]!.priority).toBe('top_short');
    expect(symbols[1]!.symbol).toBe('SPY');
    
    // Regular symbols are not returned by detectSymbolsFromTopPicks
    expect(symbols).toHaveLength(2);
  });
});