import { Message } from 'discord.js';
import { BotConfig } from '../types';
import { SymbolDetector } from './SymbolDetector';
import { EphemeralHandler } from './EphemeralHandler';
import { AnalysisLinker } from './AnalysisLinker';
import { Logger } from '../utils/Logger';
import { ThreadDetector } from '../utils/ThreadDetector';

export class ChannelScanner {
  constructor(
    private symbolDetector: SymbolDetector,
    private ephemeralHandler: EphemeralHandler,
    private analysisLinker: AnalysisLinker
  ) {}

  public async handleMessage(message: Message, config: BotConfig): Promise<void> {
    if (message.channelId !== config.generalNoticesChannel) {
      return;
    }

    // Skip thread messages - general notices should only process main channel messages
    if (ThreadDetector.checkAndLogThread(message, 'ChannelScanner')) {
      return;
    }

    const symbols = this.symbolDetector.detectSymbolsFromTopPicks(message.content);
    
    if (symbols.length === 0) {
      return;
    }

    // Log detailed symbol breakdown for debugging
    const topLongCount = symbols.filter(s => s.priority === 'top_long').length;
    const topShortCount = symbols.filter(s => s.priority === 'top_short').length;
    const regularCount = symbols.filter(s => s.priority === 'regular').length;
    
    Logger.info(`Found ${symbols.length} symbols in message from ${message.member?.displayName || message.author.tag || message.author.id}: ${symbols.map(s => `${s.symbol}(${s.priority})`).join(', ')}`);
    Logger.debug(`Symbol breakdown: ${topLongCount} top_long, ${topShortCount} top_short, ${regularCount} regular`);

    // All symbols (including top picks) require analysis data for buttons
    const symbolsWithAnalysis = symbols.filter(symbol => {
      const hasAnalysis = this.analysisLinker.hasAnalysisFor(symbol.symbol);
      Logger.debug(`Symbol ${symbol.symbol} (${symbol.priority}) analysis check: ${hasAnalysis}`);
      return hasAnalysis;
    });

    // Log filtering results
    const filteredOut = symbols.filter(symbol => !this.analysisLinker.hasAnalysisFor(symbol.symbol));
    
    if (filteredOut.length > 0) {
      Logger.debug(`Filtered out ${filteredOut.length} symbols without analysis: ${filteredOut.map(s => `${s.symbol}(${s.priority})`).join(', ')}`);
    }
    
    const topPicksIncluded = symbolsWithAnalysis.filter(s => s.priority === 'top_long' || s.priority === 'top_short').length;
    const regularIncluded = symbolsWithAnalysis.filter(s => s.priority === 'regular').length;
    Logger.debug(`Included symbols: ${topPicksIncluded} top picks, ${regularIncluded} regular (all with analysis)`);
    
    if (symbolsWithAnalysis.length === 0) {
      Logger.debug(`No symbols with analysis data available - skipping button creation`);
      return;
    }
    
    Logger.info(`Creating buttons for ${symbolsWithAnalysis.length} symbols with analysis: ${symbolsWithAnalysis.map(s => `${s.symbol}(${s.priority})`).join(', ')}`);

    // Log if we have top picks that might trigger splitting
    const topPicksWithAnalysis = symbolsWithAnalysis.filter(s => s.priority === 'top_long' || s.priority === 'top_short');
    if (topPicksWithAnalysis.length > 20) {
      Logger.info(`Top picks message has ${topPicksWithAnalysis.length} symbols with analysis - should trigger message splitting`);
    } else if (topPicksWithAnalysis.length > 0) {
      Logger.debug(`Top picks message has ${topPicksWithAnalysis.length} symbols with analysis - will use single message`);
    }

    await this.ephemeralHandler.createSymbolButtons(message, symbolsWithAnalysis);
  }
}