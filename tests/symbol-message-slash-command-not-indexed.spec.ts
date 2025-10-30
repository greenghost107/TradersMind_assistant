import { test, expect } from '@playwright/test';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Symbol Message with Slash Command Not Indexed', () => {
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
  });

  test('should not index symbol list message followed by @everyone mention', async () => {
    const mockMessage = {
      id: 'test-symbol-slash-1',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'AMSC / GEV / SMR / SERV / INOD / GRMN / MRVL / FIGR / EME / ARKK / ALNY / RYTM / ARM / AVGO / CRWV 👀 \n@everyone',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'long_analysis', name: 'long_analysis', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    // This should NOT be indexed due to symbol list pattern detection
    await analysisLinker.indexMessage(mockMessage);
    
    // Verify none of the symbols have analysis data
    expect(analysisLinker.hasAnalysisFor('AMSC')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('GEV')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('SMR')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('SERV')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('INOD')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('GRMN')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('MRVL')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('FIGR')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('EME')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('ARKK')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('ALNY')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('RYTM')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('ARM')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('AVGO')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('CRWV')).toBe(false);
    
    // Verify no symbols are tracked
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should not index symbol list with eyes emoji and @everyone', async () => {
    const mockMessage = {
      id: 'test-symbol-slash-2',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'TSLA / NVDA / AAPL / MSFT / GOOGL 👀\n@everyone',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'long_analysis', name: 'long_analysis', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('TSLA')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('NVDA')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('MSFT')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('GOOGL')).toBe(false);
    
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should not index symbol list with watchlist format', async () => {
    const mockMessage = {
      id: 'test-symbol-slash-3',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'AMZN / NFLX / META / CRM / ADBE / SHOP 👀\n@everyone',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'long_analysis', name: 'long_analysis', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should handle similar message without @everyone mention correctly', async () => {
    const mockMessage = {
      id: 'test-symbol-slash-4',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'AMSC / GEV / SMR showing strong momentum with breakout patterns. Technical analysis suggests bullish continuation for these names with proper risk management.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'long_analysis', name: 'long_analysis', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // This should be indexed because it contains actual analysis content
    expect(analysisLinker.hasAnalysisFor('AMSC')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('GEV')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('SMR')).toBe(true);
  });

  test('should reject exact message format with eyes emoji', async () => {
    const mockMessage = {
      id: 'test-symbol-slash-5',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'AMSC / GEV / SMR / SERV / INOD / GRMN / MRVL / FIGR / EME / ARKK / ALNY / RYTM / ARM / AVGO / CRWV 👀',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'long_analysis', name: 'long_analysis', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // Should be rejected due to symbol list pattern with minimal content
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });
});