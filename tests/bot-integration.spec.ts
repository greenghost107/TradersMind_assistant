import { test, expect } from '@playwright/test';
import { ChannelScanner } from '../src/services/ChannelScanner';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { EphemeralHandler } from '../src/services/EphemeralHandler';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Bot Integration', () => {
  let channelScanner: ChannelScanner;
  let symbolDetector: SymbolDetector;
  let analysisLinker: AnalysisLinker;
  let ephemeralHandler: EphemeralHandler;

  test.beforeEach(() => {
    symbolDetector = new SymbolDetector();
    analysisLinker = new AnalysisLinker();
    ephemeralHandler = new EphemeralHandler(analysisLinker);
    channelScanner = new ChannelScanner(symbolDetector, ephemeralHandler);
  });

  test('should index analysis from analysis channels', async () => {
    const config = {
      analysisChannels: ['111111111', '222222222'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    // Simulate analysis message in analysis channel
    const analysisMessage = {
      id: 'analysis123',
      guildId: '999999999',
      channelId: '111111111',
      content: 'AAPL\nTechnical analysis shows bullish breakout pattern. Price target $210.',
      author: { bot: false, tag: 'Analyst#1234' },
      createdAt: new Date(),
      channel: { id: '111111111' }
    } as any;

    // Index the analysis message
    await analysisLinker.indexMessage(analysisMessage);

    // Verify the analysis was indexed
    const analyses = await analysisLinker.getLatestAnalysis('AAPL');
    expect(analyses).toHaveLength(1);
    expect(analyses[0].content).toContain('Technical analysis');
    
    // Verify the URL was stored correctly
    const url = analysisLinker.getLatestAnalysisUrl('AAPL');
    expect(url).toBe('https://discord.com/channels/999999999/111111111/analysis123');
  });

  test('should respond with buttons when symbols detected in general channel', async () => {
    const config = {
      analysisChannels: ['111111111', '222222222'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    let buttonsSent = false;
    const generalMessage = {
      id: 'general123',
      channelId: '333333333', // General notices channel
      content: 'AAPL is moving up today! What do you think about TSLA?',
      author: { bot: false, tag: 'User#5678' },
      reply: async (options: any) => {
        buttonsSent = true;
        expect(options.embeds).toHaveLength(1);
        expect(options.components.length).toBeGreaterThan(0);
      }
    } as any;

    await channelScanner.handleMessage(generalMessage, config);
    expect(buttonsSent).toBe(true);
  });

  test('should not respond to messages in non-monitored channels', async () => {
    const config = {
      analysisChannels: ['111111111', '222222222'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    let replyCalled = false;
    const otherMessage = {
      id: 'other123',
      channelId: '555555555', // Different channel
      content: 'AAPL TSLA MSFT',
      author: { bot: false, tag: 'User#5678' },
      reply: async () => { replyCalled = true; }
    } as any;

    await channelScanner.handleMessage(otherMessage, config);
    expect(replyCalled).toBe(false);
  });

  test('should complete the full workflow: analysis -> detection -> response', async () => {
    const config = {
      analysisChannels: ['111111111', '222222222'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    // Step 1: Analysis message in analysis channel
    const analysisMessage = {
      id: 'analysis456',
      guildId: '999999999',
      channelId: '111111111',
      content: 'AAPL\nBullish momentum continuing. Support at $180, resistance at $200.',
      author: { bot: false, tag: 'TechAnalyst#1111' },
      createdAt: new Date(),
      channel: { id: '111111111' }
    } as any;

    await analysisLinker.indexMessage(analysisMessage);

    // Step 2: User mentions symbol in general channel
    let buttonsCreated = false;
    const generalMessage = {
      id: 'general456',
      channelId: '333333333',
      content: 'What do you all think about AAPL earnings?',
      author: { bot: false, tag: 'Trader#2222' },
      reply: async (options: any) => {
        buttonsCreated = true;
        // Verify button was created for AAPL
        const hasAppleButton = options.components.some((row: any) => 
          row.components.some((btn: any) => btn.data.label === '📊 $AAPL')
        );
        expect(hasAppleButton).toBe(true);
      }
    } as any;

    await channelScanner.handleMessage(generalMessage, config);
    expect(buttonsCreated).toBe(true);

    // Step 3: Simulate button click
    const mockInteraction = {
      customId: 'symbol_AAPL_general456',
      user: { id: 'trader2222' },
      guildId: '999999999',
      client: {
        channels: {
          cache: {
            get: (channelId: string) => ({ name: 'analysis-1' })
          }
        }
      },
      deferReply: async (options: any) => {
        expect(options.ephemeral).toBe(true);
      },
      editReply: async (options: any) => {
        // Verify analysis is shown
        expect(options.embeds).toHaveLength(1);
        expect(options.embeds[0].data.title).toContain('AAPL');
        expect(options.embeds[0].data.description).toContain('Bullish momentum');
        expect(options.embeds[0].data.url).toBe('https://discord.com/channels/999999999/111111111/analysis456');
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockInteraction);
  });

  test('should handle multiple symbols in analysis message first line', async () => {
    const analysisMessage = {
      id: 'multi123',
      guildId: '999999999',
      channelId: '111111111',
      content: 'AAPL TSLA MSFT\nAll three tech stocks showing similar patterns.\nBullish across the board.',
      author: { bot: false, tag: 'MultiAnalyst#3333' },
      createdAt: new Date(),
      channel: { id: '111111111' }
    } as any;

    await analysisLinker.indexMessage(analysisMessage);

    // All three symbols should have the same analysis linked
    expect(analysisLinker.getLatestAnalysisUrl('AAPL')).toBeTruthy();
    expect(analysisLinker.getLatestAnalysisUrl('TSLA')).toBeTruthy();
    expect(analysisLinker.getLatestAnalysisUrl('MSFT')).toBeTruthy();

    // URLs should all point to the same message
    const urls = ['AAPL', 'TSLA', 'MSFT'].map(symbol => 
      analysisLinker.getLatestAnalysisUrl(symbol)
    );
    expect(urls.every(url => url === urls[0])).toBe(true);
  });

  test('should ignore symbols not in first line of analysis', async () => {
    const analysisMessage = {
      id: 'ignore123',
      guildId: '999999999',
      channelId: '111111111',
      content: 'AAPL\nThis analysis mentions TSLA and MSFT in the body,\nbut they should not be indexed since they are not in first line.',
      author: { bot: false, tag: 'Analyst#4444' },
      createdAt: new Date(),
      channel: { id: '111111111' }
    } as any;

    await analysisLinker.indexMessage(analysisMessage);

    expect(analysisLinker.getLatestAnalysisUrl('AAPL')).toBeTruthy();
    expect(analysisLinker.getLatestAnalysisUrl('TSLA')).toBeNull();
    expect(analysisLinker.getLatestAnalysisUrl('MSFT')).toBeNull();
  });

  test('should handle emoji-rich analysis and general messages', async () => {
    const config = {
      analysisChannels: ['111111111', '222222222'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    // Step 1: Analysis with emojis
    const emojiAnalysisMessage = {
      id: 'emoji123',
      guildId: '999999999',
      channelId: '111111111',
      content: 'DOCS$ 🤌\nStrong bullish momentum on DOCS! 📈\nPrice target looking good 🎯',
      author: { bot: false, tag: 'EmojiAnalyst#5555' },
      createdAt: new Date(),
      channel: { id: '111111111' }
    } as any;

    await analysisLinker.indexMessage(emojiAnalysisMessage);

    // Step 2: General message with emojis mentioning the symbol
    let buttonResponse: any = null;
    const emojiGeneralMessage = {
      id: 'generalEmoji123',
      channelId: '333333333',
      content: 'What do you think about DOCS today? 🤔💭',
      author: { bot: false, tag: 'EmojiTrader#6666' },
      reply: async (options: any) => {
        buttonResponse = options;
      }
    } as any;

    await channelScanner.handleMessage(emojiGeneralMessage, config);

    // Verify buttons were created for DOCS
    expect(buttonResponse).toBeTruthy();
    expect(buttonResponse.embeds).toBeUndefined();
    const hasDocsButton = buttonResponse.components.some((row: any) => 
      row.components.some((btn: any) => btn.data.label === '📊 $DOCS')
    );
    expect(hasDocsButton).toBe(true);

    // Step 3: Simulate button interaction
    const mockInteraction = {
      customId: 'symbol_DOCS_generalEmoji123',
      user: { id: 'emojitrader6666' },
      guildId: '999999999',
      client: {
        channels: {
          cache: {
            get: (channelId: string) => ({ name: 'analysis-1' })
          }
        }
      },
      deferReply: async (options: any) => {
        expect(options.ephemeral).toBe(true);
      },
      editReply: async (options: any) => {
        expect(options.embeds).toHaveLength(1);
        expect(options.embeds[0].data.title).toContain('DOCS');
        expect(options.embeds[0].data.description).toContain('Strong bullish momentum');
        expect(options.embeds[0].data.url).toBe('https://discord.com/channels/999999999/111111111/emoji123');
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockInteraction);
  });

  test('should detect symbols with various emoji combinations', async () => {
    const config = {
      analysisChannels: ['111111111', '222222222'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    let buttonResponse: any = null;
    const complexEmojiMessage = {
      id: 'complex123',
      channelId: '333333333',
      content: '🔥NVDA🔥 is on fire! 💎DIAMOND HANDS💎 on AAPL 🍎 and TSLA 🚗⚡',
      author: { bot: false, tag: 'ComplexTrader#7777' },
      reply: async (options: any) => {
        buttonResponse = options;
      }
    } as any;

    await channelScanner.handleMessage(complexEmojiMessage, config);

    expect(buttonResponse).toBeTruthy();
    expect(buttonResponse.embeds).toBeUndefined();
    
    // Check that buttons were created for the detected symbols
    const buttonLabels = buttonResponse.components.flatMap((row: any) => 
      row.components.map((btn: any) => btn.data.label)
    );
    
    expect(buttonLabels).toEqual(expect.arrayContaining(['📊 $NVDA', '📊 $AAPL', '📊 $TSLA']));
  });

  test('should work end-to-end with historical initialization', async () => {
    const config = {
      analysisChannels: ['111111111', '222222222'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    // Step 1: Create historical data map (simulating what HistoricalScraper would return)
    const historicalData = new Map();
    
    const historicalAnalysis1 = {
      messageId: 'hist1',
      channelId: '111111111',
      authorId: 'analyst1',
      content: 'AAPL\nHistorical bullish analysis for Apple from last week',
      symbols: ['AAPL'],
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      relevanceScore: 0.8,
      messageUrl: 'https://discord.com/channels/999999999/111111111/hist1'
    };
    
    const historicalAnalysis2 = {
      messageId: 'hist2',
      channelId: '222222222',
      authorId: 'analyst2',
      content: 'DOCS$ 🤌\nHistorical DOCS analysis with emoji',
      symbols: ['DOCS'],
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      relevanceScore: 0.9,
      messageUrl: 'https://discord.com/channels/999999999/222222222/hist2'
    };

    historicalData.set('AAPL', historicalAnalysis1);
    historicalData.set('DOCS', historicalAnalysis2);

    // Step 2: Initialize AnalysisLinker with historical data
    analysisLinker.initializeFromHistoricalData(historicalData);

    // Step 3: User mentions symbol in general channel
    let buttonResponse: any = null;
    const generalMessage = {
      id: 'general789',
      channelId: '333333333',
      content: 'Anyone have thoughts on AAPL and DOCS today?',
      author: { bot: false, tag: 'Trader#9999' },
      reply: async (options: any) => {
        buttonResponse = options;
      }
    } as any;

    await channelScanner.handleMessage(generalMessage, config);

    // Verify buttons were created for both symbols
    expect(buttonResponse).toBeTruthy();
    expect(buttonResponse.embeds).toBeUndefined();
    
    const buttonLabels = buttonResponse.components.flatMap((row: any) => 
      row.components.map((btn: any) => btn.data.label)
    );
    expect(buttonLabels).toEqual(expect.arrayContaining(['📊 $AAPL', '📊 $DOCS']));

    // Step 4: Simulate button click for AAPL
    const mockAppleInteraction = {
      customId: 'symbol_AAPL_general789',
      user: { id: 'trader9999' },
      guildId: '999999999',
      client: {
        channels: {
          cache: {
            get: (channelId: string) => ({ name: 'analysis-1' })
          }
        }
      },
      deferReply: async (options: any) => {
        expect(options.ephemeral).toBe(true);
      },
      editReply: async (options: any) => {
        expect(options.embeds).toHaveLength(1);
        expect(options.embeds[0].data.title).toContain('AAPL');
        expect(options.embeds[0].data.description).toContain('Historical bullish analysis');
        expect(options.embeds[0].data.url).toBe('https://discord.com/channels/999999999/111111111/hist1');
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockAppleInteraction);

    // Step 5: Simulate button click for DOCS (with emoji)
    const mockDocsInteraction = {
      customId: 'symbol_DOCS_general789',
      user: { id: 'trader9999' },
      guildId: '999999999',
      client: {
        channels: {
          cache: {
            get: (channelId: string) => ({ name: 'analysis-2' })
          }
        }
      },
      deferReply: async (options: any) => {
        expect(options.ephemeral).toBe(true);
      },
      editReply: async (options: any) => {
        expect(options.embeds).toHaveLength(1);
        expect(options.embeds[0].data.title).toContain('DOCS');
        expect(options.embeds[0].data.description).toContain('DOCS$ 🤌');
        expect(options.embeds[0].data.url).toBe('https://discord.com/channels/999999999/222222222/hist2');
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockDocsInteraction);

    // Step 6: Add new real-time analysis and verify it overrides historical data
    const newAnalysisMessage = {
      id: 'newanalysis123',
      guildId: '999999999',
      channelId: '111111111',
      content: 'AAPL\nFresh analysis just posted - very bullish!',
      author: { bot: false, tag: 'NewAnalyst#1111' },
      createdAt: new Date(), // Now
      channel: { id: '111111111' }
    } as any;

    await analysisLinker.indexMessage(newAnalysisMessage);

    // Verify the new analysis overrides the historical one
    const latestUrl = analysisLinker.getLatestAnalysisUrl('AAPL');
    expect(latestUrl).toBe('https://discord.com/channels/999999999/111111111/newanalysis123');
  });
});