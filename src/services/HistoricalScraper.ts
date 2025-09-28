import { Client, TextChannel, Collection, Message } from 'discord.js';
import { BotConfig, AnalysisData } from '../types';
import { SymbolDetector } from './SymbolDetector';
import { UrlExtractor } from './UrlExtractor';
import { Logger } from '../utils/Logger';
import { DiscordUrlGenerator } from '../utils/DiscordUrlGenerator';
import { ThreadManager } from './ThreadManager';
import { DiscussionChannelHandler } from './DiscussionChannelHandler';

export class HistoricalScraper {
  private symbolDetector: SymbolDetector;
  private urlExtractor: UrlExtractor;
  private threadManager: ThreadManager;
  private discussionChannelHandler: DiscussionChannelHandler;
  private config: BotConfig;
  private readonly DAYS_TO_SCRAPE = 7;
  private readonly REQUEST_DELAY_MS = 100;

  constructor(config: BotConfig) {
    this.config = config;
    this.symbolDetector = new SymbolDetector();
    this.urlExtractor = new UrlExtractor();
    this.threadManager = new ThreadManager(config.analysisChannels);
    this.discussionChannelHandler = new DiscussionChannelHandler();
  }

  public async scrapeHistoricalAnalysis(
    client: Client,
    config: BotConfig
  ): Promise<Map<string, AnalysisData>> {
    Logger.info(`Starting historical analysis scrape (last ${this.DAYS_TO_SCRAPE} days)...`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.DAYS_TO_SCRAPE);
    
    const latestAnalysisMap = new Map<string, AnalysisData>();
    let totalMessagesProcessed = 0;
    let totalSymbolsFound = 0;

    // Scrape analysis channels
    for (const channelId of config.analysisChannels) {
      try {
        const channel = await client.channels.fetch(channelId) as TextChannel;
        if (!channel || !channel.isTextBased()) {
          Logger.warn(`Could not access analysis channel ${channelId}`);
          continue;
        }
        
        Logger.info(`Scraping analysis channel #${channel.name} (${channelId})...`);
        
        const messages = await this.fetchRecentMessages(channel, cutoffDate, client);
        Logger.info(`Found ${messages.size} messages in analysis channel #${channel.name}`);

        const channelResults = await this.processChannelMessages(
          messages,
          channel.guildId || 'unknown',
          false // not a discussion channel
        );
        
        Logger.debug(`Found ${channelResults.size} symbols in analysis channel ${channel.name}`);
        for (const [symbol, analysisData] of channelResults) {
          const existing = latestAnalysisMap.get(symbol);
          if (!existing || analysisData.timestamp > existing.timestamp) {
            latestAnalysisMap.set(symbol, analysisData);
          }
        }

        totalMessagesProcessed += messages.size;
        totalSymbolsFound += channelResults.size;

        await this.delay(this.REQUEST_DELAY_MS);
      } catch (error) {
        Logger.error(`Error scraping analysis channel ${channelId}:`, error);
      }
    }

    // Scrape discussion channels for manager messages
    for (const channelId of config.discussionChannels) {
      try {
        const channel = await client.channels.fetch(channelId) as TextChannel;
        if (!channel || !channel.isTextBased()) {
          Logger.warn(`Could not access discussion channel ${channelId}`);
          continue;
        }
        
        Logger.info(`Scraping discussion channel #${channel.name} (${channelId}) for manager messages...`);
        
        const messages = await this.fetchRecentMessages(channel, cutoffDate, client);
        Logger.info(`Found ${messages.size} messages in discussion channel #${channel.name}`);

        const channelResults = await this.processChannelMessages(
          messages,
          channel.guildId || 'unknown',
          true // is a discussion channel
        );
        
        Logger.debug(`Found ${channelResults.size} symbols in discussion channel ${channel.name}`);
        for (const [symbol, analysisData] of channelResults) {
          const existing = latestAnalysisMap.get(symbol);
          if (!existing || analysisData.timestamp > existing.timestamp) {
            latestAnalysisMap.set(symbol, analysisData);
          }
        }

        totalMessagesProcessed += messages.size;
        totalSymbolsFound += channelResults.size;

        await this.delay(this.REQUEST_DELAY_MS);
      } catch (error) {
        Logger.error(`Error scraping discussion channel ${channelId}:`, error);
      }
    }

    Logger.info(`Historical scrape complete!`);
    Logger.info(`Processed ${totalMessagesProcessed} messages`);
    Logger.info(`Found ${latestAnalysisMap.size} unique symbols with analysis`);
    
    if (latestAnalysisMap.size > 0) {
      const symbols = Array.from(latestAnalysisMap.keys()).sort();
      Logger.info(`Symbols: ${symbols.join(', ')}`);
    }

    return latestAnalysisMap;
  }

  private async fetchRecentMessages(
    channel: TextChannel,
    cutoffDate: Date,
    client: Client
  ): Promise<Collection<string, Message>> {
    const messages = new Collection<string, Message>();
    let lastMessageId: string | undefined;
    let batchCount = 0;
    const MAX_BATCHES = 50;

    const threadMessageIds = await this.threadManager.getThreadMessageIds(client, channel.id, true);

    while (batchCount < MAX_BATCHES) {
      try {
        const fetchOptions = { 
          limit: 100,
          ...(lastMessageId && { before: lastMessageId })
        };

        const batch = await channel.messages.fetch(fetchOptions);
        
        if (batch.size === 0) {
          break;
        }

        let hitCutoff = false;
        for (const message of batch.values()) {
          if (message.createdAt < cutoffDate) {
            hitCutoff = true;
            break;
          }
          
          if (!message.author.bot && message.content.trim()) {
            if (threadMessageIds.has(message.id)) {
              continue;
            }
            
            messages.set(message.id, message);
          }
        }

        if (hitCutoff) {
          break;
        }

        lastMessageId = batch.last()?.id;
        batchCount++;

        await this.delay(this.REQUEST_DELAY_MS);
      } catch (error) {
        Logger.error(`Error fetching message batch:`, error);
        break;
      }
    }

    return messages;
  }

  private async processChannelMessages(
    messages: Collection<string, Message>,
    guildId: string,
    isDiscussionChannel: boolean = false
  ): Promise<Map<string, AnalysisData>> {
    const analysisMap = new Map<string, AnalysisData>();

    for (const message of messages.values()) {
      try {
        // If this is a discussion channel, filter for manager messages only
        if (isDiscussionChannel && !this.discussionChannelHandler.shouldProcessDiscussionMessage(message, this.config)) {
          continue;
        }
        
        const symbols = this.extractSymbolsFromFirstLine(message.content);
        
        if (symbols.length === 0) {
          continue;
        }

        const messageUrl = DiscordUrlGenerator.generateMessageUrl(guildId, message);
        const symbolStrings = symbols.map(s => s.symbol);
        
        const extractedUrls = this.urlExtractor.extractUrlsFromMessage(message);
        
        
        const analysisData: AnalysisData = {
          messageId: message.id,
          channelId: message.channelId,
          authorId: message.author.id,
          content: message.content,
          symbols: symbolStrings,
          timestamp: message.createdAt,
          relevanceScore: this.calculateRelevanceScore(message.content, symbols.length),
          messageUrl,
          chartUrls: extractedUrls.chartUrls,
          attachmentUrls: extractedUrls.attachmentUrls,
          hasCharts: extractedUrls.hasCharts
        };

        for (const symbol of symbolStrings) {
          const existing = analysisMap.get(symbol);
          
          if (!existing) {
            analysisMap.set(symbol, analysisData);
          } else {
            const currentScore = this.calculateMessageAnalysisScore(message.content, analysisData);
            const existingScore = this.calculateMessageAnalysisScore(existing.content, existing);
            
            if (currentScore > 0 && existingScore < 0) {
              analysisMap.set(symbol, analysisData);
            } else if (currentScore < 0 && existingScore > 0) {
              // Keep existing
            } else {
              if (message.createdAt > existing.timestamp) {
                analysisMap.set(symbol, analysisData);
              }
            }
          }
        }
      } catch (error) {
        Logger.warn(`Failed to process message ${message.id}:`, error);
      }
    }

    return analysisMap;
  }

  private extractSymbolsFromFirstLine(content: string) {
    const firstLine = content.split('\n')[0] || '';
    return this.symbolDetector.detectSymbols(firstLine);
  }

  private calculateMessageAnalysisScore(content: string, analysisData: AnalysisData): number {
    let score = 0;
    if (content.length > 500) {
      score += 50;
    } else if (content.length > 200) {
      score += 30;
    } else if (content.length > 100) {
      score += 20;
    } else {
      score += 10;
    }
    
    if (analysisData.hasCharts) {
      score += 40;
    }
    if (analysisData.attachmentUrls && analysisData.attachmentUrls.length > 0) {
      score += 30;
    }
    
    const lowerContent = content.toLowerCase();
    const strongAnalysisKeywords = ['analysis', 'target', 'price target', 'technical analysis', 'chart analysis', 'support', 'resistance'];
    for (const keyword of strongAnalysisKeywords) {
      if (lowerContent.includes(keyword)) {
        score += 20;
      }
    }
    
    if (content.length < 50) {
      score -= 30;
    }
    
    if (analysisData.symbols.length === 1) {
      score += 15;
    }
    
    return score;
  }

  private calculateRelevanceScore(content: string, symbolCount: number): number {
    let score = 0.5;
    
    const lowerContent = content.toLowerCase();
    
    const strongKeywords = ['analysis', 'target', 'price target', 'bullish', 'bearish', 'recommendation'];
    const mediumKeywords = ['chart', 'technical', 'support', 'resistance', 'breakout', 'trend'];
    const weakKeywords = ['buy', 'sell', 'hold', 'watch', 'trade'];
    
    for (const keyword of strongKeywords) {
      if (lowerContent.includes(keyword)) {
        score += 0.3;
      }
    }
    
    for (const keyword of mediumKeywords) {
      if (lowerContent.includes(keyword)) {
        score += 0.2;
      }
    }
    
    for (const keyword of weakKeywords) {
      if (lowerContent.includes(keyword)) {
        score += 0.1;
      }
    }
    
    if (content.length > 200) {
      score += 0.1;
    }
    
    if (symbolCount === 1) {
      score += 0.2;
    } else if (symbolCount <= 3) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }


  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async getChannelInfo(client: Client, channelId: string): Promise<string> {
    try {
      const channel = await client.channels.fetch(channelId) as TextChannel;
      return channel?.name || 'unknown-channel';
    } catch {
      return 'inaccessible-channel';
    }
  }
}