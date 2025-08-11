import { test, expect } from '@playwright/test';
import { HistoricalScraper } from '../src/services/HistoricalScraper';

test.describe('HistoricalScraper', () => {
  let historicalScraper: HistoricalScraper;

  test.beforeEach(() => {
    historicalScraper = new HistoricalScraper();
  });

  test('should create scraper instance', () => {
    expect(historicalScraper).toBeDefined();
  });

  test('should handle scraping with mock client and config', async () => {
    const mockChannel1 = {
      id: '111111111',
      name: 'analysis-1',
      guildId: '999999999',
      isTextBased: () => true,
      messages: {
        fetch: async (options: any) => {
          // Mock returning some messages
          const mockMessages = new Map();
          
          const message1 = {
            id: 'msg1',
            content: 'AAPL\nBullish analysis for Apple',
            author: { bot: false, id: 'analyst1' },
            channelId: '111111111',
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          };
          
          const message2 = {
            id: 'msg2',
            content: 'TSLA 🚗\nTesla looking strong with emoji',
            author: { bot: false, id: 'analyst2' },
            channelId: '111111111',
            createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
          };
          
          mockMessages.set('msg1', message1);
          mockMessages.set('msg2', message2);
          
          return mockMessages;
        }
      }
    };

    const mockChannel2 = {
      id: '222222222',
      name: 'analysis-2',
      guildId: '999999999',
      isTextBased: () => true,
      messages: {
        fetch: async () => {
          const mockMessages = new Map();
          
          const message3 = {
            id: 'msg3',
            content: 'MSFT 💻\nMicrosoft quarterly analysis',
            author: { bot: false, id: 'analyst3' },
            channelId: '222222222',
            createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
          };
          
          mockMessages.set('msg3', message3);
          return mockMessages;
        }
      }
    };

    const mockClient = {
      channels: {
        fetch: async (channelId: string) => {
          if (channelId === '111111111') return mockChannel1;
          if (channelId === '222222222') return mockChannel2;
          throw new Error('Channel not found');
        }
      }
    } as any;

    const config = {
      analysisChannels: ['111111111', '222222222'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    const result = await historicalScraper.scrapeHistoricalAnalysis(mockClient, config);

    // Should have found 3 unique symbols
    expect(result.size).toBe(3);
    expect(result.has('AAPL')).toBe(true);
    expect(result.has('TSLA')).toBe(true);
    expect(result.has('MSFT')).toBe(true);

    // Check that message URLs are properly formatted
    const appleAnalysis = result.get('AAPL');
    expect(appleAnalysis?.messageUrl).toBe('https://discord.com/channels/999999999/111111111/msg1');

    const teslaAnalysis = result.get('TSLA');
    expect(teslaAnalysis?.messageUrl).toBe('https://discord.com/channels/999999999/111111111/msg2');

    const microsoftAnalysis = result.get('MSFT');
    expect(microsoftAnalysis?.messageUrl).toBe('https://discord.com/channels/999999999/222222222/msg3');
  });

  test('should keep only latest message per symbol', async () => {
    const mockChannel = {
      id: '111111111',
      name: 'analysis-1',
      guildId: '999999999',
      isTextBased: () => true,
      messages: {
        fetch: async () => {
          const mockMessages = new Map();
          
          // Older AAPL analysis
          const olderMessage = {
            id: 'older',
            content: 'AAPL\nOlder analysis',
            author: { bot: false, id: 'analyst1' },
            channelId: '111111111',
            createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
          };
          
          // Newer AAPL analysis
          const newerMessage = {
            id: 'newer',
            content: 'AAPL\nNewer analysis',
            author: { bot: false, id: 'analyst2' },
            channelId: '111111111',
            createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
          };
          
          mockMessages.set('older', olderMessage);
          mockMessages.set('newer', newerMessage);
          
          return mockMessages;
        }
      }
    };

    const mockClient = {
      channels: {
        fetch: async () => mockChannel
      }
    } as any;

    const config = {
      analysisChannels: ['111111111'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    const result = await historicalScraper.scrapeHistoricalAnalysis(mockClient, config);

    // Should have only one AAPL entry (the newer one)
    expect(result.size).toBe(1);
    expect(result.has('AAPL')).toBe(true);
    
    const appleAnalysis = result.get('AAPL');
    expect(appleAnalysis?.messageId).toBe('newer');
    expect(appleAnalysis?.content).toBe('AAPL\nNewer analysis');
  });

  test('should extract symbols only from first line', async () => {
    const mockChannel = {
      id: '111111111',
      name: 'analysis-1',
      guildId: '999999999',
      isTextBased: () => true,
      messages: {
        fetch: async () => {
          const mockMessages = new Map();
          
          const message = {
            id: 'msg1',
            content: 'AAPL\nThis analysis mentions TSLA and MSFT in the body\nbut only AAPL should be indexed',
            author: { bot: false, id: 'analyst1' },
            channelId: '111111111',
            createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
          };
          
          mockMessages.set('msg1', message);
          return mockMessages;
        }
      }
    };

    const mockClient = {
      channels: {
        fetch: async () => mockChannel
      }
    } as any;

    const config = {
      analysisChannels: ['111111111'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    const result = await historicalScraper.scrapeHistoricalAnalysis(mockClient, config);

    // Should only have AAPL from the first line
    expect(result.size).toBe(1);
    expect(result.has('AAPL')).toBe(true);
    expect(result.has('TSLA')).toBe(false);
    expect(result.has('MSFT')).toBe(false);
  });

  test('should handle symbols with emojis in first line', async () => {
    const mockChannel = {
      id: '111111111',
      name: 'analysis-1',
      guildId: '999999999',
      isTextBased: () => true,
      messages: {
        fetch: async () => {
          const mockMessages = new Map();
          
          const message1 = {
            id: 'msg1',
            content: 'DOCS$ 🤌\nAnalysis with emoji ticker',
            author: { bot: false, id: 'analyst1' },
            channelId: '111111111',
            createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
          };
          
          const message2 = {
            id: 'msg2',
            content: 'AAPL 🍎 TSLA 🚗 MSFT 💻\nMultiple symbols with emojis',
            author: { bot: false, id: 'analyst2' },
            channelId: '111111111',
            createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
          };
          
          mockMessages.set('msg1', message1);
          mockMessages.set('msg2', message2);
          
          return mockMessages;
        }
      }
    };

    const mockClient = {
      channels: {
        fetch: async () => mockChannel
      }
    } as any;

    const config = {
      analysisChannels: ['111111111'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    const result = await historicalScraper.scrapeHistoricalAnalysis(mockClient, config);

    // Should find all symbols despite emojis
    expect(result.size).toBe(4);
    expect(result.has('DOCS')).toBe(true);
    expect(result.has('AAPL')).toBe(true);
    expect(result.has('TSLA')).toBe(true);
    expect(result.has('MSFT')).toBe(true);

    // Verify DOCS analysis is properly stored
    const docsAnalysis = result.get('DOCS');
    expect(docsAnalysis?.content).toContain('DOCS$ 🤌');
  });

  test('should handle channel access errors gracefully', async () => {
    const mockClient = {
      channels: {
        fetch: async (channelId: string) => {
          throw new Error('Access denied');
        }
      }
    } as any;

    const config = {
      analysisChannels: ['111111111', '222222222'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    // Should not throw an error, should return empty map
    const result = await historicalScraper.scrapeHistoricalAnalysis(mockClient, config);
    expect(result.size).toBe(0);
  });

  test('should respect time cutoff for old messages', async () => {
    const mockChannel = {
      id: '111111111',
      name: 'analysis-1',
      guildId: '999999999',
      isTextBased: () => true,
      messages: {
        fetch: async () => {
          const mockMessages = new Map();
          
          // Message from 10 days ago (should be ignored)
          const oldMessage = {
            id: 'old',
            content: 'OLDSTOCK\nVery old analysis',
            author: { bot: false, id: 'analyst1' },
            channelId: '111111111',
            createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
          };
          
          // Recent message (should be included)
          const recentMessage = {
            id: 'recent',
            content: 'NEWSTOCK\nRecent analysis',
            author: { bot: false, id: 'analyst2' },
            channelId: '111111111',
            createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
          };
          
          mockMessages.set('old', oldMessage);
          mockMessages.set('recent', recentMessage);
          
          return mockMessages;
        }
      }
    };

    const mockClient = {
      channels: {
        fetch: async () => mockChannel
      }
    } as any;

    const config = {
      analysisChannels: ['111111111'],
      generalNoticesChannel: '333333333',
      retentionHours: 24,
      guildId: '999999999'
    };

    const result = await historicalScraper.scrapeHistoricalAnalysis(mockClient, config);

    // Should only have the recent message
    expect(result.size).toBe(1);
    expect(result.has('NEWSTOCK')).toBe(true);
    expect(result.has('OLDSTOCK')).toBe(false);
  });
});