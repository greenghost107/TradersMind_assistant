import { Client, TextChannel, Collection, Message } from 'discord.js';
import { BotConfig, AnalysisData } from '../types';
import { SymbolDetector } from './SymbolDetector';

export class HistoricalScraper {
  private symbolDetector: SymbolDetector;
  private readonly DAYS_TO_SCRAPE = 7;
  private readonly REQUEST_DELAY_MS = 100; // Small delay between requests to avoid rate limits

  constructor() {
    this.symbolDetector = new SymbolDetector();
  }

  public async scrapeHistoricalAnalysis(
    client: Client,
    config: BotConfig
  ): Promise<Map<string, AnalysisData>> {
    console.log(`🔄 Starting historical analysis scrape (last ${this.DAYS_TO_SCRAPE} days)...`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.DAYS_TO_SCRAPE);
    
    const latestAnalysisMap = new Map<string, AnalysisData>();
    let totalMessagesProcessed = 0;
    let totalSymbolsFound = 0;

    for (const channelId of config.analysisChannels) {
      try {
        const channel = await client.channels.fetch(channelId) as TextChannel;
        if (!channel || !channel.isTextBased()) {
          console.warn(`⚠️ Could not access analysis channel ${channelId}`);
          continue;
        }

        console.log(`📊 Scraping #${channel.name} (${channelId})...`);
        
        const messages = await this.fetchRecentMessages(channel, cutoffDate);
        console.log(`📝 Found ${messages.size} messages in #${channel.name}`);

        const channelResults = await this.processChannelMessages(
          messages,
          channel.guildId || 'unknown'
        );

        // Merge results, keeping only the latest message per symbol
        for (const [symbol, analysisData] of channelResults) {
          const existing = latestAnalysisMap.get(symbol);
          if (!existing || analysisData.timestamp > existing.timestamp) {
            latestAnalysisMap.set(symbol, analysisData);
          }
        }

        totalMessagesProcessed += messages.size;
        totalSymbolsFound += channelResults.size;

        // Small delay to avoid rate limits
        await this.delay(this.REQUEST_DELAY_MS);
      } catch (error) {
        console.error(`❌ Error scraping channel ${channelId}:`, error);
      }
    }

    console.log(`✅ Historical scrape complete!`);
    console.log(`   📊 Processed ${totalMessagesProcessed} messages`);
    console.log(`   🎯 Found ${latestAnalysisMap.size} unique symbols with analysis`);
    
    if (latestAnalysisMap.size > 0) {
      const symbols = Array.from(latestAnalysisMap.keys()).sort();
      console.log(`   📈 Symbols: ${symbols.join(', ')}`);
    }

    return latestAnalysisMap;
  }

  private async fetchRecentMessages(
    channel: TextChannel,
    cutoffDate: Date
  ): Promise<Collection<string, Message>> {
    const messages = new Collection<string, Message>();
    let lastMessageId: string | undefined;
    let batchCount = 0;
    const MAX_BATCHES = 50; // Safety limit to prevent infinite loops

    while (batchCount < MAX_BATCHES) {
      try {
        const fetchOptions = { 
          limit: 100,
          ...(lastMessageId && { before: lastMessageId })
        };

        const batch = await channel.messages.fetch(fetchOptions);
        
        if (batch.size === 0) {
          break; // No more messages
        }

        let hitCutoff = false;
        for (const message of batch.values()) {
          if (message.createdAt < cutoffDate) {
            hitCutoff = true;
            break;
          }
          
          if (!message.author.bot && message.content.trim()) {
            messages.set(message.id, message);
          }
        }

        if (hitCutoff) {
          break; // Reached our time limit
        }

        lastMessageId = batch.last()?.id;
        batchCount++;

        // Small delay between batch fetches
        await this.delay(this.REQUEST_DELAY_MS);
      } catch (error) {
        console.error(`Error fetching message batch:`, error);
        break;
      }
    }

    return messages;
  }

  private async processChannelMessages(
    messages: Collection<string, Message>,
    guildId: string
  ): Promise<Map<string, AnalysisData>> {
    const analysisMap = new Map<string, AnalysisData>();

    for (const message of messages.values()) {
      try {
        const symbols = this.extractSymbolsFromFirstLine(message.content);
        
        if (symbols.length === 0) {
          continue;
        }

        const messageUrl = `https://discord.com/channels/${guildId}/${message.channelId}/${message.id}`;
        const symbolStrings = symbols.map(s => s.symbol);
        
        const analysisData: AnalysisData = {
          messageId: message.id,
          channelId: message.channelId,
          authorId: message.author.id,
          content: message.content,
          symbols: symbolStrings,
          timestamp: message.createdAt,
          relevanceScore: this.calculateRelevanceScore(message.content, symbols.length),
          messageUrl
        };

        // For each symbol, keep only the most recent analysis
        for (const symbol of symbolStrings) {
          const existing = analysisMap.get(symbol);
          if (!existing || message.createdAt > existing.timestamp) {
            analysisMap.set(symbol, analysisData);
          }
        }
      } catch (error) {
        console.warn(`Warning: Failed to process message ${message.id}:`, error);
      }
    }

    return analysisMap;
  }

  private extractSymbolsFromFirstLine(content: string) {
    const firstLine = content.split('\n')[0] || '';
    return this.symbolDetector.detectSymbols(firstLine);
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