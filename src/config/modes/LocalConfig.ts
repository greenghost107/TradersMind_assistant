import { BotConfig } from '../../types';

export class LocalConfig {
  static getBotConfig(): BotConfig {
    // For local mode, use mock channel IDs
    return {
      analysisChannels: ['local_channel_1', 'local_channel_2'],
      generalNoticesChannel: 'local_general_channel',
      retentionHours: 24, // Shorter retention for local testing
      guildId: 'local_guild_id'
    };
  }

  static getLocalEnvironment() {
    return {
      databasePath: process.env.LOCAL_DB_PATH || './local_bot.db',
      port: parseInt(process.env.LOCAL_PORT || '3000'),
      enableMockData: true,
      enableDetailedLogging: true,
      skipDiscordConnection: process.env.SKIP_DISCORD === 'true',
      
      // Mock Discord settings for testing
      mockDiscordSettings: {
        botUserId: 'local_bot_123',
        botUsername: 'TradersMind Local Bot',
        guildId: 'local_guild_id',
        testMessages: true
      }
    };
  }

  static getMockChannels() {
    return {
      analysisChannels: [
        {
          id: 'local_channel_1',
          name: 'analysis-local-1',
          type: 'analysis'
        },
        {
          id: 'local_channel_2', 
          name: 'analysis-local-2',
          type: 'analysis'
        }
      ],
      generalChannel: {
        id: 'local_general_channel',
        name: 'general-local',
        type: 'general'
      }
    };
  }

  static getTestUsers() {
    return [
      {
        id: 'admin_local_123',
        username: 'Admin (Local)',
        tag: 'Admin#1234',
        isAnalyst: true
      },
      {
        id: 'tomer_local_456',
        username: 'Tomer (Local)', 
        tag: 'Tomer#5678',
        isAnalyst: true
      },
      {
        id: 'test_user_789',
        username: 'Test User',
        tag: 'TestUser#9999',
        isAnalyst: false
      }
    ];
  }

  static getValidationRules() {
    return {
      requireDiscordToken: false,
      requireDatabaseUrl: false,
      requireChannelIds: false,
      allowMockData: true,
      allowSkipDiscord: true
    };
  }
}