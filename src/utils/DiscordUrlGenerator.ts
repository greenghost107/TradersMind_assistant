import { Message, Channel } from 'discord.js';
import { Logger } from './Logger';

export class DiscordUrlGenerator {
  /**
   * Generates a Discord message URL for regular messages
   * Since the current architecture only processes regular messages, complex thread logic is removed
   * @param guildId The Discord guild/server ID
   * @param channelOrMessage Either a Channel object or a Message object
   * @param messageId The message ID (optional if message object is provided)
   * @returns Properly formatted Discord message URL
   */
  public static generateMessageUrl(
    guildId: string, 
    channelOrMessage: Channel | Message, 
    messageId?: string
  ): string {
    // Handle Message object
    if ('id' in channelOrMessage && 'channel' in channelOrMessage) {
      const message = channelOrMessage as Message;
      return this.generateUrlFromMessage(guildId, message);
    }
    
    // Handle Channel object
    const channel = channelOrMessage as Channel;
    if (!messageId) {
      throw new Error('messageId is required when providing a Channel object');
    }
    
    return this.generateUrlFromChannel(guildId, channel, messageId);
  }

  /**
   * Generates Discord URL from a Message object
   */
  private static generateUrlFromMessage(guildId: string, message: Message): string {
    const channel = message.channel;
    const messageId = message.id;
    
    Logger.debug(`DiscordUrlGenerator: Processing message ${messageId}, channel.id=${channel.id}, guildId=${guildId}`);
    Logger.debug(`DiscordUrlGenerator: Channel type=${channel.type}, constructor=${channel.constructor.name}`);
    Logger.debug(`DiscordUrlGenerator: Generating regular message URL: guild=${guildId}, channel=${channel.id}, message=${messageId}`);
    
    return `https://discord.com/channels/${guildId}/${channel.id}/${messageId}`;
  }

  /**
   * Generates Discord URL from a Channel object and message ID
   */
  private static generateUrlFromChannel(guildId: string, channel: Channel, messageId: string): string {
    Logger.debug(`Generating regular message URL: guild=${guildId}, channel=${channel.id}, message=${messageId}`);
    return `https://discord.com/channels/${guildId}/${channel.id}/${messageId}`;
  }

  /**
   * Generates a Discord message URL using the legacy approach (for compatibility)
   * @param guildId The Discord guild ID
   * @param channelId The channel ID
   * @param messageId The message ID
   * @returns Discord message URL
   * @deprecated Use generateMessageUrl instead
   */
  public static generateLegacyUrl(guildId: string, channelId: string, messageId: string): string {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
  }
}