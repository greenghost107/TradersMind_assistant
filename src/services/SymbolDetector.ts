import { StockSymbol } from '../types';
import { SYMBOL_PATTERN, COMMON_WORDS } from '../config';
import { Logger } from '../utils/Logger';
import { TopPicksParser, TopPicksResult } from './TopPicksParser';

export class SymbolDetector {
  private topPicksParser: TopPicksParser;

  constructor() {
    this.topPicksParser = new TopPicksParser();
  }

  public detectSymbols(content: string): StockSymbol[] {
    // First, parse top picks to identify priority symbols
    const topPicks = this.topPicksParser.parseTopPicks(content);
    
    const symbols: StockSymbol[] = [];
    const matches = content.matchAll(SYMBOL_PATTERN);
    
    for (const match of matches) {
      const symbol = match[1]!;
      const position = match.index!;
      
      if (this.isValidSymbol(symbol)) {
        const confidence = this.calculateConfidence(symbol, content, position);
        const priority = this.determineSymbolPriority(symbol, topPicks);
        symbols.push({ symbol, confidence, position, priority });
      }
    }

    const finalSymbols = this.deduplicateAndSort(symbols);
    
    const priorityStats = this.getPriorityStats(finalSymbols);
    Logger.debug(`Detected symbols: ${finalSymbols.map(s => s.symbol).join(', ')}`);
    Logger.debug(`Priority breakdown: ${priorityStats.top_long} long, ${priorityStats.top_short} short, ${priorityStats.regular} regular`);
    
    return finalSymbols;
  }

  private isValidSymbol(symbol: string): boolean {
    if (COMMON_WORDS.has(symbol)) {
      return false;
    }

    if (symbol.length < 1 || symbol.length > 5) {
      return false;
    }

    if (!/^[A-Z]+$/.test(symbol)) {
      return false;
    }

    const singleLetterWords = ['A', 'I'];
    if (symbol.length === 1 && !singleLetterWords.includes(symbol)) {
      return false;
    }

    return true;
  }

  private calculateConfidence(symbol: string, content: string, position: number): number {
    let confidence = 0.5;

    const beforeChar = position > 0 ? content[position - 1] || ' ' : ' ';
    const afterChar = position + symbol.length < content.length ? content[position + symbol.length] || ' ' : ' ';

    if (beforeChar === '$') {
      confidence += 0.4;
    }

    if (beforeChar === '#') {
      confidence += 0.3;
    }

    const lowerContent = content.toLowerCase();
    const stockKeywords = ['stock', 'ticker', 'symbol', 'shares', 'equity', 'trade', 'buy', 'sell', 'analysis', 'chart', 'price', 'target'];
    const keywordBonus = stockKeywords.some(keyword => lowerContent.includes(keyword)) ? 0.2 : 0;
    confidence += keywordBonus;

    if (symbol.length >= 2 && symbol.length <= 4) {
      confidence += 0.1;
    }

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
      })
      .slice(0, 25);
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
}