import { Logger } from '../utils/Logger';
import { DAYS_TO_SCRAPE } from '../config';

export interface AllowlistEntry {
  symbol: string;
  timestamp: Date;
  adminId: string;
  messageId: string;
  context: string; // The analysis message content for reference
}

export class SymbolAllowlist {
  private allowlist: Map<string, AllowlistEntry> = new Map();
  private readonly MAX_AGE_MS = DAYS_TO_SCRAPE * 24 * 60 * 60 * 1000;

  constructor() {
    this.startCleanupTask();
  }

  /**
   * Add a symbol to the allowlist from admin analysis
   */
  public addSymbol(symbol: string, adminId: string, messageId: string, context: string): void {
    const entry: AllowlistEntry = {
      symbol: symbol.toUpperCase(),
      timestamp: new Date(),
      adminId,
      messageId,
      context: context.substring(0, 200) // Store first 200 chars for reference
    };

    this.allowlist.set(symbol.toUpperCase(), entry);
    Logger.info(`Added symbol ${symbol} to allowlist from admin ${adminId} (message: ${messageId})`);
  }

  /**
   * Check if a symbol is in the allowlist and still valid
   */
  public isSymbolAllowed(symbol: string): boolean {
    const entry = this.allowlist.get(symbol.toUpperCase());
    if (!entry) {
      return false;
    }

    // Check if entry is still within valid time window
    const age = Date.now() - entry.timestamp.getTime();
    if (age > this.MAX_AGE_MS) {
      this.allowlist.delete(symbol.toUpperCase());
      Logger.debug(`Symbol ${symbol} expired from allowlist (age: ${Math.round(age / (24 * 60 * 60 * 1000))} days)`);
      return false;
    }

    return true;
  }

  /**
   * Get allowlist entry for a symbol (for debugging/logging)
   */
  public getSymbolEntry(symbol: string): AllowlistEntry | null {
    const entry = this.allowlist.get(symbol.toUpperCase());
    if (!entry) {
      return null;
    }

    // Verify entry is still valid
    const age = Date.now() - entry.timestamp.getTime();
    if (age > this.MAX_AGE_MS) {
      this.allowlist.delete(symbol.toUpperCase());
      return null;
    }

    return entry;
  }

  /**
   * Get all currently allowed symbols
   */
  public getAllowedSymbols(): string[] {
    const validSymbols: string[] = [];
    const now = Date.now();

    for (const [symbol, entry] of this.allowlist.entries()) {
      const age = now - entry.timestamp.getTime();
      if (age <= this.MAX_AGE_MS) {
        validSymbols.push(symbol);
      } else {
        this.allowlist.delete(symbol);
      }
    }

    return validSymbols.sort();
  }

  /**
   * Remove a symbol from the allowlist
   */
  public removeSymbol(symbol: string): boolean {
    const removed = this.allowlist.delete(symbol.toUpperCase());
    if (removed) {
      Logger.info(`Removed symbol ${symbol} from allowlist`);
    }
    return removed;
  }

  /**
   * Clear all symbols from allowlist
   */
  public clear(): void {
    const count = this.allowlist.size;
    this.allowlist.clear();
    Logger.info(`Cleared ${count} symbols from allowlist`);
  }

  /**
   * Get allowlist statistics
   */
  public getStats(): { totalSymbols: number; oldestEntry: Date | null; newestEntry: Date | null } {
    if (this.allowlist.size === 0) {
      return { totalSymbols: 0, oldestEntry: null, newestEntry: null };
    }

    let oldest = new Date();
    let newest = new Date(0);

    for (const entry of this.allowlist.values()) {
      if (entry.timestamp < oldest) {
        oldest = entry.timestamp;
      }
      if (entry.timestamp > newest) {
        newest = entry.timestamp;
      }
    }

    return {
      totalSymbols: this.allowlist.size,
      oldestEntry: oldest,
      newestEntry: newest
    };
  }

  /**
   * Initialize allowlist from historical data (for migrations)
   */
  public initializeFromHistoricalData(historicalEntries: AllowlistEntry[]): void {
    Logger.info(`Initializing allowlist with ${historicalEntries.length} historical entries`);
    
    this.allowlist.clear();
    const now = Date.now();
    let validCount = 0;

    for (const entry of historicalEntries) {
      const age = now - entry.timestamp.getTime();
      if (age <= this.MAX_AGE_MS) {
        this.allowlist.set(entry.symbol.toUpperCase(), entry);
        validCount++;
      } else {
        Logger.debug(`Skipping expired historical entry: ${entry.symbol} (age: ${Math.round(age / (24 * 60 * 60 * 1000))} days)`);
      }
    }

    Logger.info(`Loaded ${validCount} valid symbols into allowlist from historical data`);
  }

  /**
   * Extract symbols from admin analysis message content
   * Looks for $SYMBOL patterns that indicate explicit stock analysis
   */
  public extractSymbolsFromAdminMessage(content: string, adminId: string, messageId: string): string[] {
    const extractedSymbols: string[] = [];
    
    // Look for $SYMBOL patterns in the message
    const symbolPattern = /\$([A-Z]{1,5})(?![A-Z])/g;
    let match;
    
    while ((match = symbolPattern.exec(content)) !== null) {
      const symbol = match[1]!;
      
      // Basic validation - must be valid stock symbol format
      if (this.isValidSymbolFormat(symbol)) {
        extractedSymbols.push(symbol);
        this.addSymbol(symbol, adminId, messageId, content);
        Logger.debug(`Extracted and added symbol ${symbol} from admin message`);
      }
    }

    // Remove duplicates
    return [...new Set(extractedSymbols)];
  }

  /**
   * Check if symbol has valid format for stock symbols
   */
  private isValidSymbolFormat(symbol: string): boolean {
    // Must be 1-5 uppercase letters
    if (symbol.length < 1 || symbol.length > 5) {
      return false;
    }

    if (!/^[A-Z]+$/.test(symbol)) {
      return false;
    }

    return true;
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanupTask(): void {
    // Run cleanup every hour
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60 * 60 * 1000);
  }

  /**
   * Remove expired entries from allowlist
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [symbol, entry] of this.allowlist.entries()) {
      const age = now - entry.timestamp.getTime();
      if (age > this.MAX_AGE_MS) {
        this.allowlist.delete(symbol);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      Logger.info(`Cleaned up ${removedCount} expired symbols from allowlist`);
    }
  }
}