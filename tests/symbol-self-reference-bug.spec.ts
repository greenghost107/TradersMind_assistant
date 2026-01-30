import { test, expect } from '@playwright/test';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Symbol Self-Reference Bug Tests', () => {
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
  });

  test('should reproduce production bug: symbol list message causes all symbols to point to themselves', async () => {
    // Step 1: Create prior analysis messages for each symbol that should NOT be overwritten
    const symbols = ['STX', 'RMBS', 'W', 'WGS', 'ZS', 'SYM', 'TMDX', 'JPM', 'GS', 'MDB', 'IBKR', 'MMM'];
    const priorAnalysisTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const priorAnalysisMessages: any[] = [];

    // Create legitimate prior analysis for each symbol
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const priorMessage = {
        id: `prior-analysis-${i + 1}`,
        author: { bot: false, id: 'analyst1', tag: 'Analyst#1234' },
        content: `$${symbol} showing strong technical analysis with bullish momentum patterns. Target price suggests upside potential with clear resistance breaks.`,
        createdAt: new Date(priorAnalysisTime.getTime() + i * 1000), // Stagger by 1 second each
        guildId: 'test-guild',
        channel: { id: 'analysis-channel', isThread: () => false },
        member: { displayName: 'Analyst' },
        reference: null
      } as any;
      priorAnalysisMessages.push(priorMessage);

      // Index the prior analysis
      await analysisLinker.indexMessage(priorMessage);
    }

    // Verify all symbols have prior analysis indexed
    for (const symbol of symbols) {
      expect(analysisLinker.hasAnalysisFor(symbol)).toBe(true);
      const priorAnalysis = await analysisLinker.getLatestAnalysis(symbol, 1);
      expect(priorAnalysis).toHaveLength(1);
      expect(priorAnalysis[0]!.content).toContain('technical analysis');
    }

    // Step 2: Create the problematic symbol list message that causes the bug
    const symbolListTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago (newer than prior analysis)
    const symbolListMessage = {
      id: 'symbol-list-bug-message',
      author: { bot: false, id: 'user1', tag: 'User#1234' },
      content: 'STX / RMBS / W / WGS / ZS / SYM / TMDX / JPM / GS / MDB / IBKR / MMM 👀 @everyone',
      createdAt: symbolListTime,
      guildId: 'test-guild',
      channel: { id: 'analysis-channel', isThread: () => false },
      member: { displayName: 'User' },
      reference: null
    } as any;

    // Step 3: Index the symbol list message (this should trigger the bug if it exists)
    await analysisLinker.indexMessage(symbolListMessage);

    // Step 4: Check if the bug occurred - symbols now point to the symbol list message instead of prior analysis
    let bugDetected = false;
    const selfReferencingSymbols: string[] = [];

    for (const symbol of symbols) {
      const latestAnalysis = await analysisLinker.getLatestAnalysis(symbol, 1);
      if (latestAnalysis && latestAnalysis.length > 0) {
        const latestMessageId = latestAnalysis[0]!.messageId;
        const latestUrl = analysisLinker.getLatestAnalysisUrl(symbol);

        // Check if the symbol now points to the symbol list message (self-reference bug)
        if (latestMessageId === 'symbol-list-bug-message') {
          bugDetected = true;
          selfReferencingSymbols.push(symbol);
        }

        // Also check URL contains the symbol list message ID
        if (latestUrl && latestUrl.includes('symbol-list-bug-message')) {
          bugDetected = true;
          if (!selfReferencingSymbols.includes(symbol)) {
            selfReferencingSymbols.push(symbol);
          }
        }
      }
    }

    // Step 5: Report findings
    if (bugDetected) {
      console.log(`🐛 BUG DETECTED: ${selfReferencingSymbols.length} symbols point to the symbol list message instead of their prior analysis:`);
      console.log(`Self-referencing symbols: ${selfReferencingSymbols.join(', ')}`);

      // This assertion will fail if the bug exists, confirming the issue
      expect(selfReferencingSymbols).toHaveLength(0);
    } else {
      console.log('✅ Bug NOT detected: Symbol list was properly rejected or symbols still point to prior analysis');

      // Verify symbols still point to their prior analysis (expected behavior)
      for (const symbol of symbols) {
        const latestAnalysis = await analysisLinker.getLatestAnalysis(symbol, 1);
        expect(latestAnalysis).toHaveLength(1);
        expect(latestAnalysis[0]!.messageId).not.toBe('symbol-list-bug-message');
        expect(latestAnalysis[0]!.content).toContain('technical analysis');
      }
    }
  });

  test('should verify symbol list detection prevents the bug', async () => {
    // Test that the isSymbolList detection is working properly
    const symbolListMessage = {
      id: 'test-symbol-list',
      author: { bot: false, id: 'user1', tag: 'User#1234' },
      content: 'STX / RMBS / W / WGS / ZS / SYM / TMDX / JPM / GS / MDB / IBKR / MMM 👀 @everyone',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'User' },
      reference: null
    } as any;

    // This should be rejected due to symbol list pattern detection
    await analysisLinker.indexMessage(symbolListMessage);

    // Verify no symbols were indexed from this message
    const symbols = ['STX', 'RMBS', 'W', 'WGS', 'ZS', 'SYM', 'TMDX', 'JPM', 'GS', 'MDB', 'IBKR', 'MMM'];
    for (const symbol of symbols) {
      expect(analysisLinker.hasAnalysisFor(symbol)).toBe(false);
    }

    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should handle emoji and @everyone pattern specifically', async () => {
    // Test various patterns that might bypass detection
    const problematicPatterns = [
      'STX / RMBS / W / WGS / ZS / SYM / TMDX / JPM / GS / MDB / IBKR / MMM 👀 @everyone',
      'STX/RMBS/W/WGS/ZS/SYM/TMDX/JPM/GS/MDB/IBKR/MMM 👀 @everyone',
      'STX / RMBS / W / WGS / ZS / SYM / TMDX / JPM / GS / MDB / IBKR / MMM 👀',
      'STX / RMBS / W / WGS / ZS / SYM / TMDX / JPM / GS / MDB / IBKR / MMM @everyone'
    ];

    for (let i = 0; i < problematicPatterns.length; i++) {
      const pattern = problematicPatterns[i];
      const testMessage = {
        id: `pattern-test-${i}`,
        author: { bot: false, id: 'user1', tag: 'User#1234' },
        content: pattern,
        createdAt: new Date(Date.now() + i * 1000), // Stagger timestamps
        guildId: 'test-guild',
        channel: { id: 'test-channel', isThread: () => false },
        member: { displayName: 'User' },
        reference: null
      } as any;

      await analysisLinker.indexMessage(testMessage);
    }

    // None of these patterns should be indexed
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should reproduce bug with mixed prior analysis and symbol list chronologically', async () => {
    // Create a more realistic timeline where some symbols have recent analysis
    // and the symbol list message is the newest

    const baseTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

    // Some symbols have recent analysis (1 hour ago)
    const recentSymbols = ['STX', 'RMBS', 'W'];
    for (let i = 0; i < recentSymbols.length; i++) {
      const symbol = recentSymbols[i];
      const recentMessage = {
        id: `recent-analysis-${i}`,
        author: { bot: false, id: 'analyst1', tag: 'Analyst#1234' },
        content: `$${symbol} updated analysis showing continued momentum with technical breakout patterns above key resistance levels.`,
        createdAt: new Date(baseTime.getTime() + 60 * 60 * 1000 + i * 1000), // 1 hour ago
        guildId: 'test-guild',
        channel: { id: 'analysis-channel', isThread: () => false },
        member: { displayName: 'Analyst' },
        reference: null
      } as any;

      await analysisLinker.indexMessage(recentMessage);
    }

    // Other symbols have older analysis (2 hours ago)
    const olderSymbols = ['WGS', 'ZS', 'SYM', 'TMDX', 'JPM', 'GS', 'MDB', 'IBKR', 'MMM'];
    for (let i = 0; i < olderSymbols.length; i++) {
      const symbol = olderSymbols[i];
      const olderMessage = {
        id: `older-analysis-${i}`,
        author: { bot: false, id: 'analyst2', tag: 'Analyst2#1234' },
        content: `$${symbol} initial analysis with bullish technical setup showing strong momentum patterns.`,
        createdAt: new Date(baseTime.getTime() + i * 1000), // 2 hours ago
        guildId: 'test-guild',
        channel: { id: 'analysis-channel', isThread: () => false },
        member: { displayName: 'Analyst2' },
        reference: null
      } as any;

      await analysisLinker.indexMessage(olderMessage);
    }

    // Now the problematic symbol list message (newest - 30 minutes ago)
    const symbolListMessage = {
      id: 'newest-symbol-list',
      author: { bot: false, id: 'user1', tag: 'User#1234' },
      content: 'STX / RMBS / W / WGS / ZS / SYM / TMDX / JPM / GS / MDB / IBKR / MMM 👀 @everyone',
      createdAt: new Date(baseTime.getTime() + 90 * 60 * 1000), // 30 minutes ago (newest)
      guildId: 'test-guild',
      channel: { id: 'analysis-channel', isThread: () => false },
      member: { displayName: 'User' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(symbolListMessage);

    // Check if the newest symbol list message overwrote all prior analysis
    const allSymbols = [...recentSymbols, ...olderSymbols];
    let bugOccurred = false;

    for (const symbol of allSymbols) {
      const latestAnalysis = await analysisLinker.getLatestAnalysis(symbol, 1);
      if (latestAnalysis && latestAnalysis.length > 0) {
        const latestMessageId = latestAnalysis[0]!.messageId;
        if (latestMessageId === 'newest-symbol-list') {
          bugOccurred = true;
          console.log(`❌ ${symbol} now points to symbol list instead of prior analysis`);
        } else {
          console.log(`✅ ${symbol} still points to prior analysis (${latestMessageId})`);
        }
      }
    }

    // The test expects the bug NOT to occur (symbols should keep their prior analysis)
    expect(bugOccurred).toBe(false);
  });
});
