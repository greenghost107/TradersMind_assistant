import { test, expect } from '@playwright/test';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Timestamp Comparison Simple Test', () => {
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
  });

  test('should store chronologically latest message correctly', async () => {
    const earlierTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    const laterTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

    // Later message (should be the final result)
    const laterMessage = {
      id: 'later-msg',
      author: { bot: false, id: 'user1', tag: 'TestUser' },
      content: '$AAPL showing strong technical momentum with breakout patterns and bullish signals for upward movement',
      createdAt: laterTime,
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    // Earlier message
    const earlierMessage = {
      id: 'earlier-msg',
      author: { bot: false, id: 'user1', tag: 'TestUser' },
      content: '$AAPL detailed analysis with comprehensive technical breakdown showing momentum and strength indicators',
      createdAt: earlierTime,
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    // Index later message first
    await analysisLinker.indexMessage(laterMessage);
    
    // Verify it's stored
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(true);
    let latestUrl = analysisLinker.getLatestAnalysisUrl('AAPL');
    expect(latestUrl).toContain('later-msg');

    // Now index earlier message - should NOT replace the later one
    await analysisLinker.indexMessage(earlierMessage);
    
    // Should still point to the later message
    latestUrl = analysisLinker.getLatestAnalysisUrl('AAPL');
    expect(latestUrl).toContain('later-msg');
    
    // Verify the latest analysis is still the later message
    const analyses = await analysisLinker.getLatestAnalysis('AAPL', 1);
    expect(analyses).toHaveLength(1);
    expect(analyses[0]!.messageId).toBe('later-msg');
    expect(analyses[0]!.timestamp).toEqual(laterTime);
  });
});