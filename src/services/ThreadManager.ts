import { Client, TextChannel, ThreadChannel, Collection, Message } from 'discord.js';
import { Logger } from '../utils/Logger';

export class ThreadManager {
  private threadMessageCache: Map<string, Set<string>> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private readonly analysisChannels: string[];
  private readonly DAYS_TO_SCRAPE = 20;
  constructor(analysisChannels: string[]) {
    this.analysisChannels = analysisChannels;
  }

  /**
   * Checks if a message is from a thread by examining the message's channel properties
   * @param client Discord client
   * @param message The Discord message to check
   * @returns true if message is in a thread, false otherwise
   */
  public async isMessageFromThread(client: Client, message: any): Promise<boolean> {
    try {
      const channelId = message.channel.id;
      Logger.debug(`ThreadManager: Checking if message ${message.id} is from thread. Channel: ${channelId}, Channel type: ${message.channel.constructor.name}`);
      
      // First check for reply messages (replies are never threads)
      const isReply = message.reference !== null && message.reference && message.reference.messageId;
      if (isReply) {
        Logger.debug(`ThreadManager: Message ${message.id} is a REPLY message - allowing processing`);
        return false;
      }

      // Check if the message's channel itself is a thread
      if (message.channel.isThread && message.channel.isThread()) {
        Logger.debug(`ThreadManager: Message ${message.id} is in thread channel ${channelId} - blocking`);
        return true;
      }

      // Check if channel is ThreadChannel by constructor
      if (message.channel.constructor.name === 'ThreadChannel') {
        Logger.debug(`ThreadManager: Message ${message.id} is in ThreadChannel ${channelId} - blocking`);
        return true;
      }

      // Check if channel has thread metadata
      if (message.channel && 'threadMetadata' in message.channel) {
        Logger.debug(`ThreadManager: Message ${message.id} is in channel with threadMetadata ${channelId} - blocking`);
        return true;
      }

      // Check if the channel has a parentId (indicating it's a thread)
      if (message.channel && 'parentId' in message.channel && message.channel.parentId) {
        const parentId = message.channel.parentId;
        Logger.debug(`ThreadManager: Message ${message.id} has parentId: ${parentId}, analysis channels: [${this.analysisChannels.join(', ')}]`);
        if (this.analysisChannels.includes(parentId)) {
          Logger.debug(`ThreadManager: Message ${message.id} is in thread (parentId: ${parentId}) - blocking`);
          return true;
        }
      }

      Logger.debug(`ThreadManager: Message ${message.id} in channel ${channelId} - not in thread, allowing`);
      return false;
    } catch (error) {
      Logger.warn(`ThreadManager: Error checking if message ${message.id} is from thread:`, error);
      return false; // If we can't determine, assume it's not in a thread
    }
  }

  /**
   * Legacy method - checks if a message ID exists in any thread of the specified channel
   * @param client Discord client
   * @param channelId Channel to check threads in
   * @param messageId Message ID to look for
   * @returns true if message is in a thread, false otherwise
   */
  public async isMessageInThread(client: Client, channelId: string, messageId: string): Promise<boolean> {
    try {
      // Only check threads in analysis channels
      if (!this.analysisChannels.includes(channelId)) {
        return false;
      }

      // Get thread message IDs for this channel
      const threadMessageIds = await this.getThreadMessageIds(client, channelId, false);
      const isInThread = threadMessageIds.has(messageId);
      
      if (isInThread) {
        Logger.debug(`ThreadManager: Message ${messageId} found in thread in channel ${channelId}`);
      }
      
      return isInThread;
    } catch (error) {
      Logger.warn(`ThreadManager: Error checking if message ${messageId} is in thread:`, error);
      return false; // If we can't determine, assume it's not in a thread
    }
  }

  /**
   * Gets original message IDs that started threads (these should be prioritized for indexing)
   * @param client Discord client
   * @param channelId Channel ID to check
   * @param includeArchived Whether to include archived threads
   * @returns Set of original message IDs that started threads
   */
  public async getThreadStarterMessageIds(client: Client, channelId: string, includeArchived: boolean = false): Promise<Set<string>> {
    try {
      const channel = await client.channels.fetch(channelId) as TextChannel;
      if (!channel || !channel.isTextBased()) {
        Logger.warn(`ThreadManager: Could not access channel ${channelId} for thread starters`);
        return new Set();
      }

      const starterMessageIds = new Set<string>();

      // Get active threads
      const activeThreads = await channel.threads.fetchActive();
      for (const thread of activeThreads.threads.values()) {
        if (thread.ownerId) {
          // Try to get the starter message ID - this might be available in different ways
          const starterMessageId = this.getStarterMessageIdFromThread(thread);
          if (starterMessageId) {
            Logger.debug(`ThreadManager: Thread "${thread.name}" started by message ${starterMessageId}`);
            starterMessageIds.add(starterMessageId);
          }
        }
      }

      // Get archived threads if requested
      if (includeArchived) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.DAYS_TO_SCRAPE);

        const archivedThreads = await channel.threads.fetchArchived({ type: 'public', limit: 50 });
        for (const thread of archivedThreads.threads.values()) {
          if (thread.createdAt && thread.createdAt >= cutoffDate) {
            const starterMessageId = this.getStarterMessageIdFromThread(thread);
            if (starterMessageId) {
              Logger.debug(`ThreadManager: Archived thread "${thread.name}" started by message ${starterMessageId}`);
              starterMessageIds.add(starterMessageId);
            }
          }
        }
      }

      return starterMessageIds;
    } catch (error) {
      Logger.error(`ThreadManager: Error getting thread starter messages for ${channelId}:`, error);
      return new Set();
    }
  }

  /**
   * Attempts to get the original message ID that started a thread
   */
  private getStarterMessageIdFromThread(thread: any): string | null {
    Logger.debug(`ThreadManager: Attempting to get starter message ID for thread "${thread.name}" (${thread.id})`);
    
    // Try different properties that might contain the starter message ID
    if (thread.starterMessageId) {
      Logger.debug(`ThreadManager: Found starterMessageId: ${thread.starterMessageId}`);
      return thread.starterMessageId;
    }
    
    // Some Discord.js versions might have it in metadata
    if (thread.threadMetadata && thread.threadMetadata.starterMessageId) {
      Logger.debug(`ThreadManager: Found starterMessageId in metadata: ${thread.threadMetadata.starterMessageId}`);
      return thread.threadMetadata.starterMessageId;
    }
    
    // For many threads, the thread ID itself IS the starter message ID
    // This is common when threads are created from existing messages
    Logger.debug(`ThreadManager: No explicit starterMessageId found, using thread.id as starter message: ${thread.id}`);
    return thread.id;
  }

  /**
   * Gets message IDs that exist INSIDE threads (replies within threads)
   * This EXCLUDES thread starter messages - they should be indexed normally
   * Thread starter messages (often same as thread.id) contain the original analysis
   * @param client Discord client
   * @param channelId Channel ID to check
   * @param includeArchived Whether to include archived threads (use true for historical scraping)
   * @returns Set of message IDs that are replies INSIDE threads (excludes thread starters)
   */
  public async getThreadMessageIds(client: Client, channelId: string, includeArchived: boolean = false): Promise<Set<string>> {
    try {
      const cacheKey = `${channelId}_${includeArchived}`;
      const now = Date.now();
      
      // Check cache for live messages (not for historical scraping)
      if (!includeArchived && this.threadMessageCache.has(cacheKey)) {
        const expiry = this.cacheExpiry.get(cacheKey) || 0;
        if (now < expiry) {
          Logger.debug(`ThreadManager: Using cached thread messages for channel ${channelId}`);
          return this.threadMessageCache.get(cacheKey)!;
        }
      }

      Logger.debug(`ThreadManager: Fetching thread messages for channel ${channelId}, includeArchived: ${includeArchived}`);
      
      const channel = await client.channels.fetch(channelId) as TextChannel;
      if (!channel || !channel.isTextBased()) {
        Logger.warn(`ThreadManager: Could not access channel ${channelId}`);
        return new Set();
      }

      const threadMessageIds = new Set<string>();

      // Fetch active threads
      const activeThreads = await channel.threads.fetchActive();
      Logger.debug(`ThreadManager: Found ${activeThreads.threads.size} active threads in ${channel.name}`);
      
      for (const thread of activeThreads.threads.values()) {
        Logger.debug(`ThreadManager: Processing thread "${thread.name}" (ID: ${thread.id})`);
        
        // Log thread starter information
        if (thread.ownerId) {
          Logger.debug(`ThreadManager: Thread "${thread.name}" started by user ${thread.ownerId}`);
        }
        
        // Check if thread has a starter message (the message that created the thread)
        if (thread.parent && thread.parent.id) {
          Logger.debug(`ThreadManager: Thread "${thread.name}" parent channel: ${thread.parent.id}`);
        }
        
        // DO NOT exclude thread.id - it might be the original message that started the thread
        // Only exclude messages INSIDE the thread (replies)
        Logger.debug(`ThreadManager: Thread "${thread.name}" ID: ${thread.id} (thread starter - keeping for analysis)`);
        // threadMessageIds.add(thread.id); // REMOVED - thread ID might be the original message
        
        const messageIds = await this.getMessagesFromThread(thread);
        messageIds.forEach(id => threadMessageIds.add(id));
      }

      // Fetch archived threads if requested (for historical scraping)
      if (includeArchived) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.DAYS_TO_SCRAPE); // Last DAYS_TO_SCRAPE days
        
        const archivedThreads = await channel.threads.fetchArchived({
          type: 'public',
          fetchAll: false, // Don't fetch ALL archived threads, just recent ones
          limit: 50 // Reasonable limit
        });
        
        Logger.debug(`ThreadManager: Found ${archivedThreads.threads.size} archived public threads in ${channel.name}`);
        
        for (const thread of archivedThreads.threads.values()) {
          // Only process threads from the last week
          if (thread.createdAt && thread.createdAt >= cutoffDate) {
            // DO NOT exclude thread.id - it might be the original message that started the thread
            Logger.debug(`ThreadManager: Processing archived thread "${thread.name}" ID: ${thread.id} (thread starter - keeping for analysis)`);
            // threadMessageIds.add(thread.id); // REMOVED - thread ID might be the original message
            
            const messageIds = await this.getMessagesFromThread(thread);
            messageIds.forEach(id => threadMessageIds.add(id));
          }
        }

        // Also check private archived threads
        try {
          const archivedPrivateThreads = await channel.threads.fetchArchived({
            type: 'private',
            fetchAll: false,
            limit: 50
          });
          
          Logger.debug(`ThreadManager: Found ${archivedPrivateThreads.threads.size} archived private threads in ${channel.name}`);
          
          for (const thread of archivedPrivateThreads.threads.values()) {
            if (thread.createdAt && thread.createdAt >= cutoffDate) {
              // DO NOT exclude thread.id - it might be the original message that started the thread
              Logger.debug(`ThreadManager: Processing private archived thread "${thread.name}" ID: ${thread.id} (thread starter - keeping for analysis)`);
              // threadMessageIds.add(thread.id); // REMOVED - thread ID might be the original message
              
              const messageIds = await this.getMessagesFromThread(thread);
              messageIds.forEach(id => threadMessageIds.add(id));
            }
          }
        } catch (error) {
          Logger.debug(`ThreadManager: Could not fetch private archived threads (may lack permissions):`, error instanceof Error ? error.message : String(error));
        }
      }

      Logger.debug(`ThreadManager: Total thread message IDs found in ${channel.name}: ${threadMessageIds.size}`);
      if (threadMessageIds.size > 0) {
        const messageIdArray = Array.from(threadMessageIds);
        Logger.debug(`ThreadManager: Thread message IDs in ${channel.name}: [${messageIdArray.join(', ')}]`);
      }

      // Cache for live message checking (not for historical scraping)
      if (!includeArchived) {
        this.threadMessageCache.set(cacheKey, threadMessageIds);
        this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL_MS);
      }

      return threadMessageIds;
    } catch (error) {
      Logger.error(`ThreadManager: Error getting thread message IDs for channel ${channelId}:`, error);
      return new Set();
    }
  }

  /**
   * Extracts all message IDs from a thread
   * @param thread Thread channel to extract messages from
   * @returns Set of message IDs in the thread
   */
  private async getMessagesFromThread(thread: ThreadChannel): Promise<Set<string>> {
    const messageIds = new Set<string>();
    
    try {
      // Fetch messages from the thread
      let lastMessageId: string | undefined;
      let fetchCount = 0;
      const MAX_FETCHES = 20; // Reasonable limit to avoid infinite loops
      
      while (fetchCount < MAX_FETCHES) {
        const fetchOptions = {
          limit: 100,
          ...(lastMessageId && { before: lastMessageId })
        };

        const messages = await thread.messages.fetch(fetchOptions);
        
        if (messages.size === 0) {
          break;
        }

        messages.forEach(message => {
          messageIds.add(message.id);
          Logger.debug(`ThreadManager: Found message ID ${message.id} in thread "${thread.name}"`);
        });

        lastMessageId = messages.last()?.id;
        fetchCount++;
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      Logger.debug(`ThreadManager: Extracted ${messageIds.size} message IDs from thread "${thread.name}"`);
    } catch (error) {
      Logger.warn(`ThreadManager: Error extracting messages from thread "${thread.name}":`, error);
    }
    
    return messageIds;
  }

  /**
   * Clears the cache for all channels
   */
  public clearCache(): void {
    this.threadMessageCache.clear();
    this.cacheExpiry.clear();
    Logger.debug('ThreadManager: Cache cleared');
  }

  /**
   * Gets statistics about cached thread messages
   */
  public getCacheStats(): { channels: number; totalMessageIds: number; cacheHits: number } {
    let totalMessageIds = 0;
    for (const messageIdSet of this.threadMessageCache.values()) {
      totalMessageIds += messageIdSet.size;
    }
    
    return {
      channels: this.threadMessageCache.size,
      totalMessageIds,
      cacheHits: 0 // Would need to implement hit tracking if needed
    };
  }

  /**
   * Helper method to check if a channel is an analysis channel
   */
  public isAnalysisChannel(channelId: string): boolean {
    return this.analysisChannels.includes(channelId);
  }
}