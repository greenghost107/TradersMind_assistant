import { test, expect } from '@playwright/test';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('SOFI Indexing Bug - Analysis vs Symbol List', () => {
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
  });

  test('should index Hebrew SOFI analysis with technical content', async () => {
    const mockMessage = {
      id: 'sofi-analysis-hebrew',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'סופיי $SOFI👀\nכתבתי בבוקר:\nאינסייד קנדל לתקיפה חדשה יתקבל בברכה היום : )\nמקום 33 ב-IBD50.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('SOFI')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('SOFI', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
    
    // Verify the analysis contains the expected content
    expect(analysis[0]?.content).toContain('אינסייד קנדל');
    expect(analysis[0]?.content).toContain('IBD50');
  });

  test('should NOT index SOFI from symbol list', async () => {
    const mockMessage = {
      id: 'sofi-symbol-list',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'ZS / SOFI / TBBK / MSFT / ATGE / BZ / TVTX :goglyeyes:',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // This should fail initially if SOFI is being incorrectly indexed from symbol list
    expect(analysisLinker.hasAnalysisFor('SOFI')).toBe(false);
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should properly detect symbol list pattern', async () => {
    const symbolListMessage = {
      id: 'symbol-list-pattern-test',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'ZS / SOFI / TBBK / MSFT / ATGE / BZ / TVTX :goglyeyes:',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(symbolListMessage);
    
    // None of the symbols should be indexed from a symbol list
    expect(analysisLinker.hasAnalysisFor('ZS')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('SOFI')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('TBBK')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('MSFT')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('ATGE')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('BZ')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('TVTX')).toBe(false);
    
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should index legitimate analysis vs reject symbol list in same test run', async () => {
    // First: Index proper analysis
    const analysisMessage = {
      id: 'sofi-proper-analysis',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'סופיי $SOFI👀\nכתבתי בבוקר:\nאינסייד קנדל לתקיפה חדשה יתקבל בברכה היום : )\nמקום 33 ב-IBD50.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(analysisMessage);
    expect(analysisLinker.hasAnalysisFor('SOFI')).toBe(true);
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(1);

    // Second: Try to process symbol list (should be rejected)
    const symbolListMessage = {
      id: 'symbol-list-rejected',
      author: { bot: false, id: 'user2', tag: 'TestUser2#5678' },
      content: 'ZS / SOFI / TBBK / MSFT / ATGE / BZ / TVTX :goglyeyes:',
      createdAt: new Date(Date.now() + 1000), // 1 second later
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser2' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(symbolListMessage);
    
    // Should still only have SOFI from the analysis, not from symbol list
    expect(analysisLinker.hasAnalysisFor('SOFI')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('ZS')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('TBBK')).toBe(false);
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(1); // Still only SOFI from analysis
  });
});