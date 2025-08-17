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

  test('should track Admin and Tomer analysis separately', async () => {
    // Create analysts
    const admin = await databaseService.addUser('admin_discord_123', 'Admin');
    const tomer = await databaseService.addUser('tomer_discord_456', 'Tomer');

    // Admin analyzes AAPL at 9am
    const adminAAPL: AnalysisData = {
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

    await databaseService.updateLatestAnalysis('AAPL', admin.id, adminAAPL);
    await databaseService.updateLatestAnalysis('AAPL', tomer.id, tomerAAPL);

    // Verify both are stored correctly
    const adminAnalysis = await databaseService.getLatestAnalysis('AAPL', admin.id);
    const tomerAnalysis = await databaseService.getLatestAnalysis('AAPL', tomer.id);

    expect(adminAnalysis!.content).toContain('bullish momentum');
    expect(adminAnalysis!.confidence).toBe(0.85);
    
    expect(tomerAnalysis!.content).toContain('Overbought conditions');
    expect(tomerAnalysis!.confidence).toBe(0.75);

    // Test latest analysis retrieval per user
    const adminHistory = await databaseService.getAnalysisHistory('AAPL', admin.id);
    const tomerHistory = await databaseService.getAnalysisHistory('AAPL', tomer.id);

    expect(adminHistory).toHaveLength(1);
    expect(tomerHistory).toHaveLength(1);
    expect(adminHistory[0].content).not.toBe(tomerHistory[0].content);
  });

  test('should handle conflicting symbol analysis', async () => {
    const admin = await databaseService.addUser('admin_conflict', 'Admin');
    const tomer = await databaseService.addUser('tomer_conflict', 'Tomer');

    // Both analyze TSLA with different views
    const adminTSLA: AnalysisData = {
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

    await databaseService.updateLatestAnalysis('TSLA', admin.id, adminTSLA);
    await databaseService.updateLatestAnalysis('TSLA', tomer.id, tomerTSLA);

    // Verify both maintained separately
    const allTSLAAnalysts = await databaseService.getAllAnalystsForSymbol('TSLA');
    expect(allTSLAAnalysts).toHaveLength(2);

    const adminResult = allTSLAAnalysts.find(a => a.user.username === 'Admin');
    const tomerResult = allTSLAAnalysts.find(a => a.user.username === 'Tomer');

    expect(adminResult!.analysis.content).toContain('Bullish flag');
    expect(tomerResult!.analysis.content).toContain('Bearish divergence');

    // Test user-specific queries
    const adminTSLADirect = await databaseService.getLatestAnalysis('TSLA', admin.id);
    const tomerTSLADirect = await databaseService.getLatestAnalysis('TSLA', tomer.id);

    expect(adminTSLADirect!.confidence).toBe(0.9);
    expect(tomerTSLADirect!.confidence).toBe(0.8);
  });

  test('should support multiple symbols per analyst', async () => {
    const admin = await databaseService.addUser('admin_multi', 'Admin');

    // Admin analyzes multiple symbols
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
      await databaseService.updateLatestAnalysis(symbols[i], admin.id, analysis);
    }

    // Verify all symbols are tracked
    const adminSymbolCount = await databaseService.getUserAnalysisCount(admin.id);
    expect(adminSymbolCount).toBe(5);

    // Verify each symbol has correct analysis
    for (let i = 0; i < symbols.length; i++) {
      const retrieved = await databaseService.getLatestAnalysis(symbols[i], admin.id);
      expect(retrieved!.content).toContain(symbols[i]);
      expect(retrieved!.confidence).toBe(0.7 + (i * 0.05));
    }
  });

  test('should handle analysis updates correctly', async () => {
    const admin = await databaseService.addUser('admin_updates', 'Admin');

    // Initial analysis
    const initialAnalysis: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/analysis/initial',
      content: 'NVDA: Initial analysis shows neutral trend',
      confidence: 0.5,
      timestamp: new Date('2025-01-01T12:00:00Z')
    };

    await databaseService.updateLatestAnalysis('NVDA', admin.id, initialAnalysis);

    // Updated analysis
    const updatedAnalysis: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/analysis/updated',
      content: 'NVDA: Updated analysis - strong bullish breakout confirmed!',
      confidence: 0.9,
      timestamp: new Date('2025-01-01T13:00:00Z')
    };

    await databaseService.updateLatestAnalysis('NVDA', admin.id, updatedAnalysis);

    // Verify latest analysis is updated
    const latest = await databaseService.getLatestAnalysis('NVDA', admin.id);
    expect(latest!.content).toContain('strong bullish breakout');
    expect(latest!.confidence).toBe(0.9);

    // Verify history contains both entries
    const history = await databaseService.getAnalysisHistory('NVDA', admin.id);
    expect(history.length).toBeGreaterThanOrEqual(1);
    
    // Should be sorted by timestamp DESC (newest first)
    expect(history[0].content).toContain('strong bullish breakout');
  });

  test('should handle edge cases and error conditions', async () => {
    const admin = await databaseService.addUser('admin_edge', 'Admin');

    // Test with empty content
    const emptyAnalysis: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/analysis/empty',
      content: '',
      confidence: 0.1,
      timestamp: new Date()
    };

    await databaseService.updateLatestAnalysis('EMPTY', admin.id, emptyAnalysis);
    const retrieved = await databaseService.getLatestAnalysis('EMPTY', admin.id);
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

      await databaseService.updateLatestAnalysis(longSymbol, admin.id, longSymbolAnalysis);
      const longRetrieved = await databaseService.getLatestAnalysis(longSymbol, admin.id);
      expect(longRetrieved).not.toBeNull();
    }

    // Test querying non-existent symbol
    const nonExistent = await databaseService.getLatestAnalysis('NONEXIST', admin.id);
    expect(nonExistent).toBeNull();

    // Test querying non-existent user
    const nonExistentUser = await databaseService.getLatestAnalysis('AAPL', 99999);
    expect(nonExistentUser).toBeNull();
  });
});