import { DiscussionChannelHandler } from '../src/services/DiscussionChannelHandler';
import { BotConfig } from '../src/types';

describe('DiscussionChannelHandler', () => {
  let handler: DiscussionChannelHandler;
  let mockConfig: BotConfig;

  beforeEach(() => {
    handler = new DiscussionChannelHandler();
    mockConfig = {
      analysisChannels: ['analysis-1', 'analysis-2'],
      discussionChannels: ['discussion-1', 'discussion-2'],
      generalNoticesChannel: 'general-channel',
      guildId: 'test-guild',
      managerId: 'manager-user-id-12345'
    };
  });

  describe('isDiscussionChannel', () => {
    it('should return true for configured discussion channels', () => {
      const mockMessage = {
        channel: { id: 'discussion-1' }
      } as any;

      expect(handler.isDiscussionChannel(mockMessage, mockConfig)).toBe(true);
    });

    it('should return false for non-discussion channels', () => {
      const mockMessage = {
        channel: { id: 'analysis-1' }
      } as any;

      expect(handler.isDiscussionChannel(mockMessage, mockConfig)).toBe(false);
    });
  });

  describe('isManagerMessage', () => {
    it('should return true when user ID matches manager ID', () => {
      const mockMessage = {
        author: { 
          id: 'manager-user-id-12345',
          tag: 'TestUser#1234'
        }
      } as any;

      expect(handler.isManagerMessage(mockMessage, mockConfig)).toBe(true);
    });

    it('should return false when user ID does not match manager ID', () => {
      const mockMessage = {
        author: { 
          id: 'different-user-id-67890',
          tag: 'TestUser#1234'
        }
      } as any;

      expect(handler.isManagerMessage(mockMessage, mockConfig)).toBe(false);
    });

    it('should return false when no manager ID is configured', () => {
      const configWithoutManagerId: BotConfig = {
        ...mockConfig
      };
      delete (configWithoutManagerId as any).managerId;
      
      const mockMessage = {
        author: { 
          id: 'any-user-id',
          tag: 'TestUser#1234'
        }
      } as any;

      expect(handler.isManagerMessage(mockMessage, configWithoutManagerId)).toBe(false);
    });

    it('should work for DM messages when ID matches', () => {
      const mockMessage = {
        author: { 
          id: 'manager-user-id-12345',
          tag: 'TestUser#1234'
        }
      } as any;

      expect(handler.isManagerMessage(mockMessage, mockConfig)).toBe(true);
    });

    it('should return false when manager ID is empty string', () => {
      const configWithEmptyId: BotConfig = {
        ...mockConfig,
        managerId: ''
      };

      const mockMessage = {
        author: { 
          id: 'any-user-id',
          tag: 'TestUser#1234'
        }
      } as any;

      expect(handler.isManagerMessage(mockMessage, configWithEmptyId)).toBe(false);
    });
  });

  describe('shouldProcessDiscussionMessage', () => {
    it('should process manager messages in discussion channels', () => {
      const mockMessage = {
        channel: { id: 'discussion-1' },
        author: { 
          bot: false, 
          tag: 'Manager#1234',
          id: 'manager-user-id-12345'
        }
      } as any;

      expect(handler.shouldProcessDiscussionMessage(mockMessage, mockConfig)).toBe(true);
    });

    it('should not process non-manager messages in discussion channels', () => {
      const mockMessage = {
        channel: { id: 'discussion-1' },
        author: { 
          bot: false, 
          tag: 'User#1234',
          id: 'different-user-id-67890'
        }
      } as any;

      expect(handler.shouldProcessDiscussionMessage(mockMessage, mockConfig)).toBe(false);
    });

    it('should not process messages from non-discussion channels', () => {
      const mockMessage = {
        channel: { id: 'analysis-1' },
        author: { 
          bot: false, 
          tag: 'Manager#1234',
          id: 'manager-user-id-12345'
        }
      } as any;

      expect(handler.shouldProcessDiscussionMessage(mockMessage, mockConfig)).toBe(false);
    });

    it('should not process bot messages', () => {
      const mockMessage = {
        channel: { id: 'discussion-1' },
        author: { 
          bot: true, 
          tag: 'Bot#0001',
          id: 'manager-user-id-12345'
        }
      } as any;

      expect(handler.shouldProcessDiscussionMessage(mockMessage, mockConfig)).toBe(false);
    });
  });

  describe('getConfiguredManagerId', () => {
    it('should return configured manager ID', () => {
      const managerId = handler.getConfiguredManagerId(mockConfig);
      expect(managerId).toBe('manager-user-id-12345');
    });

    it('should return null when no manager ID configured', () => {
      const configWithoutId: BotConfig = {
        ...mockConfig
      };
      delete (configWithoutId as any).managerId;

      const managerId = handler.getConfiguredManagerId(configWithoutId);
      expect(managerId).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle multiple discussion channels', () => {
      const message1 = {
        channel: { id: 'discussion-1' },
        author: { 
          bot: false, 
          tag: 'Manager#1234',
          id: 'manager-user-id-12345'
        }
      } as any;

      const message2 = {
        channel: { id: 'discussion-2' },
        author: { 
          bot: false, 
          tag: 'Manager#1234',
          id: 'manager-user-id-12345'
        }
      } as any;

      expect(handler.shouldProcessDiscussionMessage(message1, mockConfig)).toBe(true);
      expect(handler.shouldProcessDiscussionMessage(message2, mockConfig)).toBe(true);
    });

    it('should be case-sensitive for user IDs', () => {
      const mockMessage = {
        channel: { id: 'discussion-1' },
        author: { 
          bot: false, 
          tag: 'User#1234',
          id: 'MANAGER-USER-ID-12345' // uppercase version
        }
      } as any;

      // Should not match 'manager-user-id-12345' (lowercase)
      expect(handler.shouldProcessDiscussionMessage(mockMessage, mockConfig)).toBe(false);
    });

    it('should handle empty discussion channels array', () => {
      const configWithoutDiscussion: BotConfig = {
        ...mockConfig,
        discussionChannels: []
      };

      const mockMessage = {
        channel: { id: 'some-channel' },
        author: { 
          bot: false, 
          tag: 'Manager#1234',
          id: 'manager-user-id-12345'
        }
      } as any;

      expect(handler.shouldProcessDiscussionMessage(mockMessage, configWithoutDiscussion)).toBe(false);
    });
  });
});