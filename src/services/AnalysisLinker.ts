import { Message } from 'discord.js';
import { AnalysisData } from '../types';
import { SymbolDetector } from './SymbolDetector';
import { UrlExtractor } from './UrlExtractor';
import { Logger } from '../utils/Logger';
import { DiscordUrlGenerator } from '../utils/DiscordUrlGenerator';
import { HEBREW_KEYWORDS } from '../config';

export class AnalysisLinker {
  private analysisCache: Map<string, AnalysisData[]> = new Map();
  private latestAnalysisMap: Map<string, AnalysisData> = new Map();
  private symbolDetector: SymbolDetector;
  private urlExtractor: UrlExtractor;
  private readonly MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  constructor() {
    this.symbolDetector = new SymbolDetector();
    this.urlExtractor = new UrlExtractor();
    this.startCacheCleanup();
  }

  public initializeFromHistoricalData(historicalMap: Map<string, AnalysisData>): void {
    Logger.info(`Loading ${historicalMap.size} historical analysis entries...`);
    
    this.analysisCache.clear();
    this.latestAnalysisMap.clear();
    
    for (const [symbol, analysisData] of historicalMap) {
      Logger.debug(`Loading symbol: ${symbol}, attachments=${analysisData.attachmentUrls?.length || 0}, charts=${analysisData.chartUrls?.length || 0}`);
      
      // Add to latest analysis map
      this.latestAnalysisMap.set(symbol, analysisData);
      
      // Also add to the regular cache for getLatestAnalysis method
      const existingCache = this.analysisCache.get(symbol) || [];
      existingCache.push(analysisData);
      existingCache.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      this.analysisCache.set(symbol, existingCache.slice(0, 20)); // Keep max 20 per symbol
    }
    
    const symbols = Array.from(historicalMap.keys()).sort();
    Logger.info(`Historical data loaded for: ${symbols.join(', ')}`);
  }

  public async indexMessage(message: Message): Promise<void> {
    if (message.author.bot) return;

    // Thread filtering now handled at bot.js level before calling this method

    const firstLine = message.content.split('\n')[0] || '';
    const symbols = this.symbolDetector.detectSymbols(firstLine);
    if (symbols.length === 0) {
      return;
    }

    const messageUrl = DiscordUrlGenerator.generateMessageUrl(message.guildId!, message);
    const extractedUrls = this.urlExtractor.extractUrlsFromMessage(message);
    
    Logger.analysis(`Indexing message ${message.id}: symbols=${symbols.map(s => s.symbol).join(', ')}, charts=${extractedUrls.chartUrls.length}, attachments=${extractedUrls.attachmentUrls.length}`);
    
    const symbolStrings = symbols.map(s => s.symbol);
    let relevanceScore = this.calculateRelevanceScore(message.content, symbols.length);
    
    const isReply = message.reference !== null && message.reference !== undefined;
    if (isReply) {
      relevanceScore += 0.2;
      Logger.debug(`Message ${message.id} is a reply - boosting relevance score by 0.2`);
    }
    
    // Enhanced logging for debugging indexing decisions
    Logger.debug(`Message ${message.id} analysis: symbols=${symbols.length}, score=${relevanceScore.toFixed(3)}, length=${message.content.length}, isReply=${isReply}, content="${message.content.slice(0, 80)}..."`);
    
    // Skip messages with low relevance (likely ticker-only messages)
    const MIN_RELEVANCE_THRESHOLD = 0.7;
    if (relevanceScore < MIN_RELEVANCE_THRESHOLD) {
      Logger.debug(`❌ Rejected message ${message.id}: relevance score ${relevanceScore.toFixed(3)} below threshold ${MIN_RELEVANCE_THRESHOLD}`);
      return;
    }
    
    const analysisData: AnalysisData = {
      messageId: message.id,
      channelId: message.channel.id,
      authorId: message.author.id,
      content: message.content,
      symbols: symbolStrings,
      timestamp: message.createdAt,
      relevanceScore: relevanceScore,
      messageUrl,
      chartUrls: extractedUrls.chartUrls,
      attachmentUrls: extractedUrls.attachmentUrls,
      hasCharts: extractedUrls.hasCharts
    };

    for (const symbol of symbolStrings) {
      Logger.debug(`Indexing symbol ${symbol} from message ${message.id} (${messageUrl})`);
      Logger.debug(`Message ${message.id} channel info: channelId=${message.channelId}, channel constructor=${message.channel?.constructor?.name}`);
      Logger.debug(`Message ${message.id} timestamp: ${message.createdAt}, content preview: "${message.content.substring(0, 50)}..."`);
      
      // Check if this message appears to be in a thread context
      if (message.channel && 'parentId' in message.channel && message.channel.parentId) {
        Logger.warn(`⚠️ POTENTIAL ISSUE: Indexing symbol ${symbol} from message ${message.id} that appears to be in thread (parentId: ${message.channel.parentId})`);
      }
      
      // Check if we already have analysis for this symbol and compare timestamps
      const existing = this.latestAnalysisMap.get(symbol);
      if (existing) {
        Logger.debug(`Symbol ${symbol} already has analysis: existing=${existing.messageId} (${existing.timestamp}), new=${message.id} (${message.createdAt})`);
        if (message.createdAt > existing.timestamp) {
          Logger.debug(`NEW message ${message.id} is newer - will replace existing ${existing.messageId} for ${symbol}`);
        } else {
          Logger.debug(`EXISTING message ${existing.messageId} is newer - will keep existing for ${symbol}`);
        }
      } else {
        Logger.debug(`Symbol ${symbol} has no existing analysis - storing message ${message.id}`);
      }
      
      this.addToCache(symbol, analysisData);
      this.latestAnalysisMap.set(symbol, analysisData);
    }

    Logger.info(`Indexed analysis for symbols: ${symbolStrings.join(', ')} from ${message.member?.displayName || message.author.tag || message.author.id}`);
  }

  public async getLatestAnalysis(symbol: string, limit: number = 3): Promise<AnalysisData[]> {
    const analyses = this.analysisCache.get(symbol) || [];
    
    return analyses
      .filter(analysis => this.isRecentEnough(analysis.timestamp))
      .sort((a, b) => {
        const scoreA = this.getTimeRelevanceScore(a.timestamp) + a.relevanceScore;
        const scoreB = this.getTimeRelevanceScore(b.timestamp) + b.relevanceScore;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  public async getAllRelevantAnalysis(symbols: string[]): Promise<Map<string, AnalysisData[]>> {
    const results = new Map<string, AnalysisData[]>();
    
    for (const symbol of symbols) {
      const analyses = await this.getLatestAnalysis(symbol);
      if (analyses.length > 0) {
        results.set(symbol, analyses);
      }
    }
    
    return results;
  }

  public getLatestAnalysisUrl(symbol: string): string | null {
    const latestAnalysis = this.latestAnalysisMap.get(symbol);
    return latestAnalysis?.messageUrl || null;
  }

  public hasAnalysisFor(symbol: string): boolean {
    const analysis = this.latestAnalysisMap.get(symbol);
    return analysis ? this.isRecentEnough(analysis.timestamp) : false;
  }

  public getAvailableSymbols(): string[] {
    const availableSymbols: string[] = [];
    for (const [symbol, analysis] of this.latestAnalysisMap.entries()) {
      if (this.isRecentEnough(analysis.timestamp)) {
        availableSymbols.push(symbol);
      }
    }
    return availableSymbols.sort();
  }

  private addToCache(symbol: string, analysis: AnalysisData): void {
    const existing = this.analysisCache.get(symbol) || [];
    existing.push(analysis);
    
    existing.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    const maxPerSymbol = 20;
    if (existing.length > maxPerSymbol) {
      existing.splice(maxPerSymbol);
    }
    
    this.analysisCache.set(symbol, existing);
  }

  private calculateRelevanceScore(content: string, symbolCount: number): number {
    let score = 0.3; // Lower base score to require actual analysis content
    
    const lowerContent = content.toLowerCase();
    
    // Check for symbol list patterns (major penalty)
    if (this.isSymbolList(content)) {
      Logger.debug(`📋 Symbol list pattern detected: "${content.slice(0, 100)}..."`);
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
    // Detect common list patterns
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
    
    // Calculate words per symbol ratio
    const words = content.trim().split(/\s+/).filter(word => word.length > 0);
    const wordsPerSymbol = words.length / symbolCount;
    
    // Penalize if there are very few words per symbol (indicates list-like content)
    if (wordsPerSymbol < 3) {
      return 0.3; // Heavy penalty for very dense symbol content
    } else if (wordsPerSymbol < 5) {
      return 0.1; // Light penalty for somewhat dense content
    }
    
    return 0; // No penalty for well-balanced content
  }

  private isRecentEnough(timestamp: Date): boolean {
    const age = Date.now() - timestamp.getTime();
    return age <= this.MAX_CACHE_AGE_MS;
  }

  private getTimeRelevanceScore(timestamp: Date): number {
    const ageInHours = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60);
    
    if (ageInHours <= 1) return 1.0;
    if (ageInHours <= 6) return 0.8;
    if (ageInHours <= 24) return 0.6;
    if (ageInHours <= 72) return 0.4;
    return 0.2;
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredAnalysis();
    }, 60 * 60 * 1000);
  }

  private cleanupExpiredAnalysis(): void {
    let totalRemoved = 0;
    
    // Clean up analysis cache
    for (const [symbol, analyses] of this.analysisCache.entries()) {
      const initialLength = analyses.length;
      const filtered = analyses.filter(analysis => this.isRecentEnough(analysis.timestamp));
      
      if (filtered.length === 0) {
        this.analysisCache.delete(symbol);
        totalRemoved += initialLength;
      } else if (filtered.length !== initialLength) {
        this.analysisCache.set(symbol, filtered);
        totalRemoved += (initialLength - filtered.length);
      }
    }
    
    // Clean up latest analysis map
    for (const [symbol, analysis] of this.latestAnalysisMap.entries()) {
      if (!this.isRecentEnough(analysis.timestamp)) {
        this.latestAnalysisMap.delete(symbol);
      }
    }
    
    if (totalRemoved > 0) {
      Logger.info(`Cleaned up ${totalRemoved} expired analysis entries`);
    }
  }

  public getCacheStats(): { totalSymbols: number; totalAnalyses: number } {
    let totalAnalyses = 0;
    for (const analyses of this.analysisCache.values()) {
      totalAnalyses += analyses.length;
    }
    
    return {
      totalSymbols: this.analysisCache.size,
      totalAnalyses
    };
  }

  public getTrackedSymbolsCount(): number {
    return this.latestAnalysisMap.size;
  }
}