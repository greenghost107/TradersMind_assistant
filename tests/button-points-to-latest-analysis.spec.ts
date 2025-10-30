import { test, expect } from '@playwright/test';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Button Points to Latest Analysis', () => {
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
  });

  test('should point to chronologically latest message when processed in reverse order', async () => {
    // Create timestamps: detailed analysis (10 minutes ago) and short message (5 minutes ago)  
    const detailedAnalysisTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    const shortMessageTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

    // Detailed analysis message (older - 10 minutes ago)
    const detailedMessage = {
      id: '1428061000000000000', // Earlier message ID
      author: { bot: false, id: 'admin1', tag: 'A.Agarunov- TradersMind' },
      content: 'ויקינג הולדיגנס $VIK\nפולבק של 12% מה-ATH האחרון ועד ללואו שמצאה ב-10 לאוקטובר מעל ה-EMA20 שבועי.\nאתמול החלה פריצה של קו ברייקאאוט אלכסון מהשיא + ה-EMA20 + ה-50DMA + ה-AVWAP ATH.\nמעבר ברור של הלבל הזה ייתן אזור טוב to play against ויראה שהמניה רוצה להמשיך צפונה.\nמניות IPO💎',
      createdAt: detailedAnalysisTime,
      guildId: 'test-guild',
      channel: { id: 'long_analysis', isThread: () => false },
      member: { displayName: 'A.Agarunov- TradersMind' },
      reference: null
    } as any;

    // Short message (newer - 5 minutes ago)
    const shortMessage = {
      id: '1428062135082160228', // Later message ID (matches the log)
      author: { bot: false, id: 'admin1', tag: 'A.Agarunov- TradersMind' },
      content: 'ויקינג הולדיגנס $VIK👀 showing strong technical momentum with breakout patterns and bullish signals',
      createdAt: shortMessageTime,
      guildId: 'test-guild',
      channel: { id: 'long_analysis', isThread: () => false },
      member: { displayName: 'A.Agarunov- TradersMind' },
      reference: null
    } as any;

    // Index messages in reverse chronological order (newer first, then older)
    // This simulates the bug scenario where newer message gets processed first
    await analysisLinker.indexMessage(shortMessage);  // 5 minutes ago processed first
    await analysisLinker.indexMessage(detailedMessage);  // 10 minutes ago processed second

    // Verify VIK has analysis
    expect(analysisLinker.hasAnalysisFor('VIK')).toBe(true);

    // Get latest analysis - should be the chronologically newer message (5 minutes ago)
    const latestAnalysis = await analysisLinker.getLatestAnalysis('VIK', 1);
    expect(latestAnalysis).toHaveLength(1);
    
    // The latest analysis should be the chronologically newest message (5 minutes ago)
    expect(latestAnalysis[0]!.messageId).toBe('1428062135082160228'); // Short message
    expect(latestAnalysis[0]!.timestamp).toEqual(shortMessageTime);

    // Verify the latest analysis URL points to the chronologically newest message
    const latestUrl = analysisLinker.getLatestAnalysisUrl('VIK');
    expect(latestUrl).toContain('1428062135082160228'); // Should contain the short message ID
  });

  test('should point to chronologically latest message when processed in chronological order', async () => {
    // Same scenario but process messages in chronological order
    const detailedAnalysisTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    const shortMessageTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

    const detailedMessage = {
      id: '1428061000000000000',
      author: { bot: false, id: 'admin1', tag: 'A.Agarunov- TradersMind' },
      content: 'ויקינג הולדיגנס $VIK\nפולבק של 12% מה-ATH האחרון ועד ללואו שמצאה ב-10 לאוקטובר מעל ה-EMA20 שבועי.\nאתמול החלה פריצה של קו ברייקאאוט אלכסון מהשיא + ה-EMA20 + ה-50DMA + ה-AVWAP ATH.\nמעבר ברור של הלבל הזה ייתן אזור טוב to play against ויראה שהמניה רוצה להמשיך צפונה.\nמניות IPO💎',
      createdAt: detailedAnalysisTime,
      guildId: 'test-guild',
      channel: { id: 'long_analysis', isThread: () => false },
      member: { displayName: 'A.Agarunov- TradersMind' },
      reference: null
    } as any;

    const shortMessage = {
      id: '1428062135082160228',
      author: { bot: false, id: 'admin1', tag: 'A.Agarunov- TradersMind' },
      content: 'ויקינג הולדיגנס $VIK👀 showing strong technical momentum with breakout patterns and bullish signals',
      createdAt: shortMessageTime,
      guildId: 'test-guild',
      channel: { id: 'long_analysis', isThread: () => false },
      member: { displayName: 'A.Agarunov- TradersMind' },
      reference: null
    } as any;

    // Index messages in chronological order (older first, then newer)
    await analysisLinker.indexMessage(detailedMessage);  // 10 minutes ago processed first
    await analysisLinker.indexMessage(shortMessage);  // 5 minutes ago processed second

    // The latest analysis should still be the chronologically newest message (5 minutes ago)
    const latestAnalysis = await analysisLinker.getLatestAnalysis('VIK', 1);
    expect(latestAnalysis).toHaveLength(1);
    expect(latestAnalysis[0]!.messageId).toBe('1428062135082160228'); // Short message
    expect(latestAnalysis[0]!.timestamp).toEqual(shortMessageTime);

    const latestUrl = analysisLinker.getLatestAnalysisUrl('VIK');
    expect(latestUrl).toContain('1428062135082160228');
  });

  test('should handle multiple symbols correctly', async () => {
    const time1 = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
    const time2 = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

    const message1 = {
      id: 'msg1',
      author: { bot: false, id: 'user1', tag: 'TestUser' },
      content: '$AAPL showing strong momentum with technical breakout patterns',
      createdAt: time1,
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    const message2 = {
      id: 'msg2',
      author: { bot: false, id: 'user1', tag: 'TestUser' },
      content: '$AAPL quick update 👀 showing strong technical momentum with breakout patterns',
      createdAt: time2,
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    // Process newer message first
    await analysisLinker.indexMessage(message2);
    await analysisLinker.indexMessage(message1);

    // Should still point to chronologically newer message
    const latestAnalysis = await analysisLinker.getLatestAnalysis('AAPL', 1);
    expect(latestAnalysis[0]!.messageId).toBe('msg2');
    expect(latestAnalysis[0]!.timestamp).toEqual(time2);
  });

  test('should handle same timestamp edge case', async () => {
    const sameTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

    const message1 = {
      id: 'msg1',
      author: { bot: false, id: 'user1', tag: 'TestUser' },
      content: '$TSLA analysis first message showing strong technical momentum with breakout patterns',
      createdAt: sameTime,
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    const message2 = {
      id: 'msg2',
      author: { bot: false, id: 'user1', tag: 'TestUser' },
      content: '$TSLA analysis second message showing strong technical momentum with breakout patterns',
      createdAt: sameTime,
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(message1);
    await analysisLinker.indexMessage(message2);

    // When timestamps are equal, should keep the first one processed
    const latestAnalysis = await analysisLinker.getLatestAnalysis('TSLA', 1);
    expect(latestAnalysis[0]!.messageId).toBe('msg1');
  });
});