import { StockSymbol } from '../types';
import { SYMBOL_PATTERN, COMMON_WORDS } from '../config';

export class SymbolDetector {
  public detectSymbols(content: string): StockSymbol[] {
    const symbols: StockSymbol[] = [];
    const matches = content.matchAll(SYMBOL_PATTERN);
    
    for (const match of matches) {
      const symbol = match[1]!;
      const position = match.index!;
      
      if (this.isValidSymbol(symbol)) {
        const confidence = this.calculateConfidence(symbol, content, position);
        symbols.push({ symbol, confidence, position });
      }
    }

    return this.deduplicateAndSort(symbols);
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

  private deduplicateAndSort(symbols: StockSymbol[]): StockSymbol[] {
    const symbolMap = new Map<string, StockSymbol>();
    
    for (const symbol of symbols) {
      const existing = symbolMap.get(symbol.symbol);
      if (!existing || symbol.confidence > existing.confidence) {
        symbolMap.set(symbol.symbol, symbol);
      }
    }
    
    return Array.from(symbolMap.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 25);
  }

  public isLikelyStockSymbol(symbol: string): boolean {
    return this.isValidSymbol(symbol);
  }
}