import { test, expect } from '@playwright/test';
import { EphemeralHandler } from '../src/services/EphemeralHandler';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Chart Image Display', () => {
  let ephemeralHandler: EphemeralHandler;
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
    ephemeralHandler = new EphemeralHandler(analysisLinker);
  });

  test('should display chart image when attachment URL exists', async () => {
    const mockAnalysisMessage = {
      id: '111111111',
      guildId: '987654321',
      channelId: '456789123',
      content: 'SOFI\nStrong bullish breakout expected',
      author: { bot: false, tag: 'Analyst#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' },
      attachments: new Map([
        ['attachment1', {
          url: 'https://cdn.discordapp.com/attachments/123/456/chart.png',
          name: 'chart.png',
          contentType: 'image/png'
        }]
      ]),
      embeds: []
    } as any;

    await analysisLinker.indexMessage(mockAnalysisMessage);

    const mockInteraction = {
      customId: 'symbol_SOFI_123456789',
      user: { id: 'user123', tag: 'TestUser#1234' },
      guildId: '987654321',
      client: {
        channels: {
          cache: {
            get: (channelId: string) => ({ name: 'analysis-channel' })
          }
        }
      },
      deferReply: async (options: any) => {
        expect(options.ephemeral).toBe(true);
      },
      editReply: async (options: any) => {
        expect(options.embeds).toHaveLength(1);
        const embed = options.embeds[0];
        expect(embed.data.title).toContain('SOFI');
        expect(embed.data.image?.url).toBe('https://cdn.discordapp.com/attachments/123/456/chart.png');
        expect(embed.data.url).toContain('discord.com/channels');
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockInteraction);
  });

  test('should display text-only analysis when no attachment URL exists', async () => {
    const mockAnalysisMessage = {
      id: '222222222',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nPrice target increased to $250',
      author: { bot: false, tag: 'Analyst#5678' },
      createdAt: new Date(),
      channel: { id: '456789123' },
      attachments: new Map(),
      embeds: []
    } as any;

    await analysisLinker.indexMessage(mockAnalysisMessage);

    const mockInteraction = {
      customId: 'symbol_AAPL_987654321',
      user: { id: 'user456', tag: 'TestUser#5678' },
      guildId: '987654321',
      client: {
        channels: {
          cache: {
            get: (channelId: string) => ({ name: 'analysis-channel' })
          }
        }
      },
      deferReply: async (options: any) => {
        expect(options.ephemeral).toBe(true);
      },
      editReply: async (options: any) => {
        expect(options.embeds).toHaveLength(1);
        const embed = options.embeds[0];
        expect(embed.data.title).toContain('AAPL');
        expect(embed.data.image?.url).toBeUndefined();
        expect(embed.data.description).toContain('Price target increased to $250');
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockInteraction);
  });

  test('should handle invalid attachment URL gracefully', async () => {
    const mockAnalysisMessage = {
      id: '333333333',
      guildId: '987654321',
      channelId: '456789123',
      content: 'TSLA\nTechnical analysis shows strong support',
      author: { bot: false, tag: 'Analyst#9999' },
      createdAt: new Date(),
      channel: { id: '456789123' },
      attachments: new Map([
        ['attachment1', {
          url: 'invalid-url-format',
          name: 'broken.png',
          contentType: 'image/png'
        }]
      ]),
      embeds: []
    } as any;

    await analysisLinker.indexMessage(mockAnalysisMessage);

    const mockInteraction = {
      customId: 'symbol_TSLA_111111111',
      user: { id: 'user789', tag: 'TestUser#9999' },
      guildId: '987654321',
      client: {
        channels: {
          cache: {
            get: (channelId: string) => ({ name: 'analysis-channel' })
          }
        }
      },
      deferReply: async (options: any) => {
        expect(options.ephemeral).toBe(true);
      },
      editReply: async (options: any) => {
        expect(options.embeds).toHaveLength(1);
        const embed = options.embeds[0];
        expect(embed.data.title).toContain('TSLA');
        expect(embed.data.image?.url).toBeUndefined();
        expect(embed.data.description).toContain('Technical analysis shows strong support');
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockInteraction);
  });

  test('should prioritize multiple chart URLs correctly', async () => {
    const mockAnalysisMessage = {
      id: '444444444',
      guildId: '987654321',
      channelId: '456789123',
      content: 'NVDA\nBreaking resistance levels with volume',
      author: { bot: false, tag: 'Analyst#4444' },
      createdAt: new Date(),
      channel: { id: '456789123' },
      attachments: new Map([
        ['attachment1', {
          url: 'https://cdn.discordapp.com/attachments/123/456/chart1.png',
          name: 'chart1.png',
          contentType: 'image/png'
        }],
        ['attachment2', {
          url: 'https://cdn.discordapp.com/attachments/123/456/chart2.png',
          name: 'chart2.png',
          contentType: 'image/png'
        }]
      ]),
      embeds: [{
        url: 'https://tradingview.com/chart/NVDA'
      }]
    } as any;

    await analysisLinker.indexMessage(mockAnalysisMessage);

    const mockInteraction = {
      customId: 'symbol_NVDA_444444444',
      user: { id: 'user111', tag: 'TestUser#1111' },
      guildId: '987654321',
      client: {
        channels: {
          cache: {
            get: (channelId: string) => ({ name: 'analysis-channel' })
          }
        }
      },
      deferReply: async (options: any) => {
        expect(options.ephemeral).toBe(true);
      },
      editReply: async (options: any) => {
        expect(options.embeds).toHaveLength(1);
        const embed = options.embeds[0];
        expect(embed.data.title).toContain('NVDA');
        expect(embed.data.image?.url).toBe('https://cdn.discordapp.com/attachments/123/456/chart1.png');
        expect(embed.data.description).toContain('Breaking resistance levels with volume');
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockInteraction);
  });

  test('should fallback to chart URLs when no attachments exist', async () => {
    const mockAnalysisMessage = {
      id: '555555555',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AMD\nBullish momentum building https://tradingview.com/x/abc123/',
      author: { bot: false, tag: 'Analyst#7777' },
      createdAt: new Date(),
      channel: { id: '456789123' },
      attachments: new Map(),
      embeds: []
    } as any;

    await analysisLinker.indexMessage(mockAnalysisMessage);

    const mockInteraction = {
      customId: 'symbol_AMD_555555555',
      user: { id: 'user222', tag: 'TestUser#2222' },
      guildId: '987654321',
      client: {
        channels: {
          cache: {
            get: (channelId: string) => ({ name: 'analysis-channel' })
          }
        }
      },
      deferReply: async (options: any) => {
        expect(options.ephemeral).toBe(true);
      },
      editReply: async (options: any) => {
        expect(options.embeds).toHaveLength(1);
        const embed = options.embeds[0];
        expect(embed.data.title).toContain('AMD');
        expect(embed.data.description).toContain('Bullish momentum building');
        expect(embed.data.url).toContain('discord.com/channels');
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockInteraction);
  });

  test('should handle embed with chart image correctly', async () => {
    const mockAnalysisMessage = {
      id: '666666666',
      guildId: '987654321',
      channelId: '456789123',
      content: 'SPY\nMarket showing bullish divergence',
      author: { bot: false, tag: 'Analyst#8888' },
      createdAt: new Date(),
      channel: { id: '456789123' },
      attachments: new Map(),
      embeds: [{
        image: {
          url: 'https://example.com/spy-chart.png'
        }
      }]
    } as any;

    await analysisLinker.indexMessage(mockAnalysisMessage);

    const mockInteraction = {
      customId: 'symbol_SPY_666666666',
      user: { id: 'user333', tag: 'TestUser#3333' },
      guildId: '987654321',
      client: {
        channels: {
          cache: {
            get: (channelId: string) => ({ name: 'analysis-channel' })
          }
        }
      },
      deferReply: async (options: any) => {
        expect(options.ephemeral).toBe(true);
      },
      editReply: async (options: any) => {
        expect(options.embeds).toHaveLength(1);
        const embed = options.embeds[0];
        expect(embed.data.title).toContain('SPY');
        expect(embed.data.image?.url).toBe('https://example.com/spy-chart.png');
        expect(embed.data.description).toContain('Market showing bullish divergence');
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockInteraction);
  });
});