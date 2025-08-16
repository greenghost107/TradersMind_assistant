import { test, expect } from '@playwright/test';
import { DatabaseService, AnalysisData } from '../src/services/DatabaseService';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

test.describe('Database Performance Tests', () => {
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

  test('should handle high message volume', async () => {
    const user = await databaseService.addUser('performance_test', 'PerformanceUser');
    
    // Simulate 100 messages in 1 minute
    const startTime = Date.now();
    const messageCount = 100;
    const symbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NFLX', 'AMD', 'INTC'];
    
    console.log(`Starting high volume test: ${messageCount} messages`);
    
    for (let i = 0; i < messageCount; i++) {
      const symbol = symbols[i % symbols.length];
      const analysisData: AnalysisData = {
        messageUrl: `https://discord.com/channels/123/456/${i + 1000}`,
        content: `Automated analysis #${i} for ${symbol}: Performance test data`,
        confidence: 0.5 + (Math.random() * 0.5), // Random confidence 0.5-1.0
        timestamp: new Date()
      };

      await databaseService.updateLatestAnalysis(`${symbol}_${i}`, user.id, analysisData);
      
      // Log progress every 25 messages
      if ((i + 1) % 25 === 0) {
        console.log(`Processed ${i + 1}/${messageCount} messages`);
      }
    }
    
    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const messagesPerSecond = (messageCount / durationMs) * 1000;
    
    console.log(`High volume test completed:`);
    console.log(`  Duration: ${durationMs}ms`);
    console.log(`  Messages per second: ${messagesPerSecond.toFixed(2)}`);
    
    // Performance assertions
    expect(durationMs).toBeLessThan(30000); // Should complete within 30 seconds
    expect(messagesPerSecond).toBeGreaterThan(1); // At least 1 message per second
    
    // Verify all data was processed correctly
    const finalCount = await databaseService.getUserAnalysisCount(user.id);
    expect(finalCount).toBe(messageCount);
    
    // Check database connection health
    const connectionInfo = await databaseService.getConnectionInfo();
    expect(connectionInfo.totalConnections).toBeLessThan(50); // Under our limit
    console.log(`Connection pool: ${connectionInfo.totalConnections} total, ${connectionInfo.idleConnections} idle`);
  });

  test('should cleanup old data efficiently', async () => {
    const user = await databaseService.addUser('cleanup_perf', 'CleanupUser');
    
    // Insert 1000+ old analysis records
    console.log('Inserting 1000 old analysis records...');
    const startInsert = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      const analysisData: AnalysisData = {
        messageUrl: `https://discord.com/channels/123/456/old_${i}`,
        content: `Old analysis record #${i}`,
        confidence: 0.5,
        timestamp: new Date('2024-01-01T00:00:00Z') // Very old timestamp
      };
      
      await databaseService.updateLatestAnalysis(`OLD_${i}`, user.id, analysisData);
      
      if ((i + 1) % 200 === 0) {
        console.log(`Inserted ${i + 1}/1000 old records`);
      }
    }
    
    const insertDuration = Date.now() - startInsert;
    console.log(`Insert completed in ${insertDuration}ms`);
    
    // Verify records were inserted
    const countBeforeCleanup = await databaseService.getUserAnalysisCount(user.id);
    expect(countBeforeCleanup).toBe(1000);
    
    // Run cleanup job
    console.log('Running cleanup job...');
    const startCleanup = Date.now();
    const cleanedCount = await databaseService.cleanupOldAnalysis(30); // 30 days retention
    const cleanupDuration = Date.now() - startCleanup;
    
    console.log(`Cleanup completed in ${cleanupDuration}ms`);
    console.log(`Cleaned ${cleanedCount} old records`);
    
    // Performance assertions
    expect(cleanupDuration).toBeLessThan(10000); // Should complete within 10 seconds
    expect(cleanedCount).toBe(1000); // All old records should be cleaned
    
    // Verify cleanup worked
    const countAfterCleanup = await databaseService.getUserAnalysisCount(user.id);
    expect(countAfterCleanup).toBe(0);
  });

  test('should handle 256MB RAM limit simulation', async () => {
    // Simulate memory-conscious operations
    const user = await databaseService.addUser('memory_test', 'MemoryUser');
    
    console.log('Testing memory-conscious operations...');
    
    // Test batch operations that could stress memory
    const batchSize = 50;
    const totalBatches = 10;
    
    for (let batch = 0; batch < totalBatches; batch++) {
      console.log(`Processing batch ${batch + 1}/${totalBatches}`);
      
      // Process batch of analyses
      const batchPromises = [];
      for (let i = 0; i < batchSize; i++) {
        const analysisData: AnalysisData = {
          messageUrl: `https://discord.com/channels/123/456/batch_${batch}_${i}`,
          content: `Batch ${batch} analysis ${i}: ${'x'.repeat(500)}`, // 500 char content
          confidence: 0.7,
          timestamp: new Date()
        };
        
        batchPromises.push(
          databaseService.updateLatestAnalysis(`BATCH_${batch}_${i}`, user.id, analysisData)
        );
      }
      
      // Wait for batch to complete
      await Promise.all(batchPromises);
      
      // Check memory usage indicators
      const connectionInfo = await databaseService.getConnectionInfo();
      expect(connectionInfo.totalConnections).toBeLessThan(50);
      
      // Simulate memory pressure by forcing garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
    
    const finalCount = await databaseService.getUserAnalysisCount(user.id);
    expect(finalCount).toBe(batchSize * totalBatches);
    
    console.log(`Memory test completed: ${finalCount} records processed`);
  });

  test('should maintain performance with concurrent access', async () => {
    // Create multiple users for concurrent testing
    const users = [];
    for (let i = 0; i < 5; i++) {
      const user = await databaseService.addUser(`concurrent_user_${i}`, `User${i}`);
      users.push(user);
    }
    
    console.log('Testing concurrent database access...');
    
    // Simulate concurrent operations from multiple bots/users
    const concurrentOperations = users.map(async (user, userIndex) => {
      const operations = [];
      
      for (let i = 0; i < 20; i++) {
        const analysisData: AnalysisData = {
          messageUrl: `https://discord.com/channels/123/456/concurrent_${userIndex}_${i}`,
          content: `Concurrent analysis from user ${userIndex}, operation ${i}`,
          confidence: 0.6 + (Math.random() * 0.4),
          timestamp: new Date()
        };
        
        operations.push(
          databaseService.updateLatestAnalysis(`CONC_${userIndex}_${i}`, user.id, analysisData)
        );
      }
      
      return Promise.all(operations);
    });
    
    const startTime = Date.now();
    await Promise.all(concurrentOperations);
    const duration = Date.now() - startTime;
    
    console.log(`Concurrent operations completed in ${duration}ms`);
    
    // Verify all operations completed successfully
    for (let i = 0; i < users.length; i++) {
      const userAnalysisCount = await databaseService.getUserAnalysisCount(users[i].id);
      expect(userAnalysisCount).toBe(20);
    }
    
    // Performance assertion
    expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
    
    // Test connection pool health after concurrent access
    const connectionInfo = await databaseService.getConnectionInfo();
    expect(connectionInfo.totalConnections).toBeLessThan(50);
    console.log(`Final connection pool state: ${connectionInfo.totalConnections} total`);
  });

  test('should handle query performance for large datasets', async () => {
    const user = await databaseService.addUser('query_perf', 'QueryPerfUser');
    
    // Insert substantial amount of data
    console.log('Inserting data for query performance test...');
    const symbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL'];
    
    for (const symbol of symbols) {
      // Insert 100 historical analyses per symbol
      for (let i = 0; i < 100; i++) {
        const analysisData: AnalysisData = {
          messageUrl: `https://discord.com/channels/123/456/query_${symbol}_${i}`,
          content: `Historical analysis ${i} for ${symbol}`,
          confidence: 0.5 + (Math.random() * 0.5),
          timestamp: new Date(Date.now() - (i * 1000 * 60 * 60)) // Spread over hours
        };
        
        await databaseService.updateLatestAnalysis(`${symbol}_HIST_${i}`, user.id, analysisData);
      }
    }
    
    console.log('Query performance test setup complete');
    
    // Test query performance
    const queryTests = [
      {
        name: 'Latest analysis query',
        operation: () => databaseService.getLatestAnalysis('AAPL_HIST_50', user.id)
      },
      {
        name: 'Analysis history query',
        operation: () => databaseService.getAnalysisHistory('AAPL_HIST_50', user.id)
      },
      {
        name: 'User analysis count',
        operation: () => databaseService.getUserAnalysisCount(user.id)
      },
      {
        name: 'All analysts for symbol',
        operation: () => databaseService.getAllAnalystsForSymbol('AAPL_HIST_50')
      }
    ];
    
    for (const test of queryTests) {
      const start = Date.now();
      const result = await test.operation();
      const duration = Date.now() - start;
      
      console.log(`${test.name}: ${duration}ms`);
      expect(duration).toBeLessThan(1000); // All queries should complete within 1 second
      expect(result).toBeDefined();
    }
  });
});