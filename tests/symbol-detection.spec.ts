import { test, expect } from '@playwright/test';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Symbol Detection', () => {
  let symbolDetector: SymbolDetector;
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    symbolDetector = new SymbolDetector();
    analysisLinker = new AnalysisLinker();
  });

  test('should detect stock symbols in first line of message', () => {
    const message = 'AAPL is showing strong bullish signals\nThis is additional analysis content\nWith more details...';
    const symbols = symbolDetector.detectSymbols(message.split('\n')[0]!);
    
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.symbol).toBe('AAPL');
    expect(symbols[0]!.confidence).toBeGreaterThan(0.5);
  });

  test('should detect multiple symbols in first line', () => {
    const message = 'AAPL TSLA MSFT are all showing positive momentum\nDetailed analysis follows...';
    const symbols = symbolDetector.detectSymbols(message.split('\n')[0]!);
    
    expect(symbols.length).toBeGreaterThanOrEqual(3);
    expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['AAPL', 'TSLA', 'MSFT']));
  });

  test('should filter out common words', () => {
    const message = 'THE QUICK BROWN FOX jumps over AAPL';
    const symbols = symbolDetector.detectSymbols(message);
    
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.symbol).toBe('AAPL');
  });

  test('should boost confidence for $ prefix', () => {
    const message1 = 'AAPL is looking good';
    const message2 = '$AAPL is looking good';
    
    const symbols1 = symbolDetector.detectSymbols(message1);
    const symbols2 = symbolDetector.detectSymbols(message2);
    
    expect(symbols1).toHaveLength(1);
    expect(symbols2).toHaveLength(1);
    expect(symbols2[0]!.confidence).toBeGreaterThan(symbols1[0]!.confidence);
  });

  test('should validate symbol length and format', () => {
    const message = 'A I AAPL MICROSOFT TOOLONG';
    const symbols = symbolDetector.detectSymbols(message);
    
    // Should include A, I (valid single letters), AAPL (valid length)
    // Should exclude MICROSOFT (too long), TOOLONG (too long)
    expect(symbols.length).toBeGreaterThanOrEqual(1);
    expect(symbols.some(s => s.symbol === 'AAPL')).toBe(true);
  });

  test('should detect symbols with emojis in message', () => {
    const message = 'DOCS$ 🤌';
    const symbols = symbolDetector.detectSymbols(message);
    
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.symbol).toBe('DOCS');
    expect(symbols[0]!.confidence).toBeGreaterThan(0.5); // Should have $ prefix boost
  });

  test('should detect symbols mixed with emojis and other characters', () => {
    const message = 'AAPL 📈 TSLA 🚀 MSFT 💻';
    const symbols = symbolDetector.detectSymbols(message);
    
    expect(symbols.length).toBe(3);
    expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['AAPL', 'TSLA', 'MSFT']));
  });

  test('should handle symbols with various Unicode characters nearby', () => {
    const message = '🔥NVDA🔥 💎AMZN💎 ⚡GOOGL⚡';
    const symbols = symbolDetector.detectSymbols(message);
    
    expect(symbols.length).toBe(3);
    expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['NVDA', 'AMZN', 'GOOGL']));
  });

  test('should detect symbols in emoji-rich Discord messages', () => {
    const message = 'Check out AAPL 🍎 and TSLA 🚗 today! Both looking bullish 📊📈';
    const symbols = symbolDetector.detectSymbols(message);
    
    expect(symbols.length).toBe(2);
    expect(symbols.map(s => s.symbol)).toEqual(expect.arrayContaining(['AAPL', 'TSLA']));
  });
});

test.describe('Analysis Linking', () => {
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
  });

  test('should create proper message URL format', async () => {
    const mockMessage = {
      id: '123456789',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nThis is analysis content',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    const url = analysisLinker.getLatestAnalysisUrl('AAPL');
    
    expect(url).toBe('https://discord.com/channels/987654321/456789123/123456789');
  });

  test('should extract symbol from first line only', async () => {
    const mockMessage = {
      id: '123456789',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nDetailed analysis content here. This mentions TSLA but it should not be indexed since TSLA is not in the first line.',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.getLatestAnalysisUrl('AAPL')).toBeTruthy();
    expect(analysisLinker.getLatestAnalysisUrl('TSLA')).toBeNull();
  });

  test('should store latest analysis per symbol', async () => {
    const mockMessage1 = {
      id: '111111111',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nFirst analysis',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(Date.now() - 60000), // 1 minute ago
      channel: { id: '456789123' }
    } as any;

    const mockMessage2 = {
      id: '222222222',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nSecond analysis (more recent)',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(), // Now
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockMessage1);
    await analysisLinker.indexMessage(mockMessage2);
    
    const latestUrl = analysisLinker.getLatestAnalysisUrl('AAPL');
    expect(latestUrl).toBe('https://discord.com/channels/987654321/456789123/222222222');
  });

  test('should extract symbols with emojis from first line of analysis', async () => {
    const mockMessage = {
      id: '333333333',
      guildId: '987654321',
      channelId: '456789123',
      content: 'DOCS$ 🤌\nThis is analysis for DOCS with emojis\nSecond line mentions other stocks but should be ignored',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.getLatestAnalysisUrl('DOCS')).toBeTruthy();
    expect(analysisLinker.getLatestAnalysisUrl('DOCS')).toBe('https://discord.com/channels/987654321/456789123/333333333');
  });

  test('should handle multiple symbols with emojis in first line', async () => {
    const mockMessage = {
      id: '444444444',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL 🍎 TSLA 🚗 MSFT 💻\nMultiple tech stocks analysis with emojis',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.getLatestAnalysisUrl('AAPL')).toBeTruthy();
    expect(analysisLinker.getLatestAnalysisUrl('TSLA')).toBeTruthy();
    expect(analysisLinker.getLatestAnalysisUrl('MSFT')).toBeTruthy();
    
    // All should point to the same message
    const urls = ['AAPL', 'TSLA', 'MSFT'].map(symbol => 
      analysisLinker.getLatestAnalysisUrl(symbol)
    );
    expect(urls.every(url => url === 'https://discord.com/channels/987654321/456789123/444444444')).toBe(true);
  });

  test('should initialize from historical data map', async () => {
    const historicalData = new Map();
    
    const analysisData1 = {
      messageId: 'hist1',
      channelId: '111111111',
      authorId: 'analyst1',
      content: 'AAPL\nHistorical Apple analysis',
      symbols: ['AAPL'],
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      relevanceScore: 0.8,
      messageUrl: 'https://discord.com/channels/999/111111111/hist1'
    };
    
    const analysisData2 = {
      messageId: 'hist2',
      channelId: '222222222',
      authorId: 'analyst2',
      content: 'TSLA 🚗\nHistorical Tesla analysis with emoji',
      symbols: ['TSLA'],
      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
      relevanceScore: 0.9,
      messageUrl: 'https://discord.com/channels/999/222222222/hist2'
    };
    
    historicalData.set('AAPL', analysisData1);
    historicalData.set('TSLA', analysisData2);
    
    // Initialize from historical data
    analysisLinker.initializeFromHistoricalData(historicalData);
    
    // Verify data was loaded correctly
    expect(analysisLinker.getLatestAnalysisUrl('AAPL')).toBe('https://discord.com/channels/999/111111111/hist1');
    expect(analysisLinker.getLatestAnalysisUrl('TSLA')).toBe('https://discord.com/channels/999/222222222/hist2');
    
    // Verify getLatestAnalysis also works
    const appleAnalyses = await analysisLinker.getLatestAnalysis('AAPL');
    expect(appleAnalyses).toHaveLength(1);
    expect(appleAnalyses[0]!.content).toBe('AAPL\nHistorical Apple analysis');
    
    const teslaAnalyses = await analysisLinker.getLatestAnalysis('TSLA');
    expect(teslaAnalyses).toHaveLength(1);
    expect(teslaAnalyses[0]!.content).toBe('TSLA 🚗\nHistorical Tesla analysis with emoji');
  });

  test('should clear existing data when initializing from historical data', async () => {
    // First add some data through normal message indexing
    const mockMessage = {
      id: 'existing123',
      guildId: '987654321',
      channelId: '456789123',
      content: 'MSFT\nExisting analysis',
      author: { bot: false, tag: 'TestUser#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    expect(analysisLinker.getLatestAnalysisUrl('MSFT')).toBeTruthy();
    
    // Now initialize with historical data (should clear existing)
    const historicalData = new Map();
    const analysisData = {
      messageId: 'hist1',
      channelId: '111111111',
      authorId: 'analyst1',
      content: 'AAPL\nHistorical analysis only',
      symbols: ['AAPL'],
      timestamp: new Date(),
      relevanceScore: 0.8,
      messageUrl: 'https://discord.com/channels/999/111111111/hist1'
    };
    
    historicalData.set('AAPL', analysisData);
    analysisLinker.initializeFromHistoricalData(historicalData);
    
    // Old data should be cleared, new data should be loaded
    expect(analysisLinker.getLatestAnalysisUrl('MSFT')).toBeNull();
    expect(analysisLinker.getLatestAnalysisUrl('AAPL')).toBe('https://discord.com/channels/999/111111111/hist1');
  });
});