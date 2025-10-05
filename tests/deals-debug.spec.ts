import { test, expect } from '@playwright/test';
import { DiscussionChannelHandler } from '../src/services/DiscussionChannelHandler';
import { SymbolDetector } from '../src/services/SymbolDetector';
import { EphemeralHandler } from '../src/services/EphemeralHandler';
import { MessageRetention } from '../src/services/MessageRetention';
import { AnalysisLinker } from '../src/services/AnalysisLinker';
import { BotConfig } from '../src/types';
import * as createdealsCommand from '../src/commands/createdeals';
import * as config from '../src/config';

const mockDealsChannelId = 'mock-deals-channel-123';
const mockManagerId = 'mock-manager-user-456';

test('Debug createdeals command execution', async () => {
  // Setup test config
  const botConfig: BotConfig = {
    analysisChannels: ['analysis-1', 'analysis-2'],
    discussionChannels: ['discussion-1', 'discussion-2'],
    generalNoticesChannel: 'general-channel',
    dealsChannel: mockDealsChannelId,
    guildId: 'mock-guild-id',
    managerId: mockManagerId
  };
  
  // Mock getBotConfig
  config.getBotConfig = () => botConfig;
  
  // Initialize services
  const discussionChannelHandler = new DiscussionChannelHandler();
  const symbolDetector = new SymbolDetector();
  const analysisLinker = new AnalysisLinker();
  const messageRetention = new MessageRetention();
  const ephemeralHandler = new EphemeralHandler(analysisLinker, messageRetention);
  
  // Initialize createdeals command services
  createdealsCommand.initializeServices(
    discussionChannelHandler,
    symbolDetector,
    ephemeralHandler
  );
  
  // Create a mock message
  const mockMessage = {
    id: 'manager-msg-123',
    content: 'QUBT / BKV / MSFT / VEEV 👀\n@everyone',
    author: { id: mockManagerId, tag: 'TestManager#1234', bot: false },
    channel: { id: mockDealsChannelId },
    async reply(content: any) {
      console.log('Mock message reply called with:', content);
      return {
        id: 'reply-msg-123',
        channel: { id: mockDealsChannelId },
        author: { id: 'bot-id', bot: true }
      };
    }
  };
  
  // Mock interaction
  const mockInteraction = {
    channel: { 
      id: mockDealsChannelId,
      messages: {
        fetch: async (options: any) => {
          console.log('Messages.fetch called with:', options);
          
          // Create a Collection-like object with filter method
          const messagesMap = new Map([['manager-msg-123', mockMessage]]);
          const collectionLike = {
            size: messagesMap.size,
            filter: (filterFn: any) => {
              const filtered = new Map();
              for (const [key, value] of messagesMap) {
                if (filterFn(value)) {
                  filtered.set(key, value);
                }
              }
              // Return collection-like object with size and first method
              return {
                size: filtered.size,
                first: () => filtered.size > 0 ? filtered.values().next().value : undefined
              };
            },
            first: () => messagesMap.size > 0 ? messagesMap.values().next().value : undefined
          };
          
          console.log('Returning messages collection with size:', collectionLike.size);
          return collectionLike;
        }
      }
    },
    user: { id: mockManagerId, tag: 'TestManager#1234' },
    replied: false,
    response: '',
    
    async reply(options: any) {
      this.replied = true;
      this.response = typeof options.content === 'string' ? options.content : options;
      console.log('REPLY:', this.response);
      return Promise.resolve();
    },
    
    async editReply(options: any) {
      this.response = typeof options.content === 'string' ? options.content : options;
      console.log('EDIT REPLY:', this.response);
      return Promise.resolve();
    }
  } as any;
  
  // Test basic config retrieval
  const testConfig = config.getBotConfig();
  console.log('Test config:', testConfig);
  
  expect(testConfig).toBeDefined();
  expect(testConfig?.dealsChannel).toBe(mockDealsChannelId);
  
  // Test that interaction channel matches
  expect(mockInteraction.channel.id).toBe(mockDealsChannelId);
  
  // Test manager permission check
  const isManager = discussionChannelHandler.isManagerMessage(mockMessage as any, testConfig!);
  console.log('Is manager message:', isManager);
  expect(isManager).toBe(true);
  
  console.log('All setup checks passed, testing command execution...');
  
  // Execute the createdeals command
  try {
    await createdealsCommand.execute(mockInteraction);
    console.log('Command executed successfully');
    console.log('Final response:', mockInteraction.response);
    
    expect(mockInteraction.replied).toBe(true);
    expect(mockInteraction.response).toBeTruthy();
  } catch (error) {
    console.error('Command execution failed:', error);
    throw error;
  }
});