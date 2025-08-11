import { Client, Message, TextChannel } from 'discord.js';
import { RetentionJob, BotConfig } from '../types';

export class MessageRetention {
  private retentionJobs: Map<string, RetentionJob> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private config: BotConfig | null = null;
  private client: Client | null = null;
  private isDebugMode: boolean = false;

  public initialize(client: Client, config: BotConfig): void {
    this.client = client;
    this.config = config;
    this.isDebugMode = config.retentionHours < 1;
    
    if (this.isDebugMode) {
      console.log('🔧 [DEBUG] Debug mode enabled for message retention');
      console.log(`🔧 [DEBUG] Retention time: ${config.retentionHours * 3600} seconds`);
      console.log('🔧 [DEBUG] Cleanup will run every 10 seconds');
    }
  }

  public addMessageForRetention(message: Message, retentionHours?: number): void {
    const effectiveRetentionHours = retentionHours || this.config?.retentionHours || 26;
    
    // In debug mode, treat hours as seconds for faster testing
    const retentionMs = this.isDebugMode 
      ? effectiveRetentionHours * 1000  // seconds to milliseconds
      : effectiveRetentionHours * 60 * 60 * 1000; // hours to milliseconds
    
    const deleteAt = new Date(Date.now() + retentionMs);
    
    const job: RetentionJob = {
      messageId: message.id,
      channelId: message.channel.id,
      createdAt: message.createdAt,
      deleteAt
    };

    this.retentionJobs.set(message.id, job);
    
    if (this.isDebugMode) {
      const timeUnit = this.isDebugMode ? 'seconds' : 'hours';
      const timeValue = this.isDebugMode ? effectiveRetentionHours : effectiveRetentionHours;
      console.log(`🔧 [DEBUG] Added message ${message.id} for deletion in ${timeValue} ${timeUnit} (at ${deleteAt.toLocaleTimeString()})`);
    }
  }

  public startCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Use 10 seconds in debug mode, 1 hour in normal mode
    const cleanupIntervalMs = this.isDebugMode ? 10 * 1000 : 60 * 60 * 1000;
    
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, cleanupIntervalMs);

    const intervalText = this.isDebugMode ? '10 seconds' : '1 hour';
    console.log(`🕒 Message retention cleanup scheduler started (every ${intervalText})`);
    
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
    
    if (this.isDebugMode) {
      console.log(`🔧 [DEBUG] Running cleanup check at ${now.toLocaleTimeString()}, ${this.retentionJobs.size} pending jobs`);
    }
    
    for (const [messageId, job] of this.retentionJobs.entries()) {
      if (now >= job.deleteAt) {
        expiredJobs.push(job);
        this.retentionJobs.delete(messageId);
        
        if (this.isDebugMode) {
          const ageMs = now.getTime() - job.deleteAt.getTime();
          console.log(`🔧 [DEBUG] Found expired job: ${messageId} (${ageMs}ms overdue)`);
        }
      }
    }

    if (expiredJobs.length === 0) {
      if (this.isDebugMode && this.retentionJobs.size > 0) {
        const nextJob = Array.from(this.retentionJobs.values())
          .sort((a, b) => a.deleteAt.getTime() - b.deleteAt.getTime())[0];
        if (nextJob) {
          const timeToNext = nextJob.deleteAt.getTime() - now.getTime();
          console.log(`🔧 [DEBUG] No expired jobs found. Next cleanup in ${Math.round(timeToNext/1000)}s`);
        }
      }
      return;
    }

    console.log(`🧹 Processing ${expiredJobs.length} expired messages for cleanup`);

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
        await this.cleanupChannelMessages(channelId, this.config.retentionHours);
      }
      
    } catch (error) {
      console.error('Error cleaning up bot messages:', error);
    }
  }

  private async cleanupChannelMessages(channelId: string, retentionHours: number): Promise<void> {
    if (!this.client) return;

    try {
      const channel = this.client.channels.cache.get(channelId) as TextChannel;
      if (!channel) return;

      const cutoffTime = Date.now() - (retentionHours * 60 * 60 * 1000);
      
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
    isDebugMode: boolean;
  } {
    const jobs = Array.from(this.retentionJobs.values());
    
    return {
      pendingJobs: jobs.length,
      oldestJob: jobs.length > 0 ? new Date(Math.min(...jobs.map(j => j.deleteAt.getTime()))) : null,
      newestJob: jobs.length > 0 ? new Date(Math.max(...jobs.map(j => j.deleteAt.getTime()))) : null,
      isDebugMode: this.isDebugMode
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
    isDebugMode: boolean;
  } | null {
    return MessageRetention.instance?.getRetentionStats() || null;
  }

  public removeRetentionJob(messageId: string): void {
    this.retentionJobs.delete(messageId);
  }
}