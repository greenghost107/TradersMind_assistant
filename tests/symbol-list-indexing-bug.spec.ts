import { test, expect } from '@playwright/test';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Symbol List Indexing Bug Fix', () => {
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
  });

  test('should reject the exact failing case - simple symbol list with slashes', async () => {
    const mockMessage = {
      id: 'test-msg-1',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'QBTS / RGTI / AAOI / ANET / AMSC / PLTR / UBER / SHOP / META / MSFT',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    // This should NOT be indexed due to symbol list pattern detection
    await analysisLinker.indexMessage(mockMessage);
    
    // Verify none of the symbols have analysis data
    expect(analysisLinker.hasAnalysisFor('QBTS')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('PLTR')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('MSFT')).toBe(false);
    
    // Verify no symbols are tracked
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should reject symbol lists with commas', async () => {
    const mockMessage = {
      id: 'test-msg-2',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'AAPL, TSLA, NVDA, GOOGL, AMZN, META, MSFT, NFLX, ADBE, CRM',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('TSLA')).toBe(false);
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should reject symbol lists with pipes', async () => {
    const mockMessage = {
      id: 'test-msg-3',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'NVDA | AMD | INTC | QCOM | MU | LRCX | KLAC | MRVL',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('NVDA')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('AMD')).toBe(false);
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should accept legitimate single-symbol analysis', async () => {
    const mockMessage = {
      id: 'test-msg-4',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'AAPL showing strong bullish momentum with breakout above $150 resistance. Technical analysis suggests target of $160. Chart shows clear uptrend continuation pattern.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(true);
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(1);
    
    const analysis = await analysisLinker.getLatestAnalysis('AAPL', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0].relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should accept legitimate multi-symbol analysis with proper content', async () => {
    const mockMessage = {
      id: 'test-msg-5',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'Market analysis shows tech sector strength. AAPL and TSLA both breaking key resistance levels. NVDA showing bullish momentum on earnings beat. Recommend watching these three for continuation patterns. Technical setup suggests upside targets.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('TSLA')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('NVDA')).toBe(true);
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(3);
  });

  test('should reject messages with high symbol density but no analysis', async () => {
    const mockMessage = {
      id: 'test-msg-6',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'AAPL TSLA NVDA GOOGL AMZN META watching today',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // Should be rejected due to high symbol density (low words per symbol)
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should handle edge case: few symbols with separator but substantial analysis', async () => {
    const mockMessage = {
      id: 'test-msg-7',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'Detailed market analysis for AAPL / TSLA pair trade opportunity. Both stocks showing strong technical setups with bullish momentum. AAPL breaking above 150 resistance while TSLA testing 800 support level. Risk/reward favors long positions with tight stops. Target prices suggest 8-10% upside potential on both names. Chart patterns align with broader market strength.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // Should be accepted due to substantial analysis content despite having separators
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('TSLA')).toBe(true);
  });

  test('should reject symbol lists even with minimal additional text', async () => {
    const mockMessage = {
      id: 'test-msg-8',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'Watchlist: AAPL / TSLA / NVDA / GOOGL / AMZN / META / MSFT / NFLX / ADBE for today',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should handle mixed content with both analysis and symbol lists', async () => {
    const mockMessage = {
      id: 'test-msg-9',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'Watchlist update: AAPL / TSLA / NVDA / GOOGL / AMZN / META / MSFT / NFLX for tomorrow session',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // Should be rejected due to symbol list pattern detection
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should accept messages with many symbols when analysis content is substantial', async () => {
    const mockMessage = {
      id: 'test-msg-10',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'Comprehensive sector analysis reveals strong bullish momentum across technology names. AAPL demonstrates exceptional chart strength with clean breakout above 150 resistance. TSLA consolidating near support with bullish divergence forming. NVDA earnings momentum continues with institutional accumulation evident. GOOGL shows technical rebound from key support level. AMZN breaking out of sideways consolidation pattern. Each position offers compelling risk/reward with clear stop levels and upside targets based on technical analysis.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // Should be accepted due to substantial analysis content (low symbol density)
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('TSLA')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('NVDA')).toBe(true);
    expect(analysisLinker.getTrackedSymbolsCount()).toBeGreaterThanOrEqual(3);
  });

  test('should properly calculate symbol density penalties', async () => {
    // Test message with very high symbol density (should be rejected)
    const highDensityMessage = {
      id: 'test-msg-11',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'AAPL TSLA NVDA GOOGL watch',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    await analysisLinker.indexMessage(highDensityMessage);
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);

    // Test message with balanced density (should be accepted)
    const balancedMessage = {
      id: 'test-msg-12',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'Strong technical analysis for AAPL shows bullish breakout momentum with clear resistance break above key levels. Recommendation is buy with target prices.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel-2', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    await analysisLinker.indexMessage(balancedMessage);
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(true);
  });

  test('should handle messages with no symbols', async () => {
    const mockMessage = {
      id: 'test-msg-13',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'Market looking strong today with good momentum across all sectors.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    // Should be ignored due to no symbols detected
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should handle bot messages correctly', async () => {
    const botMessage = {
      id: 'test-msg-14',
      author: { bot: true, id: 'bot1', tag: 'TestBot#1234' },
      content: 'AAPL / TSLA / NVDA / GOOGL / AMZN',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestBot' }
    } as any;

    await analysisLinker.indexMessage(botMessage);
    
    // Bot messages should be ignored completely
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });
});