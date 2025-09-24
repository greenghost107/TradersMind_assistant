import { test, expect } from '@playwright/test';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Top Picks Over 25 Symbols - INOD & TPR Bug', () => {
  let symbolDetector: SymbolDetector;
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    symbolDetector = new SymbolDetector();
    analysisLinker = new AnalysisLinker();
  });

  test('should parse all 34 top picks without truncating to 25', () => {
    const message = `
❕ טופ פיקס:
📈 long: HNGE , RKLB , CRWV , SOUN , SRAD ,  FTI , QUBT , DOCS , DASH , MP , PSIX , AXON , IBKR , ORCL , ALAB , EME , PWR , DELL , GEV , CLS , ATGE , PL , QBTS , RGTI , IONQ , OKLO , IREN , APP , TSM , KRMN , APH , AVAV , INOD , TPR
📉 short:
    `;

    const symbols = symbolDetector.detectSymbolsFromTopPicks(message);
    
    expect(symbols.length).toBe(34);
    
    const symbolNames = symbols.map(s => s.symbol);
    expect(symbolNames).toContain('INOD');
    expect(symbolNames).toContain('TPR');
    
    expect(symbols.every(s => s.priority === 'top_long')).toBe(true);
  });

  test('should filter for analysis AFTER parsing all symbols', async () => {
    const message = `
❕ טופ פיקס:
📈 long: HNGE , RKLB , CRWV , SOUN , SRAD ,  FTI , QUBT , DOCS , DASH , MP , PSIX , AXON , IBKR , ORCL , ALAB , EME , PWR , DELL , GEV , CLS , ATGE , PL , QBTS , RGTI , IONQ , OKLO , IREN , APP , TSM , KRMN , APH , AVAV , INOD , TPR
📉 short:
    `;

    const mockINODMessage = {
      id: 'test-inod-1',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: '$INOD\nברייקאאוט של קו פריצה והמשכיות',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    const mockTPRMessage = {
      id: 'test-tpr-1',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: '$TPR\nפריצה של AVWAP ATH לבלו סקייס',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockINODMessage);
    await analysisLinker.indexMessage(mockTPRMessage);

    expect(analysisLinker.hasAnalysisFor('INOD')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('TPR')).toBe(true);

    const symbols = symbolDetector.detectSymbolsFromTopPicks(message);
    
    expect(symbols.length).toBe(34);
    
    const symbolsWithAnalysis = symbols.filter(s => 
      analysisLinker.hasAnalysisFor(s.symbol)
    );
    
    expect(symbolsWithAnalysis.some(s => s.symbol === 'INOD')).toBe(true);
    expect(symbolsWithAnalysis.some(s => s.symbol === 'TPR')).toBe(true);
  });

  test('should handle 40+ symbols in top picks without truncation', () => {
    const longPicks = [
      'AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'NFLX', 'ADBE', 'CRM',
      'ORCL', 'INTC', 'AMD', 'QCOM', 'TXN', 'AVGO', 'MU', 'LRCX', 'KLAC', 'MRVL',
      'SNPS', 'CDNS', 'FTNT', 'NOW', 'SNOW', 'COIN', 'SQ', 'PYPL', 'SHOP', 'ROKU',
      'ZM', 'DOCU', 'OKTA', 'DDOG', 'NET', 'CRWD', 'S', 'MDB', 'ESTC', 'TEAM',
      'ZS', 'PANW', 'INOD', 'TPR'
    ];

    const message = `
❕ טופ פיקס:
📈 long: ${longPicks.join(' , ')}
📉 short: SPY , QQQ
    `;

    const symbols = symbolDetector.detectSymbolsFromTopPicks(message);
    
    expect(symbols.length).toBe(46);
    
    expect(symbols.some(s => s.symbol === 'INOD')).toBe(true);
    expect(symbols.some(s => s.symbol === 'TPR')).toBe(true);
    expect(symbols.some(s => s.symbol === 'SPY' && s.priority === 'top_short')).toBe(true);
    expect(symbols.some(s => s.symbol === 'QQQ' && s.priority === 'top_short')).toBe(true);
  });

  test('should maintain priority order when more than 25 symbols', () => {
    const message = `
❕ טופ פיקס:
📈 long: HNGE , RKLB , CRWV , SOUN , SRAD ,  FTI , QUBT , DOCS , DASH , MP , PSIX , AXON , IBKR , ORCL , ALAB , EME , PWR , DELL , GEV , CLS , ATGE , PL , QBTS , RGTI , IONQ , OKLO , IREN , APP , TSM , KRMN , APH , AVAV , INOD , TPR
📉 short: SPY , QQQ
    `;

    const symbols = symbolDetector.detectSymbolsFromTopPicks(message);
    
    expect(symbols.length).toBe(36);
    
    const topLongSymbols = symbols.filter(s => s.priority === 'top_long');
    const topShortSymbols = symbols.filter(s => s.priority === 'top_short');
    
    expect(topLongSymbols.length).toBe(34);
    expect(topShortSymbols.length).toBe(2);
    
    const topLongIndex = symbols.findIndex(s => s.priority === 'top_long');
    const topShortIndex = symbols.findIndex(s => s.priority === 'top_short');
    
    expect(topLongIndex).toBeLessThan(topShortIndex);
    
    expect(symbols[symbols.length - 2]?.symbol).toBe('SPY');
    expect(symbols[symbols.length - 1]?.symbol).toBe('QQQ');
  });

  test('should verify production scenario with INOD and TPR at positions 33 and 34', () => {
    const productionMessage = `
❗ מניות שעשו / קרובות ל-ATH שלהן ויכולות להמשיך:
ATGE , IWM , SOFI , GOOGL , QBTS , RGTI , IONQ , OKLO , IREN , APP , TSM , KRMN , APH , PRIM , AVAV , INOD , TPR , PLTR , FIX , NET , NVDA , SEI

❗ מניות שעשו / קרובות ל-52WH שלהן ויכולות להמשיך:
PL , APLD , OUST , AMSC , BABA , ARKK , XMTR , EGO , AU , RSI

❗ ברייקאאוטים:
HNGE , DASH , AXON , DELL , GEV , CLS , IBKR , ZS , PWR , DAVE , SNOW , RCAT , QUBT , RKLB , GH , SRAD , OMDA

❗ המשכיות:
CRWV , EME , UMAC , ORCL , MP , ECG , SOUN , PSIX , ZETA , SMTC , DOCS

❗ באונסים:
ALAB , ANET , SERV , AAOI , FTI , ARGX , ELF

🔻 שורט סייד:

❕ טופ פיקס:
📈 long: HNGE , RKLB , CRWV , SOUN , SRAD ,  FTI , QUBT , DOCS , DASH , MP , PSIX , AXON , IBKR , ORCL , ALAB , EME , PWR , DELL , GEV , CLS , ATGE , PL , QBTS , RGTI , IONQ , OKLO , IREN , APP , TSM , KRMN , APH , AVAV , INOD , TPR
📉 short:

❕ טריידים שלי:
SOFI , GOOGL , ATGE , DASH  , ANET , CRWV
    `;

    const symbols = symbolDetector.detectSymbolsFromTopPicks(productionMessage);
    
    expect(symbols.length).toBeGreaterThanOrEqual(34);
    
    const inodSymbol = symbols.find(s => s.symbol === 'INOD');
    const tprSymbol = symbols.find(s => s.symbol === 'TPR');
    
    expect(inodSymbol).toBeDefined();
    expect(tprSymbol).toBeDefined();
    
    expect(inodSymbol?.priority).toBe('top_long');
    expect(tprSymbol?.priority).toBe('top_long');
    
    expect(inodSymbol?.confidence).toBe(1.0);
    expect(tprSymbol?.confidence).toBe(1.0);
  });
});