import { Message } from 'discord.js';
import { AnalysisData as LegacyAnalysisData } from '../types';
import { DatabaseService, AnalysisData, User } from './DatabaseService';
import { SymbolDetector } from './SymbolDetector';
import { UrlExtractor } from './UrlExtractor';
import { Logger } from '../utils/Logger';

export class DatabaseAnalysisLinker {
  private databaseService: DatabaseService;
  private symbolDetector: SymbolDetector;
  private urlExtractor: UrlExtractor;
  private albertUser: User | null = null;
  private readonly MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
    this.symbolDetector = new SymbolDetector();
    this.urlExtractor = new UrlExtractor();
  }

  async initialize(): Promise<void> {
    // Ensure Albert exists as a user
    this.albertUser = await this.databaseService.getUserByDiscordId(
      process.env.ALBERT_DISCORD_ID || 'albert_default'
    );
    
    if (!this.albertUser) {
      this.albertUser = await this.databaseService.addUser(
        process.env.ALBERT_DISCORD_ID || 'albert_default',
        'Albert'
      );
      Logger.info(`Created Albert user: ${this.albertUser.username}`);
    }

    Logger.info(`DatabaseAnalysisLinker initialized with user: ${this.albertUser.username}`);
  }

  public async indexMessage(message: Message): Promise<void> {
    if (message.author.bot) return;
    if (!this.albertUser) {
      Logger.warn('Albert user not initialized, skipping message indexing');
      return;
    }

    const firstLine = message.content.split('\n')[0] || '';
    const symbols = this.symbolDetector.detectSymbols(firstLine);
    if (symbols.length === 0) {
      return;
    }

    const messageUrl = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
    const extractedUrls = this.urlExtractor.extractUrlsFromMessage(message);
    
    Logger.analysis(`Indexing message ${message.id}: symbols=${symbols.map(s => s.symbol).join(', ')}, charts=${extractedUrls.chartUrls.length}, attachments=${extractedUrls.attachmentUrls.length}`);
    
    const confidence = this.calculateRelevanceScore(message.content, symbols.length);
    
    for (const symbolData of symbols) {
      try {
        const analysisData: AnalysisData = {
          messageUrl,
          content: message.content.substring(0, 1000), // Limit content to 1000 chars
          confidence,
          timestamp: message.createdAt
        };

        await this.databaseService.updateLatestAnalysis(
          symbolData.symbol, 
          this.albertUser.id, 
          analysisData
        );

        Logger.debug(`Updated analysis for ${symbolData.symbol}`);
      } catch (error) {
        Logger.error(`Failed to update analysis for ${symbolData.symbol}:`, error);
      }
    }

    const symbolStrings = symbols.map(s => s.symbol);
    Logger.info(`Indexed analysis for symbols: ${symbolStrings.join(', ')} from ${message.member?.nickname || message.author.tag}`);
  }

  public async getLatestAnalysis(symbol: string, limit: number = 3): Promise<LegacyAnalysisData[]> {
    if (!this.albertUser) {
      Logger.warn('Albert user not initialized');
      return [];
    }

    try {
      const historyData = await this.databaseService.getAnalysisHistory(symbol, this.albertUser.id);
      
      // Convert database format to legacy format
      return historyData.slice(0, limit).map(data => ({
        messageId: this.extractMessageIdFromUrl(data.messageUrl),
        channelId: this.extractChannelIdFromUrl(data.messageUrl),
        authorId: this.albertUser!.discord_id,
        content: data.content,
        symbols: [symbol],
        timestamp: data.timestamp,
        relevanceScore: data.confidence,
        messageUrl: data.messageUrl,
        chartUrls: [],
        attachmentUrls: [],
        hasCharts: false
      }));
    } catch (error) {
      Logger.error(`Failed to get analysis for ${symbol}:`, error);
      return [];
    }
  }

  public async getAllRelevantAnalysis(symbols: string[]): Promise<Map<string, LegacyAnalysisData[]>> {
    const results = new Map<string, LegacyAnalysisData[]>();
    
    for (const symbol of symbols) {
      const analyses = await this.getLatestAnalysis(symbol);
      if (analyses.length > 0) {
        results.set(symbol, analyses);
      }
    }
    
    return results;
  }

  public async getLatestAnalysisUrl(symbol: string): Promise<string | null> {
    if (!this.albertUser) return null;

    try {
      const latest = await this.databaseService.getLatestAnalysis(symbol, this.albertUser.id);
      return latest?.messageUrl || null;
    } catch (error) {
      Logger.error(`Failed to get latest analysis URL for ${symbol}:`, error);
      return null;
    }
  }

  public async hasAnalysisFor(symbol: string): Promise<boolean> {
    if (!this.albertUser) return false;

    try {
      const latest = await this.databaseService.getLatestAnalysis(symbol, this.albertUser.id);
      if (!latest) return false;

      const age = Date.now() - latest.timestamp.getTime();
      return age <= this.MAX_CACHE_AGE_MS;
    } catch (error) {
      Logger.error(`Failed to check analysis for ${symbol}:`, error);
      return false;
    }
  }

  public async getAvailableSymbols(): Promise<string[]> {
    if (!this.albertUser) return [];

    try {
      const analysts = await this.databaseService.getAnalysts();
      const allSymbols = new Set<string>();

      // Get symbols from all analysts (for now just Albert)
      for (const analyst of analysts) {
        const count = await this.databaseService.getUserAnalysisCount(analyst.id);
        if (count > 0) {
          // This is a simplified approach - we'd need a new query to get actual symbols
          // For now, we'll return empty array and implement this properly later
        }
      }

      return Array.from(allSymbols).sort();
    } catch (error) {
      Logger.error('Failed to get available symbols:', error);
      return [];
    }
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

  private extractMessageIdFromUrl(url: string): string {
    const parts = url.split('/');
    return parts[parts.length - 1] || '';
  }

  private extractChannelIdFromUrl(url: string): string {
    const parts = url.split('/');
    return parts[parts.length - 2] || '';
  }

  public async getCacheStats(): Promise<{ totalSymbols: number; totalAnalyses: number }> {
    if (!this.albertUser) {
      return { totalSymbols: 0, totalAnalyses: 0 };
    }

    try {
      const analysisCount = await this.databaseService.getUserAnalysisCount(this.albertUser.id);
      return {
        totalSymbols: analysisCount, // In database, each symbol has one latest entry
        totalAnalyses: analysisCount
      };
    } catch (error) {
      Logger.error('Failed to get cache stats:', error);
      return { totalSymbols: 0, totalAnalyses: 0 };
    }
  }

  public async getTrackedSymbolsCount(): Promise<number> {
    if (!this.albertUser) return 0;

    try {
      return await this.databaseService.getUserAnalysisCount(this.albertUser.id);
    } catch (error) {
      Logger.error('Failed to get tracked symbols count:', error);
      return 0;
    }
  }

  // Multi-user methods for future expansion
  public async getAnalysisForUser(symbol: string, userId: number): Promise<AnalysisData | null> {
    try {
      return await this.databaseService.getLatestAnalysis(symbol, userId);
    } catch (error) {
      Logger.error(`Failed to get analysis for user ${userId}, symbol ${symbol}:`, error);
      return null;
    }
  }

  public async getAllAnalystsForSymbol(symbol: string): Promise<{user: User, analysis: AnalysisData}[]> {
    try {
      return await this.databaseService.getAllAnalystsForSymbol(symbol);
    } catch (error) {
      Logger.error(`Failed to get all analysts for symbol ${symbol}:`, error);
      return [];
    }
  }
}