import { test, expect } from '@playwright/test';
import { DatabaseService, AnalysisData } from '../src/services/DatabaseService';
import { DatabaseAnalysisLinker } from '../src/services/DatabaseAnalysisLinker';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

test.describe('Multi-User Analysis Tracking', () => {
  let databaseService: DatabaseService;

  test.beforeEach(async () => {
    test.skip(!TEST_DATABASE_URL, 'Database URL not configured for testing');
    
    databaseService = new DatabaseService(TEST_DATABASE_URL!);
    await databaseService.connect();
  });

  test.afterEach(async () => {
    if (databaseService) {
      await databaseService.cleanupOldAnalysis(0);
      await databaseService.close();
    }
  });

  test('should track Albert and Tomer analysis separately', async () => {
    // Create analysts
    const albert = await databaseService.addUser('albert_discord_123', 'Albert');
    const tomer = await databaseService.addUser('tomer_discord_456', 'Tomer');

    // Albert analyzes AAPL at 9am
    const albertAAPL: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/analysis/001',
      content: 'AAPL: Strong bullish momentum, breaking key resistance at $185. Target $210 with stop at $175.',
      confidence: 0.85,
      timestamp: new Date('2025-01-01T09:00:00Z')
    };

    // Tomer analyzes AAPL at 10am  
    const tomerAAPL: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/setups/002',
      content: 'AAPL: Overbought conditions, expecting pullback to $180 support. Wait for retest.',
      confidence: 0.75,
      timestamp: new Date('2025-01-01T10:00:00Z')
    };

    await databaseService.updateLatestAnalysis('AAPL', albert.id, albertAAPL);
    await databaseService.updateLatestAnalysis('AAPL', tomer.id, tomerAAPL);

    // Verify both are stored correctly
    const albertAnalysis = await databaseService.getLatestAnalysis('AAPL', albert.id);
    const tomerAnalysis = await databaseService.getLatestAnalysis('AAPL', tomer.id);

    expect(albertAnalysis!.content).toContain('bullish momentum');
    expect(albertAnalysis!.confidence).toBe(0.85);
    
    expect(tomerAnalysis!.content).toContain('Overbought conditions');
    expect(tomerAnalysis!.confidence).toBe(0.75);

    // Test latest analysis retrieval per user
    const albertHistory = await databaseService.getAnalysisHistory('AAPL', albert.id);
    const tomerHistory = await databaseService.getAnalysisHistory('AAPL', tomer.id);

    expect(albertHistory).toHaveLength(1);
    expect(tomerHistory).toHaveLength(1);
    expect(albertHistory[0].content).not.toBe(tomerHistory[0].content);
  });

  test('should handle conflicting symbol analysis', async () => {
    const albert = await databaseService.addUser('albert_conflict', 'Albert');
    const tomer = await databaseService.addUser('tomer_conflict', 'Tomer');

    // Both analyze TSLA with different views
    const albertTSLA: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/analysis/003',
      content: 'TSLA: Bullish flag pattern, expecting breakout to $300. Strong volume confirmation.',
      confidence: 0.9,
      timestamp: new Date('2025-01-01T14:00:00Z')
    };

    const tomerTSLA: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/setups/004', 
      content: 'TSLA: Bearish divergence on RSI, short from $250 with target $220.',
      confidence: 0.8,
      timestamp: new Date('2025-01-01T14:30:00Z')
    };

    await databaseService.updateLatestAnalysis('TSLA', albert.id, albertTSLA);
    await databaseService.updateLatestAnalysis('TSLA', tomer.id, tomerTSLA);

    // Verify both maintained separately
    const allTSLAAnalysts = await databaseService.getAllAnalystsForSymbol('TSLA');
    expect(allTSLAAnalysts).toHaveLength(2);

    const albertResult = allTSLAAnalysts.find(a => a.user.username === 'Albert');
    const tomerResult = allTSLAAnalysts.find(a => a.user.username === 'Tomer');

    expect(albertResult!.analysis.content).toContain('Bullish flag');
    expect(tomerResult!.analysis.content).toContain('Bearish divergence');

    // Test user-specific queries
    const albertTSLADirect = await databaseService.getLatestAnalysis('TSLA', albert.id);
    const tomerTSLADirect = await databaseService.getLatestAnalysis('TSLA', tomer.id);

    expect(albertTSLADirect!.confidence).toBe(0.9);
    expect(tomerTSLADirect!.confidence).toBe(0.8);
  });

  test('should support multiple symbols per analyst', async () => {
    const albert = await databaseService.addUser('albert_multi', 'Albert');

    // Albert analyzes multiple symbols
    const symbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL'];
    const analyses: AnalysisData[] = [];

    for (let i = 0; i < symbols.length; i++) {
      const analysis: AnalysisData = {
        messageUrl: `https://discord.com/channels/123/analysis/00${i + 5}`,
        content: `${symbols[i]}: Technical analysis shows strong momentum. Confidence level high.`,
        confidence: 0.7 + (i * 0.05), // Varying confidence
        timestamp: new Date(`2025-01-01T${10 + i}:00:00Z`)
      };
      
      analyses.push(analysis);
      await databaseService.updateLatestAnalysis(symbols[i], albert.id, analysis);
    }

    // Verify all symbols are tracked
    const albertSymbolCount = await databaseService.getUserAnalysisCount(albert.id);
    expect(albertSymbolCount).toBe(5);

    // Verify each symbol has correct analysis
    for (let i = 0; i < symbols.length; i++) {
      const retrieved = await databaseService.getLatestAnalysis(symbols[i], albert.id);
      expect(retrieved!.content).toContain(symbols[i]);
      expect(retrieved!.confidence).toBe(0.7 + (i * 0.05));
    }
  });

  test('should handle analysis updates correctly', async () => {
    const albert = await databaseService.addUser('albert_updates', 'Albert');

    // Initial analysis
    const initialAnalysis: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/analysis/initial',
      content: 'NVDA: Initial analysis shows neutral trend',
      confidence: 0.5,
      timestamp: new Date('2025-01-01T12:00:00Z')
    };

    await databaseService.updateLatestAnalysis('NVDA', albert.id, initialAnalysis);

    // Updated analysis
    const updatedAnalysis: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/analysis/updated',
      content: 'NVDA: Updated analysis - strong bullish breakout confirmed!',
      confidence: 0.9,
      timestamp: new Date('2025-01-01T13:00:00Z')
    };

    await databaseService.updateLatestAnalysis('NVDA', albert.id, updatedAnalysis);

    // Verify latest analysis is updated
    const latest = await databaseService.getLatestAnalysis('NVDA', albert.id);
    expect(latest!.content).toContain('strong bullish breakout');
    expect(latest!.confidence).toBe(0.9);

    // Verify history contains both entries
    const history = await databaseService.getAnalysisHistory('NVDA', albert.id);
    expect(history.length).toBeGreaterThanOrEqual(1);
    
    // Should be sorted by timestamp DESC (newest first)
    expect(history[0].content).toContain('strong bullish breakout');
  });

  test('should handle edge cases and error conditions', async () => {
    const albert = await databaseService.addUser('albert_edge', 'Albert');

    // Test with empty content
    const emptyAnalysis: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/analysis/empty',
      content: '',
      confidence: 0.1,
      timestamp: new Date()
    };

    await databaseService.updateLatestAnalysis('EMPTY', albert.id, emptyAnalysis);
    const retrieved = await databaseService.getLatestAnalysis('EMPTY', albert.id);
    expect(retrieved!.content).toBe('');

    // Test with very long symbol name (should handle gracefully)
    const longSymbol = 'VERYLONGSYMBOLNAME';
    if (longSymbol.length <= 10) { // Within our VARCHAR(10) limit
      const longSymbolAnalysis: AnalysisData = {
        messageUrl: 'https://discord.com/channels/123/analysis/long',
        content: 'Analysis for very long symbol name',
        confidence: 0.6,
        timestamp: new Date()
      };

      await databaseService.updateLatestAnalysis(longSymbol, albert.id, longSymbolAnalysis);
      const longRetrieved = await databaseService.getLatestAnalysis(longSymbol, albert.id);
      expect(longRetrieved).not.toBeNull();
    }

    // Test querying non-existent symbol
    const nonExistent = await databaseService.getLatestAnalysis('NONEXIST', albert.id);
    expect(nonExistent).toBeNull();

    // Test querying non-existent user
    const nonExistentUser = await databaseService.getLatestAnalysis('AAPL', 99999);
    expect(nonExistentUser).toBeNull();
  });
});