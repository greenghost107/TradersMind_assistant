import { Client, Message, TextChannel } from 'discord.js';
import { RetentionJob, BotConfig, MessageGroup } from '../types';

export class MessageRetention {
  private retentionJobs: Map<string, RetentionJob> = new Map();
  private groupedJobs: Map<string, string[]> = new Map(); // groupId -> messageIds
  private cleanupInterval: NodeJS.Timeout | null = null;
  private config: BotConfig | null = null;
  private client: Client | null = null;
  private static readonly CLEANUP_INTERVAL_HOURS = 1;

  public initialize(client: Client, config: BotConfig): void {
    this.client = client;
    this.config = config;
  }

  public addMessageForRetention(message: Message, groupId?: string): void {
    const job: RetentionJob = {
      messageId: message.id,
      channelId: message.channel.id,
      createdAt: message.createdAt,
      deleteAt: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)), // Far future date (never expires)
      ...(groupId && { groupId }),
      ...(groupId && { isGrouped: true })
    };

    // Track grouped messages
    if (groupId) {
      if (!this.groupedJobs.has(groupId)) {
        this.groupedJobs.set(groupId, []);
      }
      this.groupedJobs.get(groupId)!.push(message.id);
    }

    this.retentionJobs.set(message.id, job);
    console.log(`🔍 DEBUG: Added message ${message.id} to retention tracking (total: ${this.retentionJobs.size})`);
  }

  public startCleanupScheduler(): void {
    // No automatic cleanup - messages only cleaned up on Hebrew updates and shutdown
    console.log('🕒 Message retention initialized (manual cleanup only)');
  }

  public stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('🛑 Message retention cleanup scheduler stopped');
    }
  }



  public getRetentionStats(): { 
    pendingJobs: number; 
    oldestJob: Date | null; 
    newestJob: Date | null;
  } {
    const jobs = Array.from(this.retentionJobs.values());
    
    return {
      pendingJobs: jobs.length,
      oldestJob: jobs.length > 0 ? new Date(Math.min(...jobs.map(j => j.deleteAt.getTime()))) : null,
      newestJob: jobs.length > 0 ? new Date(Math.max(...jobs.map(j => j.deleteAt.getTime()))) : null
    };
  }

  // Static instance for global access - set by bot during initialization
  private static instance: MessageRetention | null = null;
  
  public static setInstance(instance: MessageRetention): void {
    MessageRetention.instance = instance;
  }
  
  public static getGlobalStats(): { 
    pendingJobs: number; 
    oldestJob: Date | null; 
    newestJob: Date | null;
  } | null {
    return MessageRetention.instance?.getRetentionStats() || null;
  }

  public removeRetentionJob(messageId: string): void {
    this.retentionJobs.delete(messageId);
  }

  public async performImmediateCleanup(): Promise<void> {
    console.log('🧹 Performing immediate cleanup (Hebrew update triggered)...');
    
    if (!this.client || !this.config) {
      console.log('⚠️ MessageRetention not properly initialized for immediate cleanup');
      return;
    }

    const startTime = Date.now();
    let totalDeleted = 0;
    let totalErrors = 0;

    try {
      // Process all pending retention jobs immediately
      const expiredJobs: RetentionJob[] = [];
      
      for (const [messageId, job] of this.retentionJobs.entries()) {
        expiredJobs.push(job);
        this.retentionJobs.delete(messageId);
      }

      console.log(`🧹 Processing ${expiredJobs.length} pending retention jobs...`);

      // Delete messages from retention jobs
      for (const job of expiredJobs) {
        try {
          const channel = this.client.channels.cache.get(job.channelId) as TextChannel;
          if (!channel) continue;

          const message = await channel.messages.fetch(job.messageId);
          if (message && message.author.id === this.client.user?.id) {
            await message.delete();
            totalDeleted++;
          }
        } catch (error: any) {
          if (error.code !== 10008) { // Ignore "message not found"
            totalErrors++;
          }
        }
      }

      // Clear group tracking
      this.groupedJobs.clear();

      // Perform comprehensive bot message cleanup (not just buttons)
      await this.cleanupBotMessages();

    } catch (error) {
      console.error('❌ Error during immediate cleanup:', error);
      totalErrors++;
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Immediate cleanup complete: ${totalDeleted} messages deleted, ${totalErrors} errors (${duration}ms)`);
  }

  public async clearAllBotButtons(): Promise<void> {
    if (!this.client || !this.config) return;

    console.log('🧹 Clearing all bot button messages...');
    
    try {
      const allChannels = [
        this.config.generalNoticesChannel,
        ...this.config.analysisChannels
      ];

      let totalCleared = 0;

      for (const channelId of allChannels) {
        try {
          const channel = this.client.channels.cache.get(channelId) as TextChannel;
          if (!channel) continue;

          const messages = await channel.messages.fetch({ limit: 50 });
          const botMessages = messages.filter(msg => 
            msg.author.id === this.client!.user?.id && 
            msg.components && 
            msg.components.length > 0
          );

          for (const message of botMessages.values()) {
            try {
              await message.delete();
              totalCleared++;
            } catch (error: any) {
              if (error.code !== 10008) {
                console.error(`Error deleting bot button message ${message.id}:`, error.message);
              }
            }
          }

        } catch (error: any) {
          if (error.code !== 50001 && error.code !== 50013) {
            console.error(`Error clearing buttons in channel ${channelId}:`, error.message);
          }
        }
      }

      if (totalCleared > 0) {
        console.log(`🧹 Cleared ${totalCleared} bot button messages`);
      }

    } catch (error) {
      console.error('Error clearing bot buttons:', error);
    }
  }

  private async cleanupBotMessages(): Promise<void> {
    if (!this.client || !this.config) return;

    console.log('🧹 Cleaning up all bot messages...');

    try {
      const allChannels = [
        this.config.generalNoticesChannel,
        ...this.config.analysisChannels
      ];

      for (const channelId of allChannels) {
        await this.cleanupChannelMessages(channelId);
      }
      
    } catch (error) {
      console.error('Error cleaning up bot messages:', error);
    }
  }

  private async cleanupChannelMessages(channelId: string): Promise<void> {
    if (!this.client) return;

    try {
      const channel = this.client.channels.cache.get(channelId) as TextChannel;
      if (!channel) return;

      const messages = await channel.messages.fetch({ limit: 100 });
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000); // 1 hour ago
      
      // Filter for bot messages that are either:
      // 1. Button messages (have components) - always delete regardless of age
      // 2. Old admin messages (text-only, older than 1 hour)
      const botMessagesToDelete = messages.filter(msg => {
        if (msg.author.id !== this.client!.user?.id) return false;
        
        // Always delete button messages (interactive components)
        if (msg.components && msg.components.length > 0) return true;
        
        // Only delete admin/text messages if they're older than 1 hour
        if (msg.createdTimestamp < oneHourAgo) return true;
        
        return false;
      });

      let deletedCount = 0;
      for (const message of botMessagesToDelete.values()) {
        try {
          await message.delete();
          deletedCount++;
        } catch (error: any) {
          if (error.code !== 10008) {
            console.error(`Error deleting bot message ${message.id}:`, error.message);
          }
        }
      }

      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} bot messages from ${channel.name} (${botMessagesToDelete.size - deletedCount} failed)`);
      }

    } catch (error: any) {
      if (error.code !== 50001 && error.code !== 50013) {
        console.error(`Error cleaning up channel ${channelId}:`, error.message);
      }
    }
  }

  public async performFinalCleanup(): Promise<void> {
    console.log('🧹 Performing final cleanup before shutdown...');
    console.log(`🔍 DEBUG: MessageRetention state - client: ${!!this.client}, config: ${!!this.config}, jobs: ${this.retentionJobs.size}`);
    
    if (!this.client || !this.config) {
      console.log('⚠️ MessageRetention not properly initialized for final cleanup');
      return;
    }

    const startTime = Date.now();
    let totalDeleted = 0;
    let totalErrors = 0;
    const maxRetries = 3;
    const retryDelay = 500; // 500ms between retries

    try {
      // Process all pending retention jobs immediately
      const expiredJobs: RetentionJob[] = [];
      
      for (const [messageId, job] of this.retentionJobs.entries()) {
        expiredJobs.push(job);
        this.retentionJobs.delete(messageId);
      }

      console.log(`🧹 Processing ${expiredJobs.length} pending retention jobs...`);

      // Delete messages from retention jobs with retry logic
      for (const job of expiredJobs) {
        let retryCount = 0;
        let deleted = false;
        
        while (retryCount < maxRetries && !deleted) {
          try {
            const channel = this.client.channels.cache.get(job.channelId) as TextChannel;
            if (!channel) break;

            const message = await channel.messages.fetch(job.messageId);
            if (message && message.author.id === this.client.user?.id) {
              await message.delete();
              totalDeleted++;
              deleted = true;
              console.log(`🗑️ Deleted retention job message ${job.messageId} in channel ${channel.name}`);
            }
          } catch (error: any) {
            if (error.code === 10008) { // Message not found - consider it deleted
              deleted = true;
              break;
            }
            
            retryCount++;
            if (retryCount < maxRetries) {
              console.log(`⚠️ Retry ${retryCount}/${maxRetries} for message ${job.messageId}: ${error.message}`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
              console.error(`❌ Failed to delete retention job message ${job.messageId} after ${maxRetries} attempts: ${error.message}`);
              totalErrors++;
            }
          }
        }
      }

      // Clear group tracking
      this.groupedJobs.clear();
      console.log('🧹 Cleared grouped jobs tracking');

      // Perform comprehensive bot message cleanup for shutdown
      console.log('🧹 Starting comprehensive bot message cleanup for shutdown...');
      const shutdownDeleted = await this.cleanupBotMessagesForShutdown();
      totalDeleted += shutdownDeleted;

    } catch (error) {
      console.error('❌ Error during final cleanup:', error);
      totalErrors++;
    }

    const duration = Date.now() - startTime;
    
    // Show comprehensive completion message
    if (totalDeleted > 0) {
      console.log(`🎉 CLEANUP FINISHED: Successfully deleted ${totalDeleted} bot messages in ${duration}ms`);
      console.log(`✅ All bot messages have been cleaned up from Discord channels`);
    } else {
      console.log(`✅ Cleanup complete: No bot messages found to delete (${duration}ms)`);
    }
    
    if (totalErrors > 0) {
      console.log(`⚠️ ${totalErrors} errors occurred during cleanup`);
    }
    
    console.log(`📊 Final cleanup summary: ${totalDeleted} deleted, ${totalErrors} errors, ${duration}ms duration`);
  }

  private async cleanupBotMessagesForShutdown(): Promise<number> {
    if (!this.client || !this.config) return 0;

    console.log('🧹 Cleaning up all bot messages for shutdown...');
    let totalDeleted = 0;

    try {
      const allChannels = [
        this.config.generalNoticesChannel,
        ...this.config.analysisChannels
      ];

      for (const channelId of allChannels) {
        try {
          const channel = this.client.channels.cache.get(channelId) as TextChannel;
          if (!channel) continue;

          const messages = await channel.messages.fetch({ limit: 100 });
          const botMessages = messages.filter(msg => msg.author.id === this.client!.user?.id);

          for (const message of botMessages.values()) {
            try {
              await message.delete();
              totalDeleted++;
            } catch (error: any) {
              if (error.code !== 10008) {
                console.error(`Error deleting bot message ${message.id}:`, error.message);
              }
            }
          }

          if (botMessages.size > 0) {
            console.log(`🧹 Cleaned up ${botMessages.size} bot messages from ${channel.name}`);
          }

        } catch (error: any) {
          if (error.code !== 50001 && error.code !== 50013) {
            console.error(`Error cleaning up channel ${channelId}:`, error.message);
          }
        }
      }
      
    } catch (error) {
      console.error('Error cleaning up bot messages for shutdown:', error);
    }

    return totalDeleted;
  }
}