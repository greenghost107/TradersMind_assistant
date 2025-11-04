import { test, expect } from '@playwright/test';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Consecutive Messages Indexing Bug', () => {
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
  });

  test('should index all symbols from consecutive admin messages with מניית pattern', async () => {
    // Simulate the exact scenario that occurred and verify the fix:
    // Admin sent 4 consecutive messages where ITT and UHS should now be indexed
    
    // Use recent timestamps to avoid isRecentEnough filtering
    const now = new Date();
    const baseTime = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

    // Message 1: 10:11 - Hebrew text with context
    const message1 = {
      id: 'admin-msg-1',
      author: { bot: false, id: 'admin-user', tag: 'Admin#1234' },
      content: 'איך US Investing Champion לייף סוריד כתב אתמול: Post earnings setups are a key focus right now💡 \nבואו ניתן כמה כאלה שמופיעות ברשימות של ה-IBD.',
      createdAt: new Date(baseTime.getTime() + 1 * 60 * 1000), // 4 minutes ago
      guildId: 'test-guild',
      channel: { id: 'general', name: 'general', isThread: () => false },
      member: { displayName: 'Admin' },
      reference: null
    } as any;

    // Message 2: 10:12 - ITT with chart link
    const message2 = {
      id: 'admin-msg-2',
      author: { bot: false, id: 'admin-user', tag: 'Admin#1234' },
      content: 'מניית $ITT\nhttps://tradingview.com/chart/example',
      createdAt: new Date(baseTime.getTime() + 2 * 60 * 1000), // 3 minutes ago
      guildId: 'test-guild',
      channel: { id: 'general', name: 'general', isThread: () => false },
      member: { displayName: 'Admin' },
      reference: null
    } as any;

    // Message 3: 10:13 - UHS with chart link
    const message3 = {
      id: 'admin-msg-3',
      author: { bot: false, id: 'admin-user', tag: 'Admin#1234' },
      content: 'מניית $UHS\nhttps://tradingview.com/chart/example2',
      createdAt: new Date(baseTime.getTime() + 3 * 60 * 1000), // 2 minutes ago
      guildId: 'test-guild',
      channel: { id: 'general', name: 'general', isThread: () => false },
      member: { displayName: 'Admin' },
      reference: null
    } as any;

    // Message 4: 10:16 - LLY with detailed analysis
    const message4 = {
      id: 'admin-msg-4',
      author: { bot: false, id: 'admin-user', tag: 'Admin#1234' },
      content: 'אילאי לילי $LLY\nהחלה ברייקאאוט של קו פריצה אלכסון מה-ATH מאוגוסט 2024.\nהגרופ הזה התחיל להתעורר ובואו נראה איך זה ימשיך. \nווליומים מעולים + קרובה לעשות גולדן קרוס.\nחלק מה-IBD Investing Action Plan לשבוע הזה. \nhttps://tradingview.com/chart/example3',
      createdAt: new Date(baseTime.getTime() + 6 * 60 * 1000), // 1 minute in the future from base
      guildId: 'test-guild',
      channel: { id: 'general', name: 'general', isThread: () => false },
      member: { displayName: 'Admin' },
      reference: null
    } as any;

    // Index all messages in chronological order
    await analysisLinker.indexMessage(message1);
    await analysisLinker.indexMessage(message2);
    await analysisLinker.indexMessage(message3);
    await analysisLinker.indexMessage(message4);

    // After fix: ITT and UHS should now be indexed correctly
    // With first-line מניית pattern + chart bonus: 0.3 + 0.1 + 0.3 + 0.2 = 0.9 ✅
    expect(analysisLinker.hasAnalysisFor('ITT')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('UHS')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('LLY')).toBe(true);

    // Verify that all three symbols are tracked
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(3);

    // Additional checks to understand what got indexed
    const ittAnalysis = await analysisLinker.getLatestAnalysis('ITT', 1);
    const uhsAnalysis = await analysisLinker.getLatestAnalysis('UHS', 1);
    const llyAnalysis = await analysisLinker.getLatestAnalysis('LLY', 1);

    expect(ittAnalysis).toHaveLength(1);
    expect(uhsAnalysis).toHaveLength(1); 
    expect(llyAnalysis).toHaveLength(1);

    expect(ittAnalysis[0]!.messageId).toBe('admin-msg-2');
    expect(ittAnalysis[0]!.symbols).toContain('ITT');

    expect(uhsAnalysis[0]!.messageId).toBe('admin-msg-3');
    expect(uhsAnalysis[0]!.symbols).toContain('UHS');

    expect(llyAnalysis[0]!.messageId).toBe('admin-msg-4');
    expect(llyAnalysis[0]!.symbols).toContain('LLY');
  });

  test('should handle short מניית symbol messages with chart links', async () => {
    // Isolated test for the specific format that was failing: מניית + symbol + chart
    const shortIttMessage = {
      id: 'short-itt-msg',
      author: { bot: false, id: 'admin-user', tag: 'Admin#1234' },
      content: 'מניית $ITT\nhttps://tradingview.com/chart/example',
      createdAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
      guildId: 'test-guild',
      channel: { id: 'general', name: 'general', isThread: () => false },
      member: { displayName: 'Admin' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(shortIttMessage);

    // This specific format should now be indexed with the fix
    expect(analysisLinker.hasAnalysisFor('ITT')).toBe(true);
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(1);

    const ittAnalysis = await analysisLinker.getLatestAnalysis('ITT', 1);
    expect(ittAnalysis).toHaveLength(1);
    expect(ittAnalysis[0]!.chartUrls).toBeDefined();
    expect(ittAnalysis[0]!.chartUrls).toHaveLength(1);
    expect(ittAnalysis[0]!.chartUrls![0]).toContain('tradingview.com');
  });
});