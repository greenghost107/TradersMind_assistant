import { Message, Channel, ThreadChannel } from 'discord.js';
import { Logger } from './Logger';

export class ThreadDetector {
  /**
   * Robustly determines if a message is from a thread
   * @param message The Discord message to check
   * @returns true if the message is from a thread, false otherwise
   */
  public static isThreadMessage(message: Message): boolean {
    try {
      // Method 1: Check if channel has isThread method and returns true
      if (message.channel && typeof message.channel.isThread === 'function' && message.channel.isThread()) {
        return true;
      }

      // Method 2: Check if channel is instance of ThreadChannel
      if (message.channel && this.isThreadChannel(message.channel)) {
        return true;
      }

      // Method 3: Check channel type property (fallback)
      if (message.channel && 'type' in message.channel) {
        const channelType = (message.channel as any).type;
        // Discord.js ThreadChannel types: 
        // - GUILD_PRIVATE_THREAD (12)
        // - GUILD_PUBLIC_THREAD (11)  
        // - GUILD_NEWS_THREAD (10)
        if (channelType === 10 || channelType === 11 || channelType === 12) {
          return true;
        }
      }

      return false;
    } catch (error) {
      Logger.warn(`Error checking if message ${message.id} is from thread:`, error);
      // If we can't determine, err on the side of caution and assume it's NOT a thread
      return false;
    }
  }

  /**
   * Type guard to check if a channel is a thread channel
   * @param channel The Discord channel to check
   * @returns true if the channel is a ThreadChannel
   */
  private static isThreadChannel(channel: Channel): boolean {
    return channel.constructor.name === 'ThreadChannel';
  }

  /**
   * Logs thread detection for debugging purposes
   * @param message The message being checked
   * @param serviceName Name of the service doing the check
   * @returns true if thread message (and logs), false otherwise
   */
  public static checkAndLogThread(message: Message, serviceName: string): boolean {
    const isThread = this.isThreadMessage(message);
    if (isThread) {
      Logger.debug(`${serviceName}: Skipping thread message ${message.id} in channel ${message.channel.id}`);
    }
    return isThread;
  }
}