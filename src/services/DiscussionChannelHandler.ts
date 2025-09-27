import { Message } from 'discord.js';
import { BotConfig } from '../types';
import { Logger } from '../utils/Logger';

export class DiscussionChannelHandler {
  constructor() {}

  /**
   * Checks if a message is from the configured manager (specific user ID)
   */
  public isManagerMessage(message: Message, config: BotConfig): boolean {
    // If no manager ID configured, reject all messages (secure default)
    if (!config.managerId) {
      Logger.warn('No manager ID configured - rejecting all discussion channel messages');
      return false;
    }

    // Check if message author ID matches the configured manager ID
    const isManager = message.author.id === config.managerId;

    if (isManager) {
      Logger.debug(`Message ${message.id} from ${message.author.tag} (${message.author.id}) approved - matches manager ID`);
      return true;
    } else {
      Logger.debug(`Message ${message.id} from ${message.author.tag} (${message.author.id}) rejected - does not match manager ID: ${config.managerId}`);
      return false;
    }
  }

  /**
   * Checks if a message is in a discussion channel
   */
  public isDiscussionChannel(message: Message, config: BotConfig): boolean {
    return config.discussionChannels.includes(message.channel.id);
  }

  /**
   * Determines if a discussion channel message should be processed
   * (must be from a manager OR a reply from a manager)
   */
  public shouldProcessDiscussionMessage(message: Message, config: BotConfig): boolean {
    // Must be in a discussion channel
    if (!this.isDiscussionChannel(message, config)) {
      return false;
    }

    // Skip bot messages
    if (message.author.bot) {
      return false;
    }

    // Check if it's a manager message or reply from manager
    const isManager = this.isManagerMessage(message, config);
    
    if (isManager) {
      Logger.debug(`📝 Processing discussion message ${message.id} from manager ${message.author.tag}`);
      return true;
    }

    Logger.debug(`🚫 Skipping discussion message ${message.id} from non-manager ${message.author.tag}`);
    return false;
  }

  /**
   * Gets configured manager ID for logging/debugging
   */
  public getConfiguredManagerId(config: BotConfig): string | null {
    return config.managerId || null;
  }
}