import { test, expect } from '@playwright/test';
import { DiscussionChannelHandler } from '../src/services/DiscussionChannelHandler';
import { BotConfig } from '../src/types';
import * as statusCommand from '../src/commands/status';
import * as config from '../src/config';

// Mock Discord components
const mockManagerId = 'mock-manager-user-123';
const mockNonManagerId = 'mock-regular-user-456';

// Channel IDs
const LONG_ANALYSIS_CHANNEL = 'mock-long-analysis-123';
const SHORT_ANALYSIS_CHANNEL = 'mock-short-analysis-456';
const MANAGER_GENERAL_MESSAGES_CHANNEL = 'mock-general-345';

// Mock ChatInputCommandInteraction for /status
class MockStatusInteraction {
  public replied: boolean = false;
  public ephemeralResponse: string = '';
  public channel: any;
  public user: any;
  public guild: any;
  public commandName: string = 'status';
  public member: any;
  public replyContent: string = '';
  public replyEphemeral: boolean = false;
  public replyEmbeds: any[] = [];

  constructor(userId: string = mockManagerId, hasGuild: boolean = true) {
    this.user = { id: userId, tag: userId === mockManagerId ? 'Manager#1234' : 'User#5678' };
    this.member = { displayName: userId === mockManagerId ? 'MockManager' : 'MockUser' };

    this.channel = {
      id: MANAGER_GENERAL_MESSAGES_CHANNEL,
      isThread: () => false
    };

    this.guild = hasGuild ? {
      id: 'mock-guild-id',
      channels: {
        cache: {
          get: (id: string) => ({
            id,
            name: `mock-channel-${id}`,
            toString: () => `<#${id}>`
          })
        }
      }
    } : null;
  }

  async reply(content: any) {
    this.replied = true;
    if (typeof content === 'object') {
      this.replyContent = content.content || '';
      this.replyEphemeral = content.ephemeral || false;
      this.replyEmbeds = content.embeds || [];
      if (content.ephemeral) {
        this.ephemeralResponse = content.content || '';
      }
    } else if (typeof content === 'string') {
      this.replyContent = content;
    }

    return {
      id: `reply-${Date.now()}`,
      content: this.replyContent
    };
  }
}

test.describe('Status Command Permissions', () => {
  let discussionChannelHandler: DiscussionChannelHandler;
  let botConfig: BotConfig;

  test.beforeEach(() => {
    // Initialize services
    discussionChannelHandler = new DiscussionChannelHandler();

    // Setup bot config with manager ID
    botConfig = {
      generalNoticesChannel: MANAGER_GENERAL_MESSAGES_CHANNEL,
      analysisChannels: [LONG_ANALYSIS_CHANNEL, SHORT_ANALYSIS_CHANNEL],
      discussionChannels: [],
      guildId: 'mock-guild-id',
      managerId: mockManagerId
    };

    // Mock getBotConfig to return our test config
    config.getBotConfig = () => botConfig;

    // Initialize status command services
    statusCommand.initializeServices(discussionChannelHandler);

    console.log('Test setup completed');
  });

  test('should reject command from non-manager user with ephemeral error', async () => {
    console.log('Testing: non-manager user should be rejected...');

    const interaction = new MockStatusInteraction(mockNonManagerId, true);

    await statusCommand.execute(interaction as any);

    // Should have replied
    expect(interaction.replied).toBe(true);

    // Should be ephemeral
    expect(interaction.replyEphemeral).toBe(true);

    // Should contain rejection message
    expect(interaction.replyContent).toContain('Only managers can use this command');

    // Should NOT have embeds (status info)
    expect(interaction.replyEmbeds.length).toBe(0);

    console.log('Non-manager correctly rejected with ephemeral message');
  });

  test('should allow command from manager user and show status embed', async () => {
    console.log('Testing: manager user should be allowed...');

    const interaction = new MockStatusInteraction(mockManagerId, true);

    await statusCommand.execute(interaction as any);

    // Should have replied
    expect(interaction.replied).toBe(true);

    // Should NOT be ephemeral (status is visible)
    expect(interaction.replyEphemeral).toBe(false);

    // Should have embed with status info
    expect(interaction.replyEmbeds.length).toBeGreaterThan(0);

    // Should NOT contain rejection message
    expect(interaction.replyContent).not.toContain('Only managers can use this command');

    console.log('Manager correctly allowed with status embed');
  });

  test('should reject when no manager ID configured (secure default)', async () => {
    console.log('Testing: no manager ID configured should reject all...');

    // Remove manager ID from config
    const noManagerConfig: BotConfig = {
      ...botConfig,
      managerId: undefined
    };
    config.getBotConfig = () => noManagerConfig;

    const interaction = new MockStatusInteraction(mockManagerId, true);

    await statusCommand.execute(interaction as any);

    // Should have replied
    expect(interaction.replied).toBe(true);

    // Should be ephemeral
    expect(interaction.replyEphemeral).toBe(true);

    // Should contain rejection message
    expect(interaction.replyContent).toContain('Only managers can use this command');

    console.log('Correctly rejected when no manager ID configured');
  });

  test('should reject when used in DM (no guild)', async () => {
    console.log('Testing: DM usage should be rejected...');

    const interaction = new MockStatusInteraction(mockManagerId, false);

    await statusCommand.execute(interaction as any);

    // Should have replied
    expect(interaction.replied).toBe(true);

    // Should be ephemeral
    expect(interaction.replyEphemeral).toBe(true);

    // Should contain guild-only message
    expect(interaction.replyContent).toContain('can only be used in a guild');

    console.log('DM usage correctly rejected');
  });
});
