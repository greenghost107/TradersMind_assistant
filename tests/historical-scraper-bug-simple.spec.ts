import { AnalysisLinker } from '../src/services/AnalysisLinker';

describe('Historical Scraper Bug Reproduction', () => {
  test('should demonstrate chronological bug: newer symbol list overwrites older analysis', async () => {
    console.log('🧪 Testing chronological processing bug...');
    
    const analysisLinker = new AnalysisLinker();
    
    // Create timestamps that match the production scenario
    const legitimateAnalysisTime = new Date('2025-01-01T18:46:00Z'); // 18:46
    const symbolListTime = new Date('2025-01-01T19:50:00Z'); // 19:50 (newer)
    
    // Create the legitimate Hebrew analysis message for LMND (sent at 18:46)
    const legitimateAnalysis = {
      id: 'msg-legitimate-analysis',
      author: { bot: false, id: 'analyst1', tag: 'Analyst#1234' },
      content: 'למונייד $LMND👀\nנראה שהחלה תנועה מעל אזור הקונסוליצדיה מעל הבייס של סטייג\' 1\nבייס בצורת קאפ אנד הנדל בן 4 שנים מנובמבר 2021.\nבדרך כלל פרייס אקשן כזה יכול לעבוד ב-% מטורפים כשתנועה מתחילה,\n❗ כמה חבל שהיא מדווחת שבוע הבא ב-5 לנובמבר\nהמצגת ש- @Eli Alfa האלוף הכין עליה:',
      createdAt: legitimateAnalysisTime,
      guildId: 'test-guild',
      channel: { id: 'analysis-channel', isThread: () => false },
      member: { displayName: 'Analyst' },
      reference: null
    } as any;
    
    // Create the problematic symbol list message (sent at 19:50)
    const symbolListMessage = {
      id: 'msg-symbol-list',
      author: { bot: false, id: 'user1', tag: 'User#1234' },
      content: 'W / WGS / RKLB / STOK / MDB / SYM / LIF / LMND / AVAV / IBKR 👀\n@everyone',
      createdAt: symbolListTime,
      guildId: 'test-guild',
      channel: { id: 'analysis-channel', isThread: () => false },
      member: { displayName: 'User' },
      reference: null
    } as any;
    
    console.log('📝 Indexing legitimate Hebrew analysis first (18:46)...');
    await analysisLinker.indexMessage(legitimateAnalysis);
    
    // Verify the Hebrew analysis was indexed
    expect(analysisLinker.hasAnalysisFor('LMND')).toBe(true);
    let analysis = await analysisLinker.getLatestAnalysis('LMND', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]!.messageId).toBe('msg-legitimate-analysis');
    console.log('✅ Hebrew analysis indexed correctly');
    
    console.log('📝 Now indexing symbol list message (19:50)...');
    await analysisLinker.indexMessage(symbolListMessage);
    
    // Check what happened to LMND analysis
    analysis = await analysisLinker.getLatestAnalysis('LMND', 1);
    
    if (analysis && analysis.length > 0) {
      const latestMessageId = analysis[0]!.messageId;
      const latestTimestamp = analysis[0]!.timestamp;
      const latestContent = analysis[0]!.content.slice(0, 100);
      
      console.log(`🔍 LMND now points to:`);
      console.log(`  Message ID: ${latestMessageId}`);
      console.log(`  Timestamp: ${latestTimestamp}`);
      console.log(`  Content: "${latestContent}..."`);
      
      if (latestMessageId === 'msg-symbol-list') {
        console.log('❌ BUG CONFIRMED: Symbol list overwrote Hebrew analysis!');
        console.log('   This demonstrates the historical scraper bug where newer messages');
        console.log('   overwrite older legitimate analysis based on timestamp alone.');
        
        // In a real-time system, this should NOT happen because:
        // 1. Symbol list should be detected and rejected
        // 2. Quality should be considered over timestamp
        expect(latestMessageId).toBe('msg-legitimate-analysis');
      } else {
        console.log('✅ Good: Hebrew analysis preserved');
        console.log('   This means the symbol list was properly rejected');
        expect(latestMessageId).toBe('msg-legitimate-analysis');
      }
    } else {
      console.log('❌ No LMND analysis found at all');
      expect(analysis).toHaveLength(1);
    }
  });

  test('should verify that symbol list is properly rejected in real-time processing', async () => {
    console.log('🧪 Testing real-time symbol list rejection...');
    
    const analysisLinker = new AnalysisLinker();
    
    // Try to index just the symbol list message
    const symbolListMessage = {
      id: 'test-symbol-list',
      author: { bot: false, id: 'user1', tag: 'User#1234' },
      content: 'W / WGS / RKLB / STOK / MDB / SYM / LIF / LMND / AVAV / IBKR 👀\n@everyone',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'analysis-channel', isThread: () => false },
      member: { displayName: 'User' },
      reference: null
    } as any;
    
    await analysisLinker.indexMessage(symbolListMessage);
    
    // This should be rejected
    expect(analysisLinker.hasAnalysisFor('LMND')).toBe(false);
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
    
    console.log('✅ Symbol list properly rejected by real-time processing');
  });

  test('should show the difference between real-time and historical processing logic', () => {
    console.log('🧪 Demonstrating the difference...');
    console.log('');
    console.log('🔄 Real-time Processing (AnalysisLinker):');
    console.log('  1. Detects symbol list patterns');
    console.log('  2. Applies relevance scoring (0.7 threshold)');
    console.log('  3. Rejects symbol lists (score ~0.1)');
    console.log('  4. Preserves quality analysis');
    console.log('');
    console.log('📚 Historical Processing (HistoricalScraper):');
    console.log('  1. Uses basic scoring (length + attachments)');
    console.log('  2. No symbol list pattern detection');
    console.log('  3. Simple timestamp comparison for overwrites');
    console.log('  4. Newer messages overwrite older ones');
    console.log('');
    console.log('❌ The Bug:');
    console.log('  Historical scraper allows newer symbol lists to overwrite');
    console.log('  older legitimate analysis because it only checks timestamps.');
    console.log('');
    console.log('✅ The Fix:');
    console.log('  Historical scraper should use the same quality-based logic');
    console.log('  as real-time processing to preserve legitimate analysis.');
    
    expect(true).toBe(true); // This test always passes, it's just for documentation
  });
});