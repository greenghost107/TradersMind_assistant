import { Logger } from '../utils/Logger';

export interface TopPicksResult {
  longPicks: string[];
  shortPicks: string[];
}

export class TopPicksParser {
  public parseTopPicks(content: string): TopPicksResult {
    const result: TopPicksResult = {
      longPicks: [],
      shortPicks: []
    };

    const lowerContent = content.toLowerCase();
    
    // Look for Hebrew "טופ פיקס" or English "top picks" section
    const topPicksPattern = /(?:❕\s*טופ פיקס|top\s*picks?)[:：]/i;
    const topPicksMatch = content.search(topPicksPattern);
    
    if (topPicksMatch === -1) {
      Logger.debug('No top picks section found in message');
      return result;
    }

    // Extract the section after "טופ פיקס:" or "top picks:"
    const topPicksSection = content.slice(topPicksMatch);
    const lines = topPicksSection.split('\n');

    for (const line of lines) {
      // Look for long picks line: 📈 long: SYMBOL1, SYMBOL2, ...
      const longMatch = line.match(/📈\s*long\s*[:：]\s*(.+)/i);
      if (longMatch) {
        const symbolsText = longMatch[1]!.trim();
        result.longPicks = this.extractSymbolsFromText(symbolsText);
        Logger.debug(`Found ${result.longPicks.length} long top picks: ${result.longPicks.join(', ')}`);
        continue;
      }

      // Look for short picks line: 📉 short: SYMBOL1, SYMBOL2, ...
      const shortMatch = line.match(/📉\s*short\s*[:：]\s*(.+)/i);
      if (shortMatch) {
        const symbolsText = shortMatch[1]!.trim();
        result.shortPicks = this.extractSymbolsFromText(symbolsText);
        Logger.debug(`Found ${result.shortPicks.length} short top picks: ${result.shortPicks.join(', ')}`);
        continue;
      }
    }

    const totalPicks = result.longPicks.length + result.shortPicks.length;
    if (totalPicks > 0) {
      Logger.info(`Parsed top picks: ${result.longPicks.length} long, ${result.shortPicks.length} short`);
    }

    return result;
  }

  private extractSymbolsFromText(text: string): string[] {
    // Remove common separators and extract symbols
    const cleaned = text
      .replace(/[,，、]/g, ' ')  // Replace commas with spaces
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();

    if (!cleaned) {
      return [];
    }

    // Extract valid stock symbols (1-5 uppercase letters)
    const symbolPattern = /\b([A-Z]{1,5})\b/g;
    const symbols: string[] = [];
    let match;

    while ((match = symbolPattern.exec(cleaned)) !== null) {
      const symbol = match[1]!;
      if (this.isValidStockSymbol(symbol)) {
        symbols.push(symbol);
      }
    }

    // Remove duplicates while preserving order
    return [...new Set(symbols)];
  }

  private isValidStockSymbol(symbol: string): boolean {
    // Basic validation - exclude common words that might appear in picks
    const excludeWords = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 
      'HER', 'WAS', 'ONE', 'OUR', 'HAD', 'HAS', 'HIS', 'HOW', 'MAN', 
      'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WHO', 'BOY', 'DID', 'ITS', 
      'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'USD', 'CEO', 'IPO',
      'SEC', 'FDA', 'API', 'URL', 'PDF', 'FAQ', 'LONG', 'SHORT'
    ]);

    if (excludeWords.has(symbol)) {
      return false;
    }

    // Must be 1-5 uppercase letters
    if (symbol.length < 1 || symbol.length > 5) {
      return false;
    }

    if (!/^[A-Z]+$/.test(symbol)) {
      return false;
    }

    // Single letter symbols only for specific cases
    const allowedSingleLetters = ['A', 'I'];
    if (symbol.length === 1 && !allowedSingleLetters.includes(symbol)) {
      return false;
    }

    return true;
  }

  public hasTopPicks(content: string): boolean {
    const topPicksPattern = /(?:❕\s*טופ פיקס|top\s*picks?)[:：]/i;
    return topPicksPattern.test(content);
  }
}