import { test, expect } from '@playwright/test';
import { EphemeralHandler } from '../src/services/EphemeralHandler';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('EphemeralHandler', () => {
  let ephemeralHandler: EphemeralHandler;
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
    ephemeralHandler = new EphemeralHandler(analysisLinker);
  });

  test('should create symbol buttons for detected symbols', async () => {
    const mockMessage = {
      id: '123456789',
      content: 'Check out AAPL and TSLA today!',
      author: { bot: false, tag: 'TestUser#1234' },
      channel: { id: '456789123' },
      reply: async (options: any) => {
        // Verify the reply contains only buttons (no embeds)
        expect(options.embeds).toBeUndefined();
        expect(options.components).toHaveLength(1); // At least one action row
        expect(options.components[0].components.length).toBeGreaterThan(0);
        
        // Check button labels contain chart emoji and $ symbols
        const buttons = options.components[0].components;
        expect(buttons.some((btn: any) => btn.data.label === '📊 $AAPL')).toBe(true);
      }
    } as any;

    const symbols = [
      { symbol: 'AAPL', confidence: 0.8, position: 10 },
      { symbol: 'TSLA', confidence: 0.7, position: 20 }
    ];

    await ephemeralHandler.createSymbolButtons(mockMessage, symbols);
  });

  test('should limit buttons to Discord maximum', async () => {
    const mockMessage = {
      id: '123456789',
      content: 'Many symbols here',
      author: { bot: false, tag: 'TestUser#1234' },
      channel: { id: '456789123' },
      reply: async (options: any) => {
        let totalButtons = 0;
        for (const row of options.components) {
          totalButtons += row.components.length;
        }
        expect(totalButtons).toBeLessThanOrEqual(25); // Discord max buttons
      }
    } as any;

    // Create 30 mock symbols (more than Discord allows)
    const symbols = Array.from({ length: 30 }, (_, i) => ({
      symbol: `SYM${i.toString().padStart(2, '0')}`,
      confidence: 0.5,
      position: i * 10
    }));

    await ephemeralHandler.createSymbolButtons(mockMessage, symbols);
  });

  test('should organize buttons into rows of 5', async () => {
    const mockMessage = {
      id: '123456789',
      content: 'Multiple symbols',
      author: { bot: false, tag: 'TestUser#1234' },
      channel: { id: '456789123' },
      reply: async (options: any) => {
        // Verify no embeds, only components
        expect(options.embeds).toBeUndefined();
        // Check that each row has max 5 buttons
        for (const row of options.components) {
          expect(row.components.length).toBeLessThanOrEqual(5);
        }
      }
    } as any;

    const symbols = Array.from({ length: 12 }, (_, i) => ({
      symbol: `SYM${i.toString().padStart(2, '0')}`,
      confidence: 0.5,
      position: i * 10
    }));

    await ephemeralHandler.createSymbolButtons(mockMessage, symbols);
  });

  test('should handle button interaction and show analysis', async () => {
    // First, index some analysis
    const mockAnalysisMessage = {
      id: '111111111',
      guildId: '987654321',
      channelId: '456789123',
      content: 'AAPL\nStrong bullish signals with price target of $200',
      author: { bot: false, tag: 'Analyst#1234' },
      createdAt: new Date(),
      channel: { id: '456789123' }
    } as any;

    await analysisLinker.indexMessage(mockAnalysisMessage);

    const mockInteraction = {
      customId: 'symbol_AAPL_123456789',
      user: { id: 'user123' },
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
        expect(options.embeds[0].data.title).toContain('AAPL');
        expect(options.embeds[0].data.url).toContain('discord.com/channels');
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockInteraction);
  });

  test('should handle no analysis found case', async () => {
    const mockInteraction = {
      customId: 'symbol_UNKNOWN_123456789',
      user: { id: 'user123' },
      guildId: '987654321',
      client: { channels: { cache: { get: () => null } } },
      deferReply: async (options: any) => {
        expect(options.ephemeral).toBe(true);
      },
      editReply: async (options: any) => {
        expect(options.content).toContain('No recent analysis found');
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockInteraction);
  });

  test('should handle malformed custom ID', async () => {
    const mockInteraction = {
      customId: 'invalid_format',
      user: { id: 'user123' },
      reply: async (options: any) => {
        expect(options.content).toContain('Invalid button interaction');
        expect(options.ephemeral).toBe(true);
      }
    } as any;

    await ephemeralHandler.handleButtonInteraction(mockInteraction);
  });
});