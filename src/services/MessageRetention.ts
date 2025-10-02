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
    // Retention functionality removed - messages are only cleaned up on Hebrew updates
  }

  public startCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    const cleanupIntervalMs = MessageRetention.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;
    
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, cleanupIntervalMs);

    console.log(`🕒 Message retention cleanup scheduler started (every ${MessageRetention.CLEANUP_INTERVAL_HOURS} hour(s))`);
    
    // Run initial cleanup
    this.performCleanup();
  }

  public stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('🛑 Message retention cleanup scheduler stopped');
    }
  }

  private async performCleanup(): Promise<void> {
    if (!this.client || !this.config) {
      console.log('⚠️ MessageRetention not properly initialized');
      return;
    }

    const now = new Date();
    const expiredJobs: RetentionJob[] = [];
    const processedGroups = new Set<string>();
    
    
    // Collect expired jobs and group information
    for (const [messageId, job] of this.retentionJobs.entries()) {
      if (now >= job.deleteAt) {
        expiredJobs.push(job);
        this.retentionJobs.delete(messageId);
        
        // If this job is part of a group, mark the entire group for processing
        if (job.groupId && !processedGroups.has(job.groupId)) {
          processedGroups.add(job.groupId);
          
          // Find and mark all messages in this group as expired
          const groupMessageIds = this.groupedJobs.get(job.groupId) || [];
          for (const groupMessageId of groupMessageIds) {
            const groupJob = this.retentionJobs.get(groupMessageId);
            if (groupJob && !expiredJobs.some(ej => ej.messageId === groupMessageId)) {
              expiredJobs.push(groupJob);
              this.retentionJobs.delete(groupMessageId);
            }
          }
          
          // Clean up group tracking
          this.groupedJobs.delete(job.groupId);
        }
        
      }
    }

    if (expiredJobs.length === 0) {
      return;
    }

    const groupedJobs = expiredJobs.filter(job => job.isGrouped).length;
    const singleJobs = expiredJobs.length - groupedJobs;
    console.log(`🧹 Processing ${expiredJobs.length} expired messages for cleanup (${singleJobs} individual, ${groupedJobs} grouped)`);

    let deletedCount = 0;
    let errorCount = 0;

    for (const job of expiredJobs) {
      try {
        const channel = this.client.channels.cache.get(job.channelId) as TextChannel;
        if (!channel) {
          console.log(`⚠️ Channel ${job.channelId} not found for message ${job.messageId}`);
          continue;
        }

        const message = await channel.messages.fetch(job.messageId);
        if (message && message.author.id === this.client.user?.id) {
          await message.delete();
          deletedCount++;
        }
        
      } catch (error: any) {
        if (error.code === 10008) {
          console.log(`ℹ️ Message ${job.messageId} already deleted`);
        } else if (error.code === 50013) {
          console.log(`⚠️ Missing permissions to delete message ${job.messageId}`);
        } else if (error.code === 50001) {
          console.log(`⚠️ Missing access to channel ${job.channelId}`);
        } else {
          console.error(`❌ Error deleting message ${job.messageId}:`, error.message);
          errorCount++;
        }
      }
    }

    if (deletedCount > 0 || errorCount > 0) {
      console.log(`✅ Cleanup complete: ${deletedCount} deleted, ${errorCount} errors`);
    }

    await this.cleanupBotMessages();
  }

  private async cleanupBotMessages(): Promise<void> {
    if (!this.client || !this.config) return;

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

      // No time-based retention - messages only cleaned up on Hebrew updates
      
      const messages = await channel.messages.fetch({ limit: 100 });
      const botMessages = messages.filter(msg => 
        msg.author.id === this.client!.user?.id && 
        msg.createdTimestamp < cutoffTime
      );

      for (const message of botMessages.values()) {
        try {
          await message.delete();
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

      // Perform additional bot message cleanup
      await this.clearAllBotButtons();

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

  public async performFinalCleanup(): Promise<void> {
    console.log('🧹 Performing final cleanup before shutdown...');
    
    if (!this.client || !this.config) {
      console.log('⚠️ MessageRetention not properly initialized for final cleanup');
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

      // Perform final bot message cleanup
      await this.cleanupBotMessages();

    } catch (error) {
      console.error('❌ Error during final cleanup:', error);
      totalErrors++;
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Final cleanup complete: ${totalDeleted} messages deleted, ${totalErrors} errors (${duration}ms)`);
  }
}