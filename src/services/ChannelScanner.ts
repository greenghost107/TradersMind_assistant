import { Message } from 'discord.js';
import { BotConfig } from '../types';
import { SymbolDetector } from './SymbolDetector';
import { EphemeralHandler } from './EphemeralHandler';
import { AnalysisLinker } from './AnalysisLinker';
import { Logger } from '../utils/Logger';

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

    const symbols = this.symbolDetector.detectSymbols(message.content);
    
    if (symbols.length === 0) {
      return;
    }

    const symbolsWithAnalysis = symbols.filter(symbol => 
      this.analysisLinker.hasAnalysisFor(symbol.symbol)
    );

    Logger.info(`Found ${symbols.length} symbols in message from ${message.member?.nickname || message.author.tag}: ${symbols.map(s => s.symbol).join(', ')}`);
    
    if (symbolsWithAnalysis.length === 0) {
      Logger.debug(`No symbols with analysis data available - skipping button creation`);
      return;
    }
    
    Logger.info(`Creating buttons for ${symbolsWithAnalysis.length} symbols with analysis: ${symbolsWithAnalysis.map(s => s.symbol).join(', ')}`);

    await this.ephemeralHandler.createSymbolButtons(message, symbolsWithAnalysis);
  }
}