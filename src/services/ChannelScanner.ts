import { Message } from 'discord.js';
import { BotConfig } from '../types';
import { SymbolDetector } from './SymbolDetector';
import { EphemeralHandler } from './EphemeralHandler';

export class ChannelScanner {
  constructor(
    private symbolDetector: SymbolDetector,
    private ephemeralHandler: EphemeralHandler
  ) {}

  public async handleMessage(message: Message, config: BotConfig): Promise<void> {
    if (message.channelId !== config.generalNoticesChannel) {
      return;
    }

    const symbols = this.symbolDetector.detectSymbols(message.content);
    
    if (symbols.length === 0) {
      return;
    }

    console.log(`🔍 Found ${symbols.length} symbols in message from ${message.member?.nickname || message.author.tag}: ${symbols.map(s => s.symbol).join(', ')}`);

    await this.ephemeralHandler.createSymbolButtons(message, symbols);
  }
}