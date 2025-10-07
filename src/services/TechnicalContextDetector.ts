import { Logger } from '../utils/Logger';

export interface TechnicalPattern {
  pattern: RegExp;
  description: string;
  examples: string[];
}

export class TechnicalContextDetector {
  private technicalPatterns: TechnicalPattern[] = [
    {
      pattern: /\b\d+WH\b/gi,
      description: 'Week High indicator (e.g., 52WH)',
      examples: ['52WH', '4WH', '12WH']
    },
    {
      pattern: /(?:52|week|high|new).*\bWH\b/gi,
      description: 'Week High reference (reverse order)',
      examples: ['52 WH', 'new WH', 'week high WH']
    },
    {
      pattern: /\b\d+WL\b/gi,
      description: 'Week Low indicator (e.g., 52WL)',
      examples: ['52WL', '4WL', '12WL']
    },
    {
      pattern: /\b(EMA|SMA|DMA)\d+\b/gi,
      description: 'Moving Average indicators',
      examples: ['EMA20', 'SMA50', 'DMA200']
    },
    {
      pattern: /\b\d+(EMA|SMA|DMA)\b/gi,
      description: 'Moving Average indicators (prefix format)',
      examples: ['20EMA', '50SMA', '200DMA']
    },
    {
      pattern: /\b(RSI|MACD|BB)\d+\b/gi,
      description: 'Technical indicators with numbers',
      examples: ['RSI14', 'MACD12', 'BB20']
    },
    {
      pattern: /\bAVWAP\b/gi,
      description: 'Anchored Volume Weighted Average Price',
      examples: ['AVWAP']
    },
    {
      pattern: /\b(ATH|ATL)\b/gi,
      description: 'All Time High/Low',
      examples: ['ATH', 'ATL']
    }
  ];

  private geographicPatterns: TechnicalPattern[] = [
    {
      pattern: /\b(US|UK|EU|CA|JP|CN|DE|FR|IT|ES|KR|AU)\s+(market|markets|indices|index|economy|economic)\b/gi,
      description: 'Geographic market references',
      examples: ['US market', 'EU indices', 'JP economy', 'AU market']
    },
    {
      pattern: /\b(US|UK|EU|CA|JP|CN|DE|FR|IT|ES|KR|AU)\s+(conditions|performance|outlook|data)\b/gi,
      description: 'Geographic economic references',
      examples: ['US conditions', 'EU performance', 'CA outlook', 'AU market']
    }
  ];

  /**
   * Check if a symbol appears in a technical context that should prevent detection
   */
  public isInTechnicalContext(symbol: string, content: string, position: number): boolean {
    // Get surrounding context (±30 characters around the symbol)
    const contextStart = Math.max(0, position - 30);
    const contextEnd = Math.min(content.length, position + symbol.length + 30);
    const context = content.slice(contextStart, contextEnd);

    Logger.debug(`Checking technical context for symbol "${symbol}" in context: "${context}"`);

    // Check if symbol appears as part of a technical pattern
    // Only apply penalty if the symbol is directly part of the technical term
    for (const techPattern of this.technicalPatterns) {
      if (techPattern.pattern.test(context)) {
        // Check if the symbol is actually part of the matching technical pattern
        if (this.isSymbolPartOfTechnicalPattern(symbol, context, techPattern.pattern)) {
          Logger.debug(`Symbol "${symbol}" found in technical context: ${techPattern.description}`);
          return true;
        }
      }
    }

    // Check if symbol appears in geographic context
    for (const geoPattern of this.geographicPatterns) {
      if (geoPattern.pattern.test(context)) {
        Logger.debug(`Symbol "${symbol}" found in geographic context: ${geoPattern.description}`);
        return true;
      }
    }

    // Additional check for specific geographic contexts
    if (this.isInGeographicContext(symbol, content, position)) {
      Logger.debug(`Symbol "${symbol}" found in geographic context via specific check`);
      return true;
    }

    return false;
  }

  /**
   * Check if the symbol is actually part of the technical pattern match
   */
  private isSymbolPartOfTechnicalPattern(symbol: string, context: string, pattern: RegExp): boolean {
    const matches = context.match(pattern);
    if (!matches) return false;

    // Check if any of the matches contain our symbol
    for (const match of matches) {
      if (match.toUpperCase().includes(symbol.toUpperCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for specific geographic context patterns
   */
  private isInGeographicContext(symbol: string, content: string, position: number): boolean {
    // Get a wider context for geographic checks
    const contextStart = Math.max(0, position - 50);
    const contextEnd = Math.min(content.length, position + symbol.length + 50);
    const context = content.slice(contextStart, contextEnd);
    
    const lowerContext = context.toLowerCase();
    const symbolInContext = symbol.toLowerCase();
    
    // Check for geographic markers around the symbol
    const geoMarkers = [
      'market', 'markets', 'indices', 'index', 'economy', 'economic',
      'conditions', 'performance', 'outlook', 'data', 'trading'
    ];
    
    for (const marker of geoMarkers) {
      // Check if symbol is followed by geographic marker within reasonable distance
      const symbolPos = lowerContext.indexOf(symbolInContext);
      const markerPos = lowerContext.indexOf(marker);
      
      if (symbolPos !== -1 && markerPos !== -1) {
        const distance = Math.abs(markerPos - (symbolPos + symbolInContext.length));
        // If geographic marker is within 20 characters of symbol
        if (distance <= 20) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Check if the entire content contains primarily technical analysis terms
   * This helps identify messages that are purely technical commentary
   */
  public isPrimarilyTechnicalContent(content: string): boolean {
    let technicalTermCount = 0;
    let totalWords = 0;

    // Count total words (rough estimate)
    const words = content.trim().split(/\s+/).filter(word => word.length > 0);
    totalWords = words.length;

    if (totalWords < 5) {
      return false; // Too short to determine
    }

    // Count technical terms
    for (const pattern of this.technicalPatterns) {
      const matches = content.match(pattern.pattern);
      if (matches) {
        technicalTermCount += matches.length;
      }
    }

    // If more than 30% of content is technical terms, consider it primarily technical
    const technicalRatio = technicalTermCount / totalWords;
    const isPrimarilyTechnical = technicalRatio > 0.3;

    if (isPrimarilyTechnical) {
      Logger.debug(`Content flagged as primarily technical: ${technicalTermCount}/${totalWords} terms (${(technicalRatio * 100).toFixed(1)}%)`);
    }

    return isPrimarilyTechnical;
  }

  /**
   * Extract technical terms from content for analysis
   */
  public extractTechnicalTerms(content: string): string[] {
    const terms: string[] = [];

    for (const pattern of this.technicalPatterns) {
      const matches = content.match(pattern.pattern);
      if (matches) {
        terms.push(...matches.map(match => match.toUpperCase()));
      }
    }

    // Remove duplicates
    return [...new Set(terms)];
  }

  /**
   * Check if a symbol could be confused with a technical term
   */
  public couldBeConfusedWithTechnical(symbol: string): boolean {
    const potentiallyConfusing = [
      'WH', 'WL', 'EMA', 'SMA', 'DMA', 'RSI', 'MACD', 'BB', 'ATR', 'ADX', 'CCI', 'MFI',
      'ATH', 'ATL', 'SP', 'DOW', 'VIX', 'US', 'UK', 'EU', 'CA', 'JP', 'CN', 'AU'
    ];

    return potentiallyConfusing.includes(symbol.toUpperCase());
  }

  /**
   * Determine if a symbol mention has strong positional indicators (like $ prefix)
   * that override technical context concerns
   */
  public hasStrongSymbolIndicators(symbol: string, content: string, position: number): boolean {
    // Check for $ or # prefix
    const beforeChar = position > 0 ? content[position - 1] : ' ';
    if (beforeChar === '$' || beforeChar === '#') {
      Logger.debug(`Symbol "${symbol}" has strong prefix indicator: ${beforeChar}`);
      return true;
    }

    // Check for explicit stock context keywords nearby
    const contextStart = Math.max(0, position - 50);
    const contextEnd = Math.min(content.length, position + symbol.length + 50);
    const context = content.slice(contextStart, contextEnd).toLowerCase();

    // Only consider keywords that directly reference the symbol, not general mentions
    const symbolSpecificKeywords = [
      'ticker', 'shares', 'equity', 'trade', 'buy', 'sell',
      'target', 'price target', 'analysis', 'bullish', 'bearish', 'chart'
    ];

    // Look for patterns where the keyword is specifically about the symbol
    const symbolLower = symbol.toLowerCase();
    for (const keyword of symbolSpecificKeywords) {
      const keywordPattern = new RegExp(`\\b${keyword}\\b.*\\b${symbolLower}\\b|\\b${symbolLower}\\b.*\\b${keyword}\\b`, 'i');
      if (keywordPattern.test(context)) {
        Logger.debug(`Symbol "${symbol}" has strong stock context keyword: ${keyword}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Get a confidence penalty for symbols that could be technical terms
   */
  public getTechnicalConfusionPenalty(symbol: string, content: string, position: number): number {
    // Check if it's in technical/geographic context first
    if (this.isInTechnicalContext(symbol, content, position)) {
      // Very heavy penalty that should override even allowlist status
      return 1.5; // This ensures even high-confidence allowlist symbols get rejected
    }

    if (!this.couldBeConfusedWithTechnical(symbol)) {
      return 0; // No penalty for clearly non-technical symbols
    }

    // Check if it has strong symbol indicators
    if (this.hasStrongSymbolIndicators(symbol, content, position)) {
      return 0; // No penalty - strong symbol context
    }

    // Light penalty for potentially confusing symbols without clear context
    return 0.2;
  }

  /**
   * Add custom technical patterns (for extensibility)
   */
  public addTechnicalPattern(pattern: RegExp, description: string, examples: string[]): void {
    this.technicalPatterns.push({ pattern, description, examples });
    Logger.info(`Added custom technical pattern: ${description}`);
  }

  /**
   * Get all registered technical patterns (for debugging)
   */
  public getTechnicalPatterns(): TechnicalPattern[] {
    return [...this.technicalPatterns];
  }
}