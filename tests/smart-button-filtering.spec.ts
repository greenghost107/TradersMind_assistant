import { test, expect } from '@playwright/test';
import { EphemeralHandler } from '../src/services/EphemeralHandler';
import { AnalysisLinker } from '../src/services/AnalysisLinker';
import { ChannelScanner } from '../src/services/ChannelScanner';
import { SymbolDetector } from '../src/services/SymbolDetector';

test.describe('Smart Button Filtering', () => {
  let ephemeralHandler: EphemeralHandler;
  let analysisLinker: AnalysisLinker;
  let channelScanner: ChannelScanner;
  let symbolDetector: SymbolDetector;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
    ephemeralHandler = new EphemeralHandler(analysisLinker);
    symbolDetector = new SymbolDetector();
    channelScanner = new ChannelScanner(symbolDetector, ephemeralHandler, analysisLinker);
  });

  test('should only create buttons for symbols with analysis data', async () => {
    // Index analysis for only AAPL
    const mockAnalysisMessage = {
      id: '111111111',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nStrong bullish signals with price target of $200',
      author: { bot: false, tag: 'Analyst#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' },
      attachments: new Map(),
      embeds: []
    } as any;

    await analysisLinker.indexMessage(mockAnalysisMessage);

    let buttonCount = 0;
    let buttonsCreated: string[] = [];

    const mockMessage = {
      id: '123456789',
      content: 'Check out AAPL, TSLA, and MSFT today!',
      author: { bot: false, tag: 'TestUser#1234' },
      channel: { id: '456789123' },
      member: { nickname: 'TestUser' },
      reply: async (options: any) => {
        if (options.components && options.components.length > 0) {
          for (const row of options.components) {
            for (const button of row.components) {
              buttonCount++;
              const label = button.data.label;
              buttonsCreated.push(label);
            }
          }
        }
      }
    } as any;

    const symbols = [
      { symbol: 'AAPL', confidence: 0.8, position: 10 },
      { symbol: 'TSLA', confidence: 0.7, position: 20 },
      { symbol: 'MSFT', confidence: 0.6, position: 30 }
    ];

    await ephemeralHandler.createSymbolButtons(mockMessage, symbols);

    expect(buttonCount).toBe(1);
    expect(buttonsCreated).toContain('📊 $AAPL');
    expect(buttonsCreated).not.toContain('📊 $TSLA');
    expect(buttonsCreated).not.toContain('📊 $MSFT');
  });

  test('should filter out symbols without analysis data', async () => {
    let replyCallCount = 0;

    const mockMessage = {
      id: '123456789',
      content: 'Check out UNKNOWN, FAKE, and INVALID symbols!',
      author: { bot: false, tag: 'TestUser#1234' },
      channel: { id: '456789123' },
      member: { nickname: 'TestUser' },
      reply: async (options: any) => {
        replyCallCount++;
      }
    } as any;

    const symbols = [
      { symbol: 'UNKNOWN', confidence: 0.8, position: 10 },
      { symbol: 'FAKE', confidence: 0.7, position: 20 },
      { symbol: 'INVALID', confidence: 0.6, position: 30 }
    ];

    await ephemeralHandler.createSymbolButtons(mockMessage, symbols);

    expect(replyCallCount).toBe(0);
  });

  test('should show no buttons when no symbols have analysis', async () => {
    const config = {
      generalNoticesChannel: '456789123',
      analysisChannels: ['999999999']
    };

    let replyCallCount = 0;

    const mockMessage = {
      channelId: '456789123',
      id: '123456789',
      content: 'Check out UNKNOWN and FAKE symbols!',
      author: { bot: false, tag: 'TestUser#1234' },
      member: { nickname: 'TestUser' },
      reply: async (options: any) => {
        replyCallCount++;
      }
    } as any;

    await channelScanner.handleMessage(mockMessage, config);

    expect(replyCallCount).toBe(0);
  });

  test('should handle mixed scenario: some symbols have analysis, some dont', async () => {
    // Index analysis for AAPL and MSFT only
    const aaplAnalysis = {
      id: '111111111',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nBullish outlook for Q4',
      author: { bot: false, tag: 'Analyst#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' },
      attachments: new Map(),
      embeds: []
    } as any;

    const msftAnalysis = {
      id: '222222222',
      guildId: '987654321',
      channelId: '456789123',
      content: 'MSFT\nCloud growth accelerating',
      author: { bot: false, tag: 'Analyst#5678' },
      createdAt: new Date(),
      channel: { id: '456789123' },
      attachments: new Map(),
      embeds: []
    } as any;

    await analysisLinker.indexMessage(aaplAnalysis);
    await analysisLinker.indexMessage(msftAnalysis);

    let buttonCount = 0;
    let buttonsCreated: string[] = [];

    const mockMessage = {
      id: '123456789',
      content: 'Check out AAPL, TSLA, MSFT, and UNKNOWN symbols!',
      author: { bot: false, tag: 'TestUser#1234' },
      channel: { id: '456789123' },
      member: { nickname: 'TestUser' },
      reply: async (options: any) => {
        if (options.components && options.components.length > 0) {
          for (const row of options.components) {
            for (const button of row.components) {
              buttonCount++;
              buttonsCreated.push(button.data.label);
            }
          }
        }
      }
    } as any;

    const symbols = [
      { symbol: 'AAPL', confidence: 0.8, position: 10 },
      { symbol: 'TSLA', confidence: 0.7, position: 20 },
      { symbol: 'MSFT', confidence: 0.6, position: 30 },
      { symbol: 'UNKNOWN', confidence: 0.5, position: 40 }
    ];

    await ephemeralHandler.createSymbolButtons(mockMessage, symbols);

    expect(buttonCount).toBe(2);
    expect(buttonsCreated).toContain('📊 $AAPL');
    expect(buttonsCreated).toContain('📊 $MSFT');
    expect(buttonsCreated).not.toContain('📊 $TSLA');
    expect(buttonsCreated).not.toContain('📊 $UNKNOWN');
  });

  test('should create buttons when analysis is added after symbol detection', async () => {
    // First, try to create buttons with no analysis
    let initialButtonCount = 0;

    const mockMessage = {
      id: '123456789',
      content: 'Check out NVDA today!',
      author: { bot: false, tag: 'TestUser#1234' },
      channel: { id: '456789123' },
      member: { nickname: 'TestUser' },
      reply: async (options: any) => {
        if (options.components && options.components.length > 0) {
          for (const row of options.components) {
            initialButtonCount += row.components.length;
          }
        }
      }
    } as any;

    const symbols = [
      { symbol: 'NVDA', confidence: 0.8, position: 10 }
    ];

    await ephemeralHandler.createSymbolButtons(mockMessage, symbols);
    expect(initialButtonCount).toBe(0);

    // Now add analysis for NVDA
    const nvdaAnalysis = {
      id: '333333333',
      guildId: '987654321',
      channelId: '456789123',
      content: 'NVDA\nAI revolution driving growth',
      author: { bot: false, tag: 'Analyst#9999' },
      createdAt: new Date(),
      channel: { id: '456789123' },
      attachments: new Map(),
      embeds: []
    } as any;

    await analysisLinker.indexMessage(nvdaAnalysis);

    // Try creating buttons again - should work now
    let secondButtonCount = 0;
    let buttonsCreated: string[] = [];

    const mockMessage2 = {
      id: '987654321',
      content: 'Check out NVDA today!',
      author: { bot: false, tag: 'TestUser#1234' },
      channel: { id: '456789123' },
      member: { nickname: 'TestUser' },
      reply: async (options: any) => {
        if (options.components && options.components.length > 0) {
          for (const row of options.components) {
            for (const button of row.components) {
              secondButtonCount++;
              buttonsCreated.push(button.data.label);
            }
          }
        }
      }
    } as any;

    await ephemeralHandler.createSymbolButtons(mockMessage2, symbols);

    expect(secondButtonCount).toBe(1);
    expect(buttonsCreated).toContain('📊 $NVDA');
  });

  test('should respect Discord button limits with filtered symbols', async () => {
    // Index analysis for many symbols
    for (let i = 0; i < 30; i++) {
      const symbol = `SYM${i.toString().padStart(2, '0')}`;
      const analysisMessage = {
        id: `msg${i}`,
        guildId: '987654321',
        channelId: '456789123',
        content: `${symbol}\nAnalysis for ${symbol}`,
        author: { bot: false, tag: 'Analyst#1234' },
        createdAt: new Date(),
        channel: { id: '456789123' },
        attachments: new Map(),
        embeds: []
      } as any;
      
      await analysisLinker.indexMessage(analysisMessage);
    }

    let totalButtons = 0;

    const mockMessage = {
      id: '123456789',
      content: 'Many symbols here',
      author: { bot: false, tag: 'TestUser#1234' },
      channel: { id: '456789123' },
      member: { nickname: 'TestUser' },
      reply: async (options: any) => {
        if (options.components && options.components.length > 0) {
          for (const row of options.components) {
            totalButtons += row.components.length;
          }
        }
      }
    } as any;

    // Create 30 symbols - all with analysis
    const symbols = Array.from({ length: 30 }, (_, i) => ({
      symbol: `SYM${i.toString().padStart(2, '0')}`,
      confidence: 0.5,
      position: i * 10
    }));

    await ephemeralHandler.createSymbolButtons(mockMessage, symbols);

    expect(totalButtons).toBeLessThanOrEqual(25); // Discord max buttons
  });

  test('should work with ChannelScanner integration', async () => {
    // Index analysis for AAPL
    const aaplAnalysis = {
      id: '111111111',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nStrong buy recommendation',
      author: { bot: false, tag: 'Analyst#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' },
      attachments: new Map(),
      embeds: []
    } as any;

    await analysisLinker.indexMessage(aaplAnalysis);

    const config = {
      generalNoticesChannel: '456789123',
      analysisChannels: ['999999999']
    };

    let buttonCount = 0;
    let buttonsCreated: string[] = [];

    const mockMessage = {
      channelId: '456789123',
      id: '123456789',
      content: 'Check out AAPL and TSLA today!',
      author: { bot: false, tag: 'TestUser#1234' },
      member: { nickname: 'TestUser' },
      reply: async (options: any) => {
        if (options.components && options.components.length > 0) {
          for (const row of options.components) {
            for (const button of row.components) {
              buttonCount++;
              buttonsCreated.push(button.data.label);
            }
          }
        }
      }
    } as any;

    await channelScanner.handleMessage(mockMessage, config);

    expect(buttonCount).toBe(1);
    expect(buttonsCreated).toContain('📊 $AAPL');
    expect(buttonsCreated).not.toContain('📊 $TSLA');
  });

  test('should check hasAnalysisFor method works correctly', async () => {
    // No analysis initially
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('TSLA')).toBe(false);

    // Add analysis for AAPL
    const aaplAnalysis = {
      id: '111111111',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nPositive earnings outlook',
      author: { bot: false, tag: 'Analyst#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' },
      attachments: new Map(),
      embeds: []
    } as any;

    await analysisLinker.indexMessage(aaplAnalysis);

    // Check availability
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('TSLA')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('MSFT')).toBe(false);
  });

  test('should check getAvailableSymbols method works correctly', async () => {
    // No symbols initially
    expect(analysisLinker.getAvailableSymbols()).toEqual([]);

    // Add analysis for multiple symbols
    const symbols = ['AAPL', 'MSFT', 'GOOGL'];
    for (const symbol of symbols) {
      const analysisMessage = {
        id: `msg_${symbol}`,
        guildId: '987654321',
        channelId: '456789123',
        content: `${symbol}\nAnalysis for ${symbol}`,
        author: { bot: false, tag: 'Analyst#1234' },
        createdAt: new Date(),
        channel: { id: '456789123' },
        attachments: new Map(),
        embeds: []
      } as any;
      
      await analysisLinker.indexMessage(analysisMessage);
    }

    const availableSymbols = analysisLinker.getAvailableSymbols();
    expect(availableSymbols).toHaveLength(3);
    expect(availableSymbols).toContain('AAPL');
    expect(availableSymbols).toContain('MSFT');
    expect(availableSymbols).toContain('GOOGL');
    expect(availableSymbols).toEqual(['AAPL', 'GOOGL', 'MSFT']); // Should be sorted
  });
});