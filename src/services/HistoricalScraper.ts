import { Client, TextChannel, Collection, Message } from 'discord.js';
import { BotConfig, AnalysisData } from '../types';
import { SymbolDetector } from './SymbolDetector';
import { UrlExtractor } from './UrlExtractor';
import { Logger } from '../utils/Logger';
import { DiscordUrlGenerator } from '../utils/DiscordUrlGenerator';
import { ThreadManager } from './ThreadManager';
import { DiscussionChannelHandler } from './DiscussionChannelHandler';
import { DAYS_TO_SCRAPE, HEBREW_KEYWORDS } from '../config';

export class HistoricalScraper {
  private symbolDetector: SymbolDetector;
  private urlExtractor: UrlExtractor;
  private threadManager: ThreadManager;
  private discussionChannelHandler: DiscussionChannelHandler;
  private config: BotConfig;
  private readonly REQUEST_DELAY_MS = 100;
  private readonly RELEVANCE_THRESHOLD = 0.7; // Same threshold as AnalysisLinker

  constructor(config: BotConfig, client?: Client) {
    this.config = config;
    this.symbolDetector = new SymbolDetector(client, config.analysisChannels, config.discussionChannels);
    this.urlExtractor = new UrlExtractor();
    this.threadManager = new ThreadManager(config.analysisChannels);
    this.discussionChannelHandler = new DiscussionChannelHandler();
  }

  public async scrapeHistoricalAnalysis(
    client: Client,
    config: BotConfig
  ): Promise<Map<string, AnalysisData>> {
    Logger.info(`Starting historical analysis scrape (last ${DAYS_TO_SCRAPE} days)...`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_SCRAPE);
    
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
          true // apply manager filtering to analysis channels too
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
    applyManagerFiltering: boolean = false
  ): Promise<Map<string, AnalysisData>> {
    const analysisMap = new Map<string, AnalysisData>();

    for (const message of messages.values()) {
      try {
        // Filter for manager messages only if filtering is enabled
        if (applyManagerFiltering && !this.discussionChannelHandler.isManagerMessage(message, this.config)) {
          continue;
        }
        
        const symbols = this.extractSymbolsFromFirstLine(message.content);
        
        if (symbols.length === 0) {
          continue;
        }

        const messageUrl = DiscordUrlGenerator.generateMessageUrl(guildId, message);
        const symbolStrings = symbols.map(s => s.symbol);
        
        const extractedUrls = this.urlExtractor.extractUrlsFromMessage(message);
        
        
        const relevanceScore = this.calculateRelevanceScore(message.content, symbols.length);
        
        // Apply relevance threshold filtering - same as AnalysisLinker
        if (relevanceScore < this.RELEVANCE_THRESHOLD) {
          Logger.debug(`❌ Historical scraper rejected message ${message.id}: relevance score ${relevanceScore.toFixed(3)} below threshold ${this.RELEVANCE_THRESHOLD}`);
          continue;
        }
        
        const analysisData: AnalysisData = {
          messageId: message.id,
          channelId: message.channelId,
          authorId: message.author.id,
          content: message.content,
          symbols: symbolStrings,
          timestamp: message.createdAt,
          relevanceScore,
          messageUrl,
          chartUrls: extractedUrls.chartUrls,
          attachmentUrls: extractedUrls.attachmentUrls,
          hasCharts: extractedUrls.hasCharts
        };

        Logger.debug(`✅ Historical scraper accepted message ${message.id}: relevance score ${relevanceScore.toFixed(3)}, symbols: ${symbolStrings.join(', ')}`);

        for (const symbol of symbolStrings) {
          const existing = analysisMap.get(symbol);
          
          if (!existing) {
            analysisMap.set(symbol, analysisData);
            Logger.debug(`📝 Historical scraper: Setting initial analysis for ${symbol} to message ${message.id}`);
          } else {
            // Quality-first overwrite logic
            const currentScore = relevanceScore;
            const existingScore = existing.relevanceScore;
            const scoreDifference = currentScore - existingScore;
            
            let shouldOverwrite = false;
            let reason = '';
            
            // Primary decision: Quality-based comparison
            if (scoreDifference > 0.1) {
              // Significantly higher quality - overwrite
              shouldOverwrite = true;
              reason = `higher quality (${currentScore.toFixed(3)} vs ${existingScore.toFixed(3)})`;
            } else if (scoreDifference < -0.1) {
              // Significantly lower quality - keep existing
              shouldOverwrite = false;
              reason = `lower quality (${currentScore.toFixed(3)} vs ${existingScore.toFixed(3)})`;
            } else {
              // Similar quality - use timestamp as tiebreaker
              if (message.createdAt > existing.timestamp) {
                shouldOverwrite = true;
                reason = `similar quality but newer timestamp`;
              } else {
                shouldOverwrite = false;
                reason = `similar quality but older timestamp`;
              }
            }
            
            if (shouldOverwrite) {
              analysisMap.set(symbol, analysisData);
              Logger.debug(`🔄 Historical scraper: ${symbol} overwritten - ${reason} (${existing.messageId} -> ${message.id})`);
            } else {
              Logger.debug(`⏸️ Historical scraper: ${symbol} kept existing - ${reason} (keeping ${existing.messageId}, rejecting ${message.id})`);
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
    let score = 0.3; // Lower base score to require actual analysis content
    
    const lowerContent = content.toLowerCase();
    
    // Check for symbol list patterns (major penalty)
    if (this.isSymbolList(content)) {
      Logger.debug(`📋 Symbol list pattern detected in historical scraper: "${content.slice(0, 100)}..."`);
      return 0.1; // Very low score for obvious symbol lists
    }
    
    // Check symbol density (symbol-to-content ratio)
    const symbolDensityPenalty = this.calculateSymbolDensityPenalty(content, symbolCount);
    score -= symbolDensityPenalty;
    
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
    
    // Hebrew keyword support
    for (const keyword of HEBREW_KEYWORDS.strong) {
      if (content.includes(keyword)) {
        score += 0.3;
      }
    }
    
    for (const keyword of HEBREW_KEYWORDS.medium) {
      if (content.includes(keyword)) {
        score += 0.2;
      }
    }
    
    for (const keyword of HEBREW_KEYWORDS.weak) {
      if (content.includes(keyword)) {
        score += 0.1;
      }
    }
    
    // Content length bonus (meaningful analysis should be longer)
    if (content.length > 200) {
      score += 0.1;
    }
    if (content.length > 400) {
      score += 0.1;
    }
    
    // Symbol count scoring (favor fewer symbols for focused analysis)
    if (symbolCount === 1) {
      score += 0.2;
    } else if (symbolCount <= 3) {
      score += 0.1;
    } else if (symbolCount <= 5) {
      // Neutral - no bonus or penalty
    } else {
      // Penalty for many symbols (likely lists or unfocused content)
      score -= (symbolCount - 5) * 0.05;
    }
    
    return Math.max(0, Math.min(score, 1.0));
  }

  private isSymbolList(content: string): boolean {
    // Detect common list patterns - same logic as AnalysisLinker
    const listPatterns = [
      /[A-Z]{1,5}\s*\/\s*[A-Z]{1,5}/, // "AAPL / TSLA"
      /[A-Z]{1,5}\s*,\s*[A-Z]{1,5}/, // "AAPL, TSLA"
      /[A-Z]{1,5}\s*\|\s*[A-Z]{1,5}/, // "AAPL | TSLA"
    ];
    
    for (const pattern of listPatterns) {
      const matches = content.match(new RegExp(pattern.source, 'g'));
      if (matches && matches.length >= 3) { // Need at least 3 separator instances
        const totalLength = content.length;
        const symbolMatches = content.match(/\b[A-Z]{1,5}\b/g) || [];
        
        // Check if we have many symbols with separators
        if (symbolMatches.length >= 5) {
          // Check if symbols make up a large portion of the content
          const symbolChars = symbolMatches.join('').length;
          const separatorChars = matches.length * 3; // Approximate separator chars
          const symbolAndSeparatorChars = symbolChars + separatorChars;
          const ratio = symbolAndSeparatorChars / totalLength;
          
          if (ratio > 0.3) { // More than 30% of content is symbols and separators
            return true;
          }
        }
      }
    }
    
    // Additional check: look for sequences of symbols with minimal text
    const symbolMatches = content.match(/\b[A-Z]{1,5}\b/g) || [];
    if (symbolMatches.length >= 6) {
      const words = content.trim().split(/\s+/).filter(word => 
        word.length > 0 && !/^[A-Z]{1,5}$/.test(word) && !/^[\/,\|]$/.test(word)
      );
      const nonSymbolWords = words.length;
      const wordsPerSymbol = nonSymbolWords / symbolMatches.length;
      
      // If there are very few non-symbol words per symbol, likely a list
      if (wordsPerSymbol < 1.5) {
        return true;
      }
    }
    
    return false;
  }

  private calculateSymbolDensityPenalty(content: string, symbolCount: number): number {
    if (symbolCount <= 3) return 0; // No penalty for small symbol counts
    
    const words = content.trim().split(/\s+/);
    const totalWords = words.length;
    const wordsPerSymbol = totalWords / symbolCount;
    
    // Heavy penalty for high symbol density (many symbols, few words)
    if (wordsPerSymbol < 2) {
      return 0.4; // Heavy penalty
    } else if (wordsPerSymbol < 3) {
      return 0.2; // Medium penalty  
    } else if (wordsPerSymbol < 5) {
      return 0.1; // Light penalty
    }
    
    return 0; // No penalty for good word-to-symbol ratio
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