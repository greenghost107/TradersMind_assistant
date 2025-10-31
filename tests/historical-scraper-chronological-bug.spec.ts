import { test, expect } from '@playwright/test';
import { HistoricalScraper } from '../src/services/HistoricalScraper';
import { BotConfig } from '../src/types';

// Mock Discord components for historical scraping
const mockBotUser = { id: 'mock-bot-id', tag: 'TestBot#1234' };
const mockChannelId = 'mock-analysis-channel-123';

class MockMessage {
  id: string;
  channelId: string;
  content: string;
  author: any;
  member: any;
  createdAt: Date;
  guildId: string;
  channel: any;
  reference: any;
  attachments: any;
  embeds: any;

  constructor(id: string, content: string, timestamp: Date, isBot = false) {
    this.id = id;
    this.channelId = mockChannelId;
    this.content = content;
    this.author = { bot: isBot, id: isBot ? mockBotUser.id : 'user-' + id, tag: 'User#1234' };
    this.member = { displayName: 'User' };
    this.createdAt = timestamp;
    this.guildId = 'mock-guild-id';
    this.channel = { id: mockChannelId, isThread: () => false };
    this.reference = null;
    this.attachments = new Map();
    this.embeds = [];
  }
}

class MockTextChannel {
  id: string;
  messages: any;
  mockMessages: MockMessage[];

  constructor(id: string, messages: MockMessage[]) {
    this.id = id;
    this.mockMessages = messages;
    this.messages = {
      fetch: async (options?: any) => {
        if (typeof options === 'string') {
          return this.mockMessages.find(msg => msg.id === options);
        } else {
          const limit = options?.limit || 50;
          const before = options?.before;
          
          let filteredMessages = this.mockMessages;
          
          if (before) {
            const beforeIndex = this.mockMessages.findIndex(msg => msg.id === before);
            if (beforeIndex > -1) {
              filteredMessages = this.mockMessages.slice(beforeIndex + 1);
            }
          }
          
          // Sort by timestamp descending (newest first) - Discord's default behavior
          const sortedMessages = filteredMessages
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, limit);
          
          return new Map(sortedMessages.map(msg => [msg.id, msg]));
        }
      }
    };
  }
}

class MockClient {
  user = mockBotUser;
  channels: any;

  constructor(channelMessages: Map<string, MockMessage[]>) {
    this.channels = {
      cache: {
        get: (id: string) => {
          const messages = channelMessages.get(id);
          return messages ? new MockTextChannel(id, messages) : null;
        }
      }
    };
  }

  isReady() { return true; }
  destroy() { return Promise.resolve(); }
}

test.describe('Historical Scraper Chronological Processing Bug', () => {
  test('should demonstrate the bug: newer symbol list overwrites older legitimate analysis', async () => {
    // Create timestamps that match the production scenario
    const legitimateAnalysisTime = new Date('2025-01-01T18:46:00Z'); // 18:46
    const symbolListTime = new Date('2025-01-01T19:50:00Z'); // 19:50 (newer)

    // Create the legitimate Hebrew analysis message for LMND (sent at 18:46)
    const legitimateAnalysis = new MockMessage(
      'msg-legitimate-analysis',
      'למונייד $LMND👀\nנראה שהחלה תנועה מעל אזור הקונסוליצדיה מעל הבייס של סטייג\' 1\nבייס בצורת קאפ אנד הנדל בן 4 שנים מנובמבר 2021.\nבדרך כלל פרייס אקשן כזה יכול לעבוד ב-% מטורפים כשתנועה מתחילה,\n❗ כמה חבל שהיא מדווחת שבוע הבא ב-5 לנובמבר\nהמצגת ש- @Eli Alfa האלוף הכין עליה:',
      legitimateAnalysisTime
    );

    // Create the problematic symbol list message (sent at 19:50)
    const symbolListMessage = new MockMessage(
      'msg-symbol-list',
      'W / WGS / RKLB / STOK / MDB / SYM / LIF / LMND / AVAV / IBKR 👀\n@everyone',
      symbolListTime
    );

    // Create a simplified mock config
    const mockConfig: BotConfig = {
      analysisChannels: [mockChannelId],
      discussionChannels: [],
      requiredManagers: [],
      permittedChannels: [],
      watchlistChannel: '',
      buttonChannels: [],
      topPicksChannels: []
    };

    // Create mock client
    const mockClient = new MockClient(new Map()) as any;
    
    // Create historical scraper
    const historicalScraper = new HistoricalScraper(mockConfig, mockClient);

    // Create a collection of messages (Discord.js Collection format)
    const messages = new Map();
    messages.set(legitimateAnalysis.id, legitimateAnalysis);
    messages.set(symbolListMessage.id, symbolListMessage);

    // Test the actual processChannelMessages method with chronological processing
    // This should reproduce the bug where newer message overwrites older analysis
    const result = await (historicalScraper as any).processChannelMessages(
      messages,
      'mock-guild-id',
      false // no manager filtering
    );

    // Check which message LMND points to
    const lmndAnalysis = result.get('LMND');
    
    if (lmndAnalysis) {
      console.log(`🔍 LMND analysis result:`);
      console.log(`  Message ID: ${lmndAnalysis.messageId}`);
      console.log(`  Content: "${lmndAnalysis.content.slice(0, 100)}..."`);
      console.log(`  Timestamp: ${lmndAnalysis.timestamp}`);
      console.log(`  Relevance Score: ${lmndAnalysis.relevanceScore}`);
      
      // This test SHOULD FAIL if the bug exists
      // The bug: newer symbol list (19:50) overwrites older Hebrew analysis (18:46)
      if (lmndAnalysis.messageId === 'msg-symbol-list') {
        console.log('❌ BUG CONFIRMED: Symbol list message overwrote legitimate Hebrew analysis');
        console.log('   Expected: LMND should point to Hebrew analysis (msg-legitimate-analysis)');
        console.log('   Actual: LMND points to symbol list (msg-symbol-list)');
        
        // Make the test fail to demonstrate the bug
        expect(lmndAnalysis.messageId).toBe('msg-legitimate-analysis');
      } else {
        console.log('✅ No bug: LMND correctly points to legitimate analysis');
        expect(lmndAnalysis.messageId).toBe('msg-legitimate-analysis');
      }
    } else {
      console.log('❌ No analysis found for LMND');
      expect(lmndAnalysis).toBeDefined();
    }
  });

});