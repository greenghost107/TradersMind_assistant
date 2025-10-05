import { Message } from 'discord.js';
import { BotConfig, StockSymbol } from '../types';
import { Logger } from '../utils/Logger';
import { SymbolDetector } from './SymbolDetector';
import { EphemeralHandler } from './EphemeralHandler';
import { MessageRetention } from './MessageRetention';

export class DealsChannelHandler {
  private symbolDetector: SymbolDetector;
  private ephemeralHandler: EphemeralHandler;
  private messageRetention: MessageRetention;

  constructor(
    symbolDetector: SymbolDetector,
    ephemeralHandler: EphemeralHandler,
    messageRetention: MessageRetention
  ) {
    this.symbolDetector = symbolDetector;
    this.ephemeralHandler = ephemeralHandler;
    this.messageRetention = messageRetention;
  }

  /**
   * Checks if a message is in the deals channel
   */
  public isDealsChannel(message: Message, config: BotConfig): boolean {
    return config.dealsChannel ? message.channel.id === config.dealsChannel : false;
  }

  /**
   * Checks if a message contains the /createdeals command
   */
  public hasCreateDealsCommand(message: Message): boolean {
    const content = message.content.toLowerCase();
    return content.includes('/createdeals');
  }

  /**
   * Parses symbols from a deals message format like "QUBT / BKV / MSFT / VEEV 👀"
   * Looks for symbols in the line before /createdeals command
   */
  public parseDealsSymbols(message: Message): StockSymbol[] {
    const lines = message.content.split('\n');
    const createDealsLineIndex = lines.findIndex(line => 
      line.toLowerCase().includes('/createdeals')
    );

    if (createDealsLineIndex === -1) {
      Logger.debug('No /createdeals command found in message');
      return [];
    }

    // Look for symbols in the line before /createdeals
    // If /createdeals is on the first line, there are no symbols to parse
    if (createDealsLineIndex === 0) {
      Logger.debug('/createdeals command is on first line, no symbols to parse');
      return [];
    }

    const symbolLineIndex = createDealsLineIndex - 1;
    const symbolLine = lines[symbolLineIndex];

    if (!symbolLine) {
      Logger.debug('No symbol line found before /createdeals command');
      return [];
    }

    Logger.debug(`Parsing symbols from line: "${symbolLine}"`);

    // Split by " / " pattern and clean up each symbol
    const symbolStrings = symbolLine
      .split('/')
      .map(s => s.trim())
      .map(s => s.replace(/[^\w]/g, '')) // Remove emojis and special chars
      .filter(s => s.length > 0 && s.length <= 5 && /^[A-Z]+$/i.test(s))
      .map(s => s.toUpperCase());

    // Convert to StockSymbol objects with high confidence
    const symbols: StockSymbol[] = symbolStrings.map((symbol, index) => ({
      symbol,
      confidence: 1.0, // High confidence for manually specified deals
      position: index,
      priority: 'regular' as const
    }));

    Logger.debug(`Parsed ${symbols.length} symbols from deals message: ${symbols.map(s => s.symbol).join(', ')}`);
    return symbols;
  }

  /**
   * Processes a deals channel message and creates buttons if it contains /createdeals
   */
  public async processDealsMessage(message: Message, config: BotConfig): Promise<boolean> {
    if (!this.isDealsChannel(message, config)) {
      return false;
    }

    if (!this.hasCreateDealsCommand(message)) {
      Logger.debug(`Deals message ${message.id} does not contain /createdeals command`);
      return false;
    }

    Logger.info(`🎯 Processing deals message ${message.id} with /createdeals command`);

    const symbols = this.parseDealsSymbols(message);
    
    if (symbols.length === 0) {
      Logger.warn(`No valid symbols found in deals message ${message.id}`);
      return false;
    }

    // Create symbol buttons using the existing EphemeralHandler
    await this.ephemeralHandler.createSymbolButtons(message, symbols);
    
    Logger.info(`✅ Created deals buttons for ${symbols.length} symbols: ${symbols.map(s => s.symbol).join(', ')}`);
    return true;
  }

  /**
   * Determines if a deals channel message should be processed
   * (must be from manager with /createdeals command)
   */
  public shouldProcessDealsMessage(message: Message, config: BotConfig): boolean {
    // Must be in deals channel
    if (!this.isDealsChannel(message, config)) {
      return false;
    }

    // Skip bot messages
    if (message.author.bot) {
      return false;
    }

    // Must contain /createdeals command
    if (!this.hasCreateDealsCommand(message)) {
      return false;
    }

    Logger.debug(`✅ Deals message ${message.id} should be processed`);
    return true;
  }
}