import { Message } from 'discord.js';
import { AnalysisData } from '../types';
import { SymbolDetector } from './SymbolDetector';

export class AnalysisLinker {
  private analysisCache: Map<string, AnalysisData[]> = new Map();
  private latestAnalysisMap: Map<string, AnalysisData> = new Map();
  private symbolDetector: SymbolDetector;
  private readonly MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  constructor() {
    this.symbolDetector = new SymbolDetector();
    this.startCacheCleanup();
  }

  public initializeFromHistoricalData(historicalMap: Map<string, AnalysisData>): void {
    console.log(`📊 Loading ${historicalMap.size} historical analysis entries...`);
    
    // Clear existing data
    this.analysisCache.clear();
    this.latestAnalysisMap.clear();
    
    // Load historical data
    for (const [symbol, analysisData] of historicalMap) {
      // Add to latest analysis map
      this.latestAnalysisMap.set(symbol, analysisData);
      
      // Also add to the regular cache for getLatestAnalysis method
      const existingCache = this.analysisCache.get(symbol) || [];
      existingCache.push(analysisData);
      existingCache.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      this.analysisCache.set(symbol, existingCache.slice(0, 20)); // Keep max 20 per symbol
    }
    
    const symbols = Array.from(historicalMap.keys()).sort();
    console.log(`✅ Historical data loaded for: ${symbols.join(', ')}`);
  }

  public async indexMessage(message: Message): Promise<void> {
    if (message.author.bot) return;

    // Extract symbol from first line of message
    const firstLine = message.content.split('\n')[0] || '';
    const symbols = this.symbolDetector.detectSymbols(firstLine);
    if (symbols.length === 0) return;

    // Create message URL
    const messageUrl = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
    
    const symbolStrings = symbols.map(s => s.symbol);
    const analysisData: AnalysisData = {
      messageId: message.id,
      channelId: message.channel.id,
      authorId: message.author.id,
      content: message.content,
      symbols: symbolStrings,
      timestamp: message.createdAt,
      relevanceScore: this.calculateRelevanceScore(message.content, symbols.length),
      messageUrl
    };

    for (const symbol of symbolStrings) {
      this.addToCache(symbol, analysisData);
      // Store as latest analysis for this symbol
      this.latestAnalysisMap.set(symbol, analysisData);
    }

    console.log(`📈 Indexed analysis for symbols: ${symbolStrings.join(', ')} from ${message.member?.nickname || message.author.tag}`);
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
      console.log(`🧹 Cleaned up ${totalRemoved} expired analysis entries`);
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
}