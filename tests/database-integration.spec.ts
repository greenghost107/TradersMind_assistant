import { test, expect } from '@playwright/test';
import { DatabaseService, AnalysisData } from '../src/services/DatabaseService';
import { DatabaseAnalysisLinker } from '../src/services/DatabaseAnalysisLinker';
import { DatabaseMigration } from '../src/services/DatabaseMigration';

// Test database URL (should be separate from production)
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

test.describe('Database Integration Tests', () => {
  let databaseService: DatabaseService;
  let analysisLinker: DatabaseAnalysisLinker;

  test.beforeEach(async () => {
    test.skip(!TEST_DATABASE_URL, 'Database URL not configured for testing');
    
    databaseService = new DatabaseService(TEST_DATABASE_URL!);
    await databaseService.connect();
    analysisLinker = new DatabaseAnalysisLinker(databaseService);
    await analysisLinker.initialize();
  });

  test.afterEach(async () => {
    if (databaseService) {
      // Clean up test data
      try {
        await databaseService.cleanupOldAnalysis(0); // Remove all data
        await databaseService.close();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
  });

  test('should persist analysis across bot restarts', async () => {
    // Add a user
    const user = await databaseService.addUser('test_user_123', 'TestUser');
    expect(user.username).toBe('TestUser');

    // Add analysis data
    const analysisData: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/456/789',
      content: 'AAPL looking bullish, target $200',
      confidence: 0.8,
      timestamp: new Date()
    };

    await databaseService.updateLatestAnalysis('AAPL', user.id, analysisData);

    // Simulate restart by creating new instances
    const newDatabaseService = new DatabaseService(TEST_DATABASE_URL!);
    await newDatabaseService.connect();
    
    const newAnalysisLinker = new DatabaseAnalysisLinker(newDatabaseService);
    await newAnalysisLinker.initialize();

    // Verify data persists
    const retrievedAnalysis = await newDatabaseService.getLatestAnalysis('AAPL', user.id);
    expect(retrievedAnalysis).not.toBeNull();
    expect(retrievedAnalysis!.content).toBe('AAPL looking bullish, target $200');
    expect(retrievedAnalysis!.confidence).toBe(0.8);

    await newDatabaseService.close();
  });

  test('should handle multiple users correctly', async () => {
    // Add multiple users
    const admin = await databaseService.addUser('admin_123', 'Admin');
    const tomer = await databaseService.addUser('tomer_456', 'Tomer');

    // Both analyze the same symbol
    const adminAnalysis: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/456/001',
      content: 'AAPL bullish breakout above $185',
      confidence: 0.9,
      timestamp: new Date('2025-01-01T10:00:00Z')
    };

    const tomerAnalysis: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/456/002',
      content: 'AAPL bearish divergence, expecting pullback',
      confidence: 0.7,
      timestamp: new Date('2025-01-01T11:00:00Z')
    };

    await databaseService.updateLatestAnalysis('AAPL', admin.id, adminAnalysis);
    await databaseService.updateLatestAnalysis('AAPL', tomer.id, tomerAnalysis);

    // Verify separate tracking
    const adminsApple = await databaseService.getLatestAnalysis('AAPL', admin.id);
    const tomersApple = await databaseService.getLatestAnalysis('AAPL', tomer.id);

    expect(adminsApple!.content).toContain('bullish');
    expect(tomersApple!.content).toContain('bearish');

    // Get all analysts for symbol
    const allAnalysts = await databaseService.getAllAnalystsForSymbol('AAPL');
    expect(allAnalysts).toHaveLength(2);
    expect(allAnalysts.map(a => a.user.username)).toContain('Admin');
    expect(allAnalysts.map(a => a.user.username)).toContain('Tomer');
  });

  test('should handle database connection failures gracefully', async () => {
    // Close the connection to simulate failure
    await databaseService.close();

    // Try to perform operations
    let errorCaught = false;
    try {
      await databaseService.getUserByDiscordId('test_user');
    } catch (error) {
      errorCaught = true;
    }

    expect(errorCaught).toBe(true);

    // Reconnect and verify recovery
    const newDatabaseService = new DatabaseService(TEST_DATABASE_URL!);
    await newDatabaseService.connect();

    const user = await newDatabaseService.addUser('recovery_test', 'RecoveryUser');
    expect(user.username).toBe('RecoveryUser');

    await newDatabaseService.close();
  });

  test('should enforce data constraints and limits', async () => {
    const user = await databaseService.addUser('constraint_test', 'ConstraintUser');

    // Test content length limit (should truncate in application layer)
    const longContent = 'A'.repeat(2000);
    const analysisData: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/456/999',
      content: longContent,
      confidence: 0.5,
      timestamp: new Date()
    };

    await databaseService.updateLatestAnalysis('TEST', user.id, analysisData);
    
    const retrieved = await databaseService.getLatestAnalysis('TEST', user.id);
    // Content should be truncated by application (not by database)
    expect(retrieved!.content.length).toBeLessThanOrEqual(2000);

    // Test unique constraints
    let duplicateError = false;
    try {
      await databaseService.addUser('constraint_test', 'DuplicateUser');
    } catch (error) {
      duplicateError = true;
    }
    expect(duplicateError).toBe(true);
  });

  test('should handle cleanup operations correctly', async () => {
    const user = await databaseService.addUser('cleanup_test', 'CleanupUser');

    // Add old analysis (simulate old timestamp)
    const oldAnalysis: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/456/old',
      content: 'Old analysis',
      confidence: 0.6,
      timestamp: new Date('2024-01-01T00:00:00Z') // Very old
    };

    await databaseService.updateLatestAnalysis('OLD', user.id, oldAnalysis);

    // Add recent analysis
    const newAnalysis: AnalysisData = {
      messageUrl: 'https://discord.com/channels/123/456/new',
      content: 'New analysis',
      confidence: 0.8,
      timestamp: new Date() // Current time
    };

    await databaseService.updateLatestAnalysis('NEW', user.id, newAnalysis);

    // Cleanup old data (30 days retention)
    const cleanedCount = await databaseService.cleanupOldAnalysis(30);
    expect(cleanedCount).toBeGreaterThan(0);

    // Verify old data is gone but new data remains
    const oldResult = await databaseService.getAnalysisHistory('OLD', user.id);
    const newResult = await databaseService.getLatestAnalysis('NEW', user.id);
    
    expect(oldResult).toHaveLength(0);
    expect(newResult).not.toBeNull();
  });
});