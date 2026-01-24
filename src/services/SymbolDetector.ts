import { StockSymbol } from '../types';
import { SYMBOL_PATTERN, COMMON_WORDS, HEBREW_KEYWORDS } from '../config';
import { Logger } from '../utils/Logger';
import { TopPicksParser, TopPicksResult } from './TopPicksParser';
import { SymbolAllowlist } from './SymbolAllowlist';
import { TechnicalContextDetector } from './TechnicalContextDetector';
import { Client, TextChannel } from 'discord.js';

export class SymbolDetector {
  private topPicksParser: TopPicksParser;
  private symbolAllowlist: SymbolAllowlist;
  private technicalDetector: TechnicalContextDetector;
  private client: Client | undefined;
  private analysisChannels: string[] = [];
  private discussionChannels: string[] = [];

  constructor(client?: Client, analysisChannels?: string[], discussionChannels?: string[], symbolAllowlist?: SymbolAllowlist) {
    this.topPicksParser = new TopPicksParser();
    this.symbolAllowlist = symbolAllowlist || new SymbolAllowlist();
    this.technicalDetector = new TechnicalContextDetector();
    this.client = client;
    this.analysisChannels = analysisChannels || [];
    this.discussionChannels = discussionChannels || [];
  }

  public detectSymbolsFromTopPicks(content: string): StockSymbol[] {
    // Parse top picks section for general notices channel
    const topPicks = this.topPicksParser.parseTopPicks(content);
    
    const symbols: StockSymbol[] = [];
    
    // Add all top picks directly to symbols array with high confidence
    for (const symbol of topPicks.longPicks) {
      symbols.push({ symbol, confidence: 1.0, position: 0, priority: 'top_long' });
    }
    
    for (const symbol of topPicks.shortPicks) {
      symbols.push({ symbol, confidence: 1.0, position: 0, priority: 'top_short' });
    }

    const finalSymbols = this.deduplicateAndSort(symbols);
    
    const priorityStats = this.getPriorityStats(finalSymbols);
    Logger.debug(`Detected top picks: ${finalSymbols.map(s => s.symbol).join(', ')}`);
    Logger.debug(`Priority breakdown: ${priorityStats.top_long} long, ${priorityStats.top_short} short`);
    
    return finalSymbols;
  }

  public detectSymbolsFromAnalysis(content: string): StockSymbol[] {
    // Synchronous version for backward compatibility
    Logger.debug(`Starting three-pass symbol detection for content: "${content.substring(0, 100)}..."`);
    
    // Pass 1: Standard detection
    const symbols: StockSymbol[] = [];
    const matches = content.matchAll(SYMBOL_PATTERN);
    const rejectedSingleLetters: { symbol: string, position: number }[] = [];
    
    for (const match of matches) {
      // Handle two capture groups: [1] for $/#-prefixed symbols, [2] for regular symbols
      const symbol = match[1] || match[2];
      if (!symbol) continue;
      
      const position = match.index!;
      
      if (this.isValidSymbol(symbol)) {
        const confidence = this.calculateConfidence(symbol, content, position);
        // Include symbols with reasonable confidence, or allowlist symbols with decent confidence
        // But reject allowlist symbols if they're clearly in wrong context (very low confidence)
        if (confidence >= 0.3 || (this.symbolAllowlist.isSymbolAllowed(symbol) && confidence >= 0.2)) {
          symbols.push({ symbol, confidence, position, priority: 'regular' });
        } else {
          Logger.debug(`Symbol "${symbol}" rejected due to low confidence: ${confidence.toFixed(3)}`);
        }
      } else if (symbol.length === 1 && /^[A-Z]$/.test(symbol)) {
        // Collect rejected single letters for further analysis
        rejectedSingleLetters.push({ symbol, position });
      }
    }

    Logger.debug(`Pass 1 complete: Found ${symbols.length} valid symbols, ${rejectedSingleLetters.length} rejected single letters`);

    // Pass 2: Context-aware recovery for lists AND strong patterns
    if (symbols.length >= 2) {
      Logger.debug(`Pass 2: Context trust enabled - checking ${rejectedSingleLetters.length} rejected single letters`);
      for (const rejected of rejectedSingleLetters) {
        if (this.hasStrongSingleLetterContext(rejected.symbol, content, rejected.position)) {
          const confidence = this.calculateConfidence(rejected.symbol, content, rejected.position);
          symbols.push({ 
            symbol: rejected.symbol, 
            confidence: confidence + 0.2, // Context trust bonus
            position: rejected.position, 
            priority: 'regular' 
          });
          Logger.debug(`Pass 2: Added single letter "${rejected.symbol}" via context trust`);
        }
      }
    } else if (rejectedSingleLetters.length > 0) {
      Logger.debug(`Pass 2: Strong pattern check - checking ${rejectedSingleLetters.length} rejected single letters`);
      for (const rejected of rejectedSingleLetters) {
        if (this.hasStrongSingleLetterContext(rejected.symbol, content, rejected.position)) {
          const beforeChar = rejected.position > 0 ? content[rejected.position - 1] || ' ' : ' ';
          const symbolStart = Math.max(0, rejected.position - 1);
          const symbolText = content.slice(symbolStart, rejected.position + rejected.symbol.length + 1);
          
          // Check if it's a strong prefix pattern ($ or #)
          const hasStrongPrefix = beforeChar === '$' || beforeChar === '#' || symbolText.includes('$' + rejected.symbol) || symbolText.includes('#' + rejected.symbol);
          
          if (hasStrongPrefix) {
            const confidence = this.calculateConfidence(rejected.symbol, content, rejected.position);
            symbols.push({ 
              symbol: rejected.symbol, 
              confidence: confidence + 0.1, // Strong pattern bonus
              position: rejected.position, 
              priority: 'regular' 
            });
            Logger.debug(`Pass 2: Added single letter "${rejected.symbol}" via strong prefix pattern`);
          } else {
            // For list context, we need at least 1 valid symbol for trust
            if (symbols.length >= 1) {
              const confidence = this.calculateConfidence(rejected.symbol, content, rejected.position);
              symbols.push({ 
                symbol: rejected.symbol, 
                confidence: confidence + 0.15, // List context bonus
                position: rejected.position, 
                priority: 'regular' 
              });
              Logger.debug(`Pass 2: Added single letter "${rejected.symbol}" via list context with 1+ symbols`);
            }
          }
        }
      }
    }

    const finalSymbols = this.deduplicateAndSort(symbols);
    Logger.debug(`Final detection result: ${finalSymbols.map(s => s.symbol).join(', ')}`);
    
    return finalSymbols;
  }

  public async detectSymbolsWithContext(content: string, isTopPicks: boolean = false): Promise<StockSymbol[]> {
    Logger.debug(`Starting three-pass symbol detection for content: "${content.substring(0, 100)}..."`);
    
    // Pass 1: Standard detection
    const symbols: StockSymbol[] = [];
    const matches = content.matchAll(SYMBOL_PATTERN);
    const rejectedSingleLetters: { symbol: string, position: number }[] = [];
    
    for (const match of matches) {
      // Handle two capture groups: [1] for $/#-prefixed symbols, [2] for regular symbols
      const symbol = match[1] || match[2];
      if (!symbol) continue;
      
      const position = match.index!;
      
      if (this.isValidSymbol(symbol)) {
        const confidence = this.calculateConfidence(symbol, content, position);
        // Include symbols with reasonable confidence, or allowlist symbols with decent confidence
        // But reject allowlist symbols if they're clearly in wrong context (very low confidence)
        if (confidence >= 0.3 || (this.symbolAllowlist.isSymbolAllowed(symbol) && confidence >= 0.2)) {
          symbols.push({ symbol, confidence, position, priority: 'regular' });
        } else {
          Logger.debug(`Symbol "${symbol}" rejected due to low confidence: ${confidence.toFixed(3)}`);
        }
      } else if (symbol.length === 1 && /^[A-Z]$/.test(symbol)) {
        // Collect rejected single letters for further analysis
        rejectedSingleLetters.push({ symbol, position });
      }
    }

    Logger.debug(`Pass 1 complete: Found ${symbols.length} valid symbols, ${rejectedSingleLetters.length} rejected single letters`);

    // Pass 2: Context-aware recovery for lists and top picks
    if (symbols.length >= 2 || isTopPicks) {
      Logger.debug('Pass 2: Enabling context trust for single letters');
      for (const rejected of rejectedSingleLetters) {
        if (this.hasStrongSingleLetterContext(rejected.symbol, content, rejected.position)) {
          const confidence = this.calculateConfidence(rejected.symbol, content, rejected.position);
          symbols.push({ 
            symbol: rejected.symbol, 
            confidence: confidence + 0.2, // Bonus for context trust
            position: rejected.position, 
            priority: 'regular' 
          });
          Logger.debug(`Pass 2: Added single letter "${rejected.symbol}" via context trust`);
        }
      }
    }

    // Pass 3: Historical validation for strong patterns (async)
    if (this.client && rejectedSingleLetters.length > 0) {
      const historicalResults = await this.validateSingleLettersInHistory(rejectedSingleLetters, content);
      symbols.push(...historicalResults);
    }

    const finalSymbols = this.deduplicateAndSort(symbols);
    Logger.debug(`Final detection result: ${finalSymbols.map(s => s.symbol).join(', ')}`);
    
    return finalSymbols;
  }

  // Deprecated: Use detectSymbolsFromTopPicks or detectSymbolsFromAnalysis instead
  public detectSymbols(content: string): StockSymbol[] {
    // For backward compatibility, default to analysis detection
    return this.detectSymbolsFromAnalysis(content);
  }

  private isValidSymbol(symbol: string): boolean {
    // Basic format validation
    if (symbol.length < 1 || symbol.length > 5) {
      return false;
    }

    if (!/^[A-Z]+$/.test(symbol)) {
      return false;
    }

    // If symbol is in allowlist, it's automatically valid regardless of COMMON_WORDS
    if (this.symbolAllowlist.isSymbolAllowed(symbol)) {
      return true;
    }

    // Check against old COMMON_WORDS for backward compatibility with obvious non-symbols
    // But exclude symbols that could be legitimate stocks (now handled by allowlist)
    const filteredCommonWords = new Set([...COMMON_WORDS]);
    // Remove potentially legitimate stock symbols from exclusion
    // SPY, QQQ, TLT are popular ETFs frequently used in trading analysis
    ['WH', 'AU', 'IWM', 'SPY', 'QQQ', 'TLT', 'VIX', 'GDX', 'DXY'].forEach(symbol => filteredCommonWords.delete(symbol));
    
    if (filteredCommonWords.has(symbol)) {
      return false;
    }

    // For single letters, only allow A and I by default (context will handle others)
    const singleLetterWords = ['A', 'I'];
    if (symbol.length === 1 && !singleLetterWords.includes(symbol)) {
      return false;
    }

    return true;
  }

  private calculateConfidence(symbol: string, content: string, position: number): number {
    let confidence = 0.5;

    // Check if symbol is in allowlist (major confidence boost)
    if (this.symbolAllowlist.isSymbolAllowed(symbol)) {
      confidence += 0.4;
      Logger.debug(`Symbol "${symbol}" gets allowlist bonus`);
    }

    // Check for technical context penalty - but only if symbol is not strongly indicated
    const technicalPenalty = this.technicalDetector.getTechnicalConfusionPenalty(symbol, content, position);
    
    // If we have strong symbol indicators (like $ prefix), ignore technical penalty
    const hasStrongIndicators = this.technicalDetector.hasStrongSymbolIndicators(symbol, content, position);
    if (!hasStrongIndicators) {
      confidence -= technicalPenalty;
      if (technicalPenalty > 0) {
        Logger.debug(`Symbol "${symbol}" gets technical context penalty: ${technicalPenalty}`);
      }
    } else if (technicalPenalty > 0) {
      Logger.debug(`Symbol "${symbol}" technical penalty ignored due to strong indicators`);
    }

    // Check for $ or # prefix (may be captured in the symbol match or before the position)
    const beforeChar = position > 0 ? content[position - 1] || ' ' : ' ';
    const symbolStart = Math.max(0, position - 1);
    const symbolText = content.slice(symbolStart, position + symbol.length + 1);
    
    if (beforeChar === '$' || symbolText.includes('$' + symbol)) {
      confidence += 0.4;
      Logger.debug(`Symbol "${symbol}" gets $ prefix bonus`);
    }

    if (beforeChar === '#' || symbolText.includes('#' + symbol)) {
      confidence += 0.3;
      Logger.debug(`Symbol "${symbol}" gets # prefix bonus`);
    }

    const lowerContent = content.toLowerCase();
    
    // English stock keywords
    const englishKeywords = ['stock', 'ticker', 'symbol', 'shares', 'equity', 'trade', 'buy', 'sell', 'analysis', 'chart', 'price', 'target'];
    const englishKeywordBonus = englishKeywords.some(keyword => lowerContent.includes(keyword)) ? 0.2 : 0;
    confidence += englishKeywordBonus;

    // Hebrew keywords - check all categories
    const hebrewStrongBonus = HEBREW_KEYWORDS.strong.some(keyword => content.includes(keyword)) ? 0.3 : 0;
    const hebrewMediumBonus = HEBREW_KEYWORDS.medium.some(keyword => content.includes(keyword)) ? 0.2 : 0;
    const hebrewWeakBonus = HEBREW_KEYWORDS.weak.some(keyword => content.includes(keyword)) ? 0.1 : 0;
    
    const hebrewBonus = Math.max(hebrewStrongBonus, hebrewMediumBonus, hebrewWeakBonus);
    confidence += hebrewBonus;
    
    if (hebrewBonus > 0) {
      Logger.debug(`Symbol "${symbol}" gets Hebrew keyword bonus: ${hebrewBonus}`);
    }

    if (symbol.length >= 2 && symbol.length <= 4) {
      confidence += 0.1;
    }

    const afterChar = position + symbol.length < content.length ? content[position + symbol.length] || ' ' : ' ';
    if (/\s/.test(beforeChar) && /\s/.test(afterChar)) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  private determineSymbolPriority(symbol: string, topPicks: TopPicksResult): 'top_long' | 'top_short' | 'regular' {
    if (topPicks.longPicks.includes(symbol)) {
      return 'top_long';
    }
    if (topPicks.shortPicks.includes(symbol)) {
      return 'top_short';
    }
    return 'regular';
  }

  private getPriorityStats(symbols: StockSymbol[]): { top_long: number; top_short: number; regular: number } {
    const stats = { top_long: 0, top_short: 0, regular: 0 };
    for (const symbol of symbols) {
      stats[symbol.priority]++;
    }
    return stats;
  }

  private deduplicateAndSort(symbols: StockSymbol[]): StockSymbol[] {
    const symbolMap = new Map<string, StockSymbol>();
    
    for (const symbol of symbols) {
      const existing = symbolMap.get(symbol.symbol);
      if (!existing || symbol.confidence > existing.confidence || 
          (symbol.confidence === existing.confidence && this.getPriorityOrder(symbol.priority) < this.getPriorityOrder(existing.priority))) {
        symbolMap.set(symbol.symbol, symbol);
      }
    }
    
    return Array.from(symbolMap.values())
      .sort((a, b) => {
        // Priority first: top_long > top_short > regular
        const priorityOrderA = this.getPriorityOrder(a.priority);
        const priorityOrderB = this.getPriorityOrder(b.priority);
        
        if (priorityOrderA !== priorityOrderB) {
          return priorityOrderA - priorityOrderB;
        }
        
        // Then by confidence
        return b.confidence - a.confidence;
      });
  }

  private getPriorityOrder(priority: 'top_long' | 'top_short' | 'regular'): number {
    switch (priority) {
      case 'top_long': return 0;
      case 'top_short': return 1;
      case 'regular': return 2;
    }
  }

  public isLikelyStockSymbol(symbol: string): boolean {
    return this.isValidSymbol(symbol);
  }

  private hasStrongSingleLetterContext(symbol: string, content: string, position: number): boolean {
    // Check for strong stock context indicators
    const symbolStart = Math.max(0, position - 1);
    const symbolText = content.slice(symbolStart, position + symbol.length + 1);
    const beforeChar = position > 0 ? content[position - 1] || ' ' : ' ';
    const afterChar = position + symbol.length < content.length ? content[position + symbol.length] || ' ' : ' ';

    // Strong prefix indicators - check both beforeChar and within symbolText for cases like $F
    if (beforeChar === '$' || beforeChar === '#' || symbolText.includes('$' + symbol) || symbolText.includes('#' + symbol)) {
      Logger.debug(`Single letter "${symbol}" has strong prefix indicator`);
      return true;
    }

    // Check if appears in a comma/slash separated list context
    // More flexible patterns to catch various list formats including emoji separators
    const listPatterns = [
      // Emoji-aware: multi-letter symbol, then non-letter chars, then our symbol
      new RegExp(`[A-Z]{2,5}[^A-Za-z]+${symbol}(?![A-Za-z])`, 'i'),
      // Emoji-aware: our symbol, then non-letter chars, then multi-letter symbol  
      new RegExp(`${symbol}[^A-Za-z]+[A-Z]{2,5}`, 'i'),
      // Traditional patterns for backup
      new RegExp(`[A-Z]{2,5}[\\s,/]+[A-Z]{2,5}[\\s,/]+${symbol}(?:[\\s,/]+[A-Z]{1,5})?`, 'i'),
      new RegExp(`${symbol}[\\s,/]+[A-Z]{2,5}[\\s,/]+[A-Z]{2,5}`, 'i'),
      new RegExp(`[A-Z]{2,5}[\\s,/]+${symbol}(?![A-Za-z])`, 'i'),
      new RegExp(`${symbol}[\\s,/]+[A-Z]{2,5}`, 'i'),
      // Single letter to single letter: F / C or C / F
      new RegExp(`[A-Z][\\s,/]+${symbol}(?![A-Za-z])`, 'i'),
      new RegExp(`${symbol}[\\s,/]+[A-Z](?![A-Za-z])`, 'i'),
      // Pattern for symbols at the end with non-letter characters
      new RegExp(`[A-Z]{2,5}[\\s,/]+${symbol}(?![A-Za-z0-9])`, 'i')
    ];
    
    if (listPatterns.some(pattern => pattern.test(content))) {
      Logger.debug(`Single letter "${symbol}" appears in list context`);
      return true;
    }

    // Check for explicit stock keywords nearby (both English and Hebrew)
    const surroundingText = content.slice(Math.max(0, position - 30), position + 30);
    const lowerSurrounding = surroundingText.toLowerCase();
    
    // English keywords
    const englishKeywords = ['target', 'breakout', 'analysis', 'stock', 'price', 'chart'];
    if (englishKeywords.some(keyword => lowerSurrounding.includes(keyword))) {
      Logger.debug(`Single letter "${symbol}" has English stock keywords in context`);
      return true;
    }

    // Hebrew keywords
    const hebrewKeywords = [...HEBREW_KEYWORDS.strong, ...HEBREW_KEYWORDS.medium];
    if (hebrewKeywords.some(keyword => surroundingText.includes(keyword))) {
      Logger.debug(`Single letter "${symbol}" has Hebrew stock keywords in context`);
      return true;
    }

    return false;
  }

  private async validateSingleLettersInHistory(
    rejectedLetters: { symbol: string, position: number }[], 
    originalContent: string
  ): Promise<StockSymbol[]> {
    if (!this.client || rejectedLetters.length === 0) {
      return [];
    }

    const validatedSymbols: StockSymbol[] = [];
    
    // Only validate single letters that have strong pattern indicators in current message
    const strongPatterns = rejectedLetters.filter(item => {
      const position = item.position;
      const beforeChar = position > 0 ? originalContent[position - 1] || ' ' : ' ';
      // Only check history for $X or #X patterns that were rejected
      return beforeChar === '$' || beforeChar === '#';
    });

    if (strongPatterns.length === 0) {
      Logger.debug('No strong single letter patterns found, skipping historical validation');
      return [];
    }

    Logger.debug(`Validating ${strongPatterns.length} strong single letter patterns in history`);

    try {
      // Check recent messages in analysis and discussion channels
      const channelsToCheck = [...this.analysisChannels, ...this.discussionChannels];
      
      for (const channelId of channelsToCheck) {
        try {
          const channel = await this.client.channels.fetch(channelId) as TextChannel;
          if (!channel?.isTextBased()) continue;

          // Fetch recent messages (last 50)
          const messages = await channel.messages.fetch({ limit: 50 });
          
          for (const strongPattern of strongPatterns) {
            const symbol = strongPattern.symbol;
            
            // Look for $SYMBOL or #SYMBOL patterns in recent messages
            const hasStrongPattern = messages.some(msg => {
              const content = msg.content;
              return content.includes(`$${symbol}`) || content.includes(`#${symbol}`);
            });

            if (hasStrongPattern) {
              const confidence = this.calculateConfidence(symbol, originalContent, strongPattern.position);
              validatedSymbols.push({
                symbol,
                confidence: confidence + 0.3, // Bonus for historical validation
                position: strongPattern.position,
                priority: 'regular'
              });
              Logger.debug(`Pass 3: Validated single letter "${symbol}" via historical analysis`);
            }
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          Logger.warn(`Error checking channel ${channelId} for historical validation:`, error);
        }
      }
    } catch (error) {
      Logger.error('Error during historical validation:', error);
    }

    return validatedSymbols;
  }

  public isValidSymbolWithContext(symbol: string, contextSymbols: string[]): boolean {
    // Use standard validation for multi-letter symbols
    if (symbol.length > 1) {
      return this.isValidSymbol(symbol);
    }

    // For single letters, allow if there are 1+ valid symbols in context
    if (symbol.length === 1 && /^[A-Z]$/.test(symbol)) {
      const validContextSymbols = contextSymbols.filter(s => 
        s !== symbol && this.isValidSymbol(s)
      );
      
      if (validContextSymbols.length >= 1) {
        Logger.debug(`Single letter "${symbol}" accepted due to context: ${validContextSymbols.join(', ')}`);
        return true;
      }
    }

    // Default to standard validation
    return this.isValidSymbol(symbol);
  }

  /**
   * Get the symbol allowlist instance (for external services)
   */
  public getSymbolAllowlist(): SymbolAllowlist {
    return this.symbolAllowlist;
  }

  /**
   * Get the technical context detector instance (for external services)
   */
  public getTechnicalDetector(): TechnicalContextDetector {
    return this.technicalDetector;
  }
}