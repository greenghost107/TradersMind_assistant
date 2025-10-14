import { test, expect } from '@playwright/test';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('IBD Reference Filtering - Service References vs Stock Symbols', () => {
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
  });

  test('should index ARKK but NOT index IBD or FFTY references', async () => {
    const mockMessage = {
      id: 'arkk-analysis-with-ibd-refs',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'קרן $ARKK✅\nממשיכה ועושה עוד 52WH חדש היום.\n💡 כל שבוע אני כותב מחדש בחדר תעודות סל שבועי -> שתעודות כמו קרן ARKK ותעודת הסל FFTY של ה-IBD נראות כמו שהן נראות ונסחרות ב-52WH ובאפטרנד זה אינדיקציה לשוק חזק מאוד (!)\n✍️ ברייקאאוט מקונסולידציה של 7 שבועות באזורי ה-52WH במהלך אפטנרד.\n✍️ באונס מדויק וטו דה פני מה-EMA20, באונס והמראה ל-52WH חדשים.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // Should index the actual stock
    expect(analysisLinker.hasAnalysisFor('ARKK')).toBe(true);
    
    // Should NOT index service/index references
    expect(analysisLinker.hasAnalysisFor('IBD')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('FFTY')).toBe(false);
    
    // Should not index single letters that might be extracted
    expect(analysisLinker.hasAnalysisFor('I')).toBe(false);
    
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(1); // Only ARKK
    
    const analysis = await analysisLinker.getLatestAnalysis('ARKK', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index SE but NOT index IBD reference', async () => {
    const mockMessage = {
      id: 'se-analysis-with-ibd-ref',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'סי לימיטד $SE✅\nממשיכה בתנועה לאחר ריטסט לברייקאאוט ול-AVWAP 52WH + ה-EMA20 + קו הפריצה הלבן.\nחלק מה-IBD Investing Action Plan לשבוע הזה.\nעברה בהצלחה בשבוע שעבר strength test ל-50DMA באופן מדויק כמה סשנים משלישי עד חמישי ושמרה על הממוצע בצורה נהדרת.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // Should index the actual stock
    expect(analysisLinker.hasAnalysisFor('SE')).toBe(true);
    
    // Should NOT index service reference
    expect(analysisLinker.hasAnalysisFor('IBD')).toBe(false);
    
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(1); // Only SE
    
    const analysis = await analysisLinker.getLatestAnalysis('SE', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index STOK but NOT index IBD reference', async () => {
    const mockMessage = {
      id: 'stok-analysis-with-ibd-ref',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'סטוק $STOK✅\nאיך כתבתי עדכון קודם:\n💡 יש סיבה למה אנחנו מתעסקים עם מניות IBD ווינריות באפטנרד : )\nיש לנו 52WH חדש רמות מחיר שלא נראו מאפריל 2022.\nמקום 3 ב-IBD50.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // Should index the actual stock
    expect(analysisLinker.hasAnalysisFor('STOK')).toBe(true);
    
    // Should NOT index service reference
    expect(analysisLinker.hasAnalysisFor('IBD')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('IBD50')).toBe(false);
    
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(1); // Only STOK
    
    const analysis = await analysisLinker.getLatestAnalysis('STOK', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index AU but NOT index IBD reference', async () => {
    const mockMessage = {
      id: 'au-analysis-with-ibd-ref',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'מניית $AU✅\nעוד ATH חדש היום לאחר ששברה שבוע שעבר את השיא הקודם מ-1987🚀 👏\nחלק מה-IBD Stock Spotlight לשבוע הזה ובכל שבוע כמעט.\nמקום 31 ב-IBD50 ורייד ווינרס.\nהנר השנתי שלה God Candle מדהים!',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // Should index the actual stock
    expect(analysisLinker.hasAnalysisFor('AU')).toBe(true);
    
    // Should NOT index service references
    expect(analysisLinker.hasAnalysisFor('IBD')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('IBD50')).toBe(false);
    
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(1); // Only AU
    
    const analysis = await analysisLinker.getLatestAnalysis('AU', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index all correct symbols from IBD reference messages', async () => {
    // Process all four messages in sequence
    const messages = [
      {
        id: 'arkk-analysis',
        content: 'קרן $ARKK✅\nממשיכה ועושה עוד 52WH חדש היום.\n💡 כל שבוע אני כותב מחדש בחדר תעודות סל שבועי -> שתעודות כמו קרן ARKK ותעודת הסל FFTY של ה-IBD נראות כמו שהן נראות ונסחרות ב-52WH ובאפטרנד זה אינדיקציה לשוק חזק מאוד (!)\n✍️ ברייקאאוט מקונסולידציה של 7 שבועות באזורי ה-52WH במהלך אפטנרד.',
      },
      {
        id: 'se-analysis',
        content: 'סי לימיטד $SE✅\nממשיכה בתנועה לאחר ריטסט לברייקאאוט ול-AVWAP 52WH + ה-EMA20 + קו הפריצה הלבן.\nחלק מה-IBD Investing Action Plan לשבוע הזה.',
      },
      {
        id: 'stok-analysis', 
        content: 'סטוק $STOK✅\nאיך כתבתי עדכון קודם:\n💡 יש סיבה למה אנחנו מתעסקים עם מניות IBD ווינריות באפטנרד : )\nיש לנו 52WH חדש רמות מחיר שלא נראו מאפריל 2022.\nמקום 3 ב-IBD50.',
      },
      {
        id: 'au-analysis',
        content: 'מניית $AU✅\nעוד ATH חדש היום לאחר ששברה שבוע שעבר את השיא הקודם מ-1987🚀 👏\nחלק מה-IBD Stock Spotlight לשבוע הזה ובכל שבוע כמעט.\nמקום 31 ב-IBD50 ורייד ווינרס.',
      }
    ];

    for (let i = 0; i < messages.length; i++) {
      const mockMessage = {
        id: messages[i].id,
        author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
        content: messages[i].content,
        createdAt: new Date(Date.now() + i * 1000), // Space them out
        guildId: 'test-guild',
        channel: { id: 'test-channel', isThread: () => false },
        member: { displayName: 'TestUser' },
        reference: null
      } as any;

      await analysisLinker.indexMessage(mockMessage);
    }
    
    // Should index all actual stocks
    expect(analysisLinker.hasAnalysisFor('ARKK')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('SE')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('STOK')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('AU')).toBe(true);
    
    // Should NOT index any service references
    expect(analysisLinker.hasAnalysisFor('IBD')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('FFTY')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('IBD50')).toBe(false);
    
    // Should not index single letters
    expect(analysisLinker.hasAnalysisFor('I')).toBe(false);
    
    // Should have exactly 4 symbols tracked
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(4);
    
    // Verify all have proper analysis
    const availableSymbols = analysisLinker.getAvailableSymbols();
    expect(availableSymbols.sort()).toEqual(['ARKK', 'AU', 'SE', 'STOK']);
  });

  test('should handle common IBD service references in exclusion', async () => {
    const mockMessage = {
      id: 'multiple-ibd-references',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'מניות IBD ווינרס שחלק מה-IBD50, IBD Big Cap 20, IBD Stock Spotlight ו-IBD Investing Action Plan: $AAPL $GOOGL $MSFT',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // Should index actual stocks
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('GOOGL')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('MSFT')).toBe(true);
    
    // Should NOT index any IBD service references
    expect(analysisLinker.hasAnalysisFor('IBD')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('IBD50')).toBe(false);
    
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(3); // Only the actual stocks
  });
});