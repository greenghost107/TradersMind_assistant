import { 
  Message, 
  ButtonInteraction, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  Colors
} from 'discord.js';
import { StockSymbol, EphemeralInteraction, MessageGroup } from '../types';
import { AnalysisLinker } from './AnalysisLinker';
import { MessageRetention } from './MessageRetention';
import { MAX_DISCORD_BUTTONS } from '../config';
import { Logger } from '../utils/Logger';
import { DiscordUrlGenerator } from '../utils/DiscordUrlGenerator';

export class EphemeralHandler {
  private ephemeralTracking: Map<string, EphemeralInteraction> = new Map();
  private messageGroups: Map<string, MessageGroup> = new Map();

  constructor(
    private analysisLinker: AnalysisLinker,
    private messageRetention?: MessageRetention
  ) {
    this.startEphemeralCleanup();
  }

  public async createSymbolButtons(
    message: Message, 
    symbols: StockSymbol[]
  ): Promise<void> {
    // Trust ChannelScanner filtering - all symbols passed here should get buttons
    const symbolsForButtons = symbols;
    
    if (symbolsForButtons.length === 0) {
      Logger.debug(`No symbols provided for button creation in message ${message.id}`);
      return;
    }
    
    const topPicksCount = symbolsForButtons.filter(s => s.priority === 'top_long' || s.priority === 'top_short').length;
    const regularCount = symbolsForButtons.filter(s => s.priority === 'regular').length;
    Logger.debug(`Button creation: ${symbolsForButtons.length} symbols (${topPicksCount} top picks, ${regularCount} regular)`);
    
    // Split symbols into chunks of 25 to match Discord's button limit (5 rows × 5 buttons)
    const SYMBOLS_PER_MESSAGE = 20;
    const symbolChunks = this.chunkSymbols(symbolsForButtons, SYMBOLS_PER_MESSAGE);
    
    if (symbolChunks.length === 1) {
      // Single message - existing behavior
      Logger.debug(`Creating single button message with ${symbolsForButtons.length} symbols`);
      await this.createSingleButtonMessage(message, symbolChunks[0]!);
    } else {
      // Multiple messages - new grouped behavior
      Logger.info(`Splitting ${symbolsForButtons.length} symbols into ${symbolChunks.length} messages (${SYMBOLS_PER_MESSAGE} symbols per message)`);
      await this.createGroupedButtonMessages(message, symbolChunks);
    }
  }

  private chunkSymbols(symbols: StockSymbol[], chunkSize: number): StockSymbol[][] {
    const chunks: StockSymbol[][] = [];
    for (let i = 0; i < symbols.length; i += chunkSize) {
      chunks.push(symbols.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async createSingleButtonMessage(message: Message, symbols: StockSymbol[]): Promise<void> {
    const rows = this.createButtonRows(symbols, message.id);
    
    try {
      const botMessage = await message.reply({
        components: rows,
        allowedMentions: { repliedUser: false }
      });
      
      // Add the bot message to retention for automatic cleanup
      if (this.messageRetention && botMessage) {
        this.messageRetention.addMessageForRetention(botMessage);
      }
    } catch (error) {
      Logger.error('Failed to send symbol buttons:', error);
      
      if (this.isPermissionError(error)) {
        Logger.warn('Permission error detected during button creation - this may indicate permission changes');
      }
    }
  }

  private async createGroupedButtonMessages(message: Message, symbolChunks: StockSymbol[][]): Promise<void> {
    const groupId = `group_${message.id}_${Date.now()}`;
    const messageIds: string[] = [];
    
    try {
      for (let i = 0; i < symbolChunks.length; i++) {
        const chunk = symbolChunks[i]!;
        const rows = this.createButtonRows(chunk, message.id, i);
        
        const content = i === 0 
          ? `📊 Top Picks (Part ${i + 1}/${symbolChunks.length})`
          : `📊 Top Picks (Part ${i + 1}/${symbolChunks.length})`;
        
        const botMessage = await message.reply({
          content,
          components: rows,
          allowedMentions: { repliedUser: false }
        });
        
        if (botMessage) {
          messageIds.push(botMessage.id);
          
          // Add to retention with group information
          if (this.messageRetention) {
            this.messageRetention.addMessageForRetention(botMessage, undefined, groupId);
          }
        }
        
        // Small delay between messages to avoid rate limits
        if (i < symbolChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Store group information
      const totalSymbols = symbolChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const messageGroup: MessageGroup = {
        groupId,
        messageIds,
        channelId: message.channel.id,
        createdAt: new Date(),
        symbolCount: totalSymbols
      };
      
      this.messageGroups.set(groupId, messageGroup);
      Logger.debug(`Created message group ${groupId} with ${messageIds.length} messages for ${totalSymbols} symbols`);
      
    } catch (error) {
      Logger.error('Failed to send grouped symbol buttons:', error);
      
      if (this.isPermissionError(error)) {
        Logger.warn('Permission error detected during grouped button creation - this may indicate permission changes');
      }
    }
  }

  private createButtonRows(symbols: StockSymbol[], originalMessageId: string, chunkIndex: number = 0): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();
    let buttonsInRow = 0;
    
    for (const symbol of symbols) {
      if (buttonsInRow >= 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
        buttonsInRow = 0;
      }
      
      const button = new ButtonBuilder()
        .setCustomId(`symbol_${symbol.symbol}_${originalMessageId}_${chunkIndex}`)
        .setLabel(this.getButtonLabel(symbol))
        .setStyle(this.getButtonStyle(symbol.priority));
      
      currentRow.addComponents(button);
      buttonsInRow++;
    }
    
    if (buttonsInRow > 0) {
      rows.push(currentRow);
    }
    
    return rows;
  }

  public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith('symbol_')) {
      return;
    }

    const parts = interaction.customId.split('_');
    if (parts.length < 3) {
      await interaction.reply({ 
        content: 'Invalid button interaction.', 
        ephemeral: true 
      });
      return;
    }

    const [, symbol, messageId] = parts;
    if (!symbol || !messageId) {
      await interaction.reply({ 
        content: 'Invalid button interaction.', 
        ephemeral: true 
      });
      return;
    }

    Logger.interaction(`Button clicked: ${symbol} by ${interaction.user.tag}`);

    try {
      await interaction.deferReply({ ephemeral: true });

      const trackingKey = `${interaction.user.id}_${messageId}_${symbol}`;
      this.ephemeralTracking.set(trackingKey, {
        userId: interaction.user.id,
        messageId: messageId,
        timestamp: new Date(),
        symbols: [symbol]
      });

      const analyses = await this.analysisLinker.getLatestAnalysis(symbol, 1);
      const latestUrl = this.analysisLinker.getLatestAnalysisUrl(symbol);
      Logger.debug(`Button clicked for ${symbol}: latestUrl=${latestUrl}, analysesCount=${analyses.length}`);

      if (analyses.length === 0) {
        // Check if this is a top pick symbol (based on button style)
        const channel = interaction.client.channels.cache.get(interaction.channelId);
        const originalMessage = channel && 'messages' in channel 
          ? await channel.messages.fetch(messageId).catch(() => null)
          : null;
        const isTopPick = originalMessage && symbol && this.isTopPicksSymbol(originalMessage, symbol);
        
        if (isTopPick) {
          await interaction.editReply({
            content: `🌟 **$${symbol}** - Top Pick\n\n📋 This symbol is featured in today's top picks but doesn't have recent analysis data available.\n\n💡 Consider this a curated selection for further research!`
          });
        } else {
          await interaction.editReply({
            content: `📊 **$${symbol}**\n\n❌ No recent analysis found for this symbol.`
          });
        }
        return;
      }

      // Get the latest analysis (first item)
      const latestAnalysis = analyses[0]!;
      const timeAgo = this.getTimeAgo(latestAnalysis.timestamp);
      const channel = interaction.client.channels.cache.get(latestAnalysis.channelId);
      const channelName = channel ? `#${(channel as any).name}` : 'Unknown Channel';

      const embed = new EmbedBuilder()
        .setTitle(`📊 Latest Analysis for $${symbol}`)
        .setColor(Colors.Green)
        .setTimestamp();

      // Add latest analysis URL as a prominent link if available
      if (latestUrl) {
        Logger.debug(`Setting embed URL to: ${latestUrl}`);
        embed.setURL(latestUrl);
      } else {
        Logger.debug(`No latestUrl available for ${symbol}, embed URL will not be set`);
      }

      // Create a short preview of the analysis content (max ~200 characters)
      const shortPreview = latestAnalysis.content.length > 200 
        ? latestAnalysis.content.substring(0, 200) + '...'
        : latestAnalysis.content;

      let description = `**${channelName}** • ${timeAgo}\n\n${shortPreview}\n\n`;
      
      // Generate fallback URL first
      const fallbackUrl = interaction.guildId 
        ? DiscordUrlGenerator.generateLegacyUrl(
            interaction.guildId,
            latestAnalysis.channelId,
            latestAnalysis.messageId
          )
        : 'URL unavailable';
      
      // Use stored URL if available, but validate it first
      let messageUrl = latestAnalysis.messageUrl;
      
      // Check if stored URL has incorrect channel ID (known issue with historical data)
      if (messageUrl && interaction.guildId) {
        const expectedChannelId = latestAnalysis.channelId;
        const storedUrlPattern = new RegExp(`discord\\.com/channels/${interaction.guildId}/([^/]+)/`);
        const match = messageUrl.match(storedUrlPattern);
        
        if (match && match[1] !== expectedChannelId) {
          Logger.warn(`Stored URL has incorrect channel ID ${match[1]}, expected ${expectedChannelId}. Using fallback URL.`);
          messageUrl = fallbackUrl; // Use the correctly generated fallback URL
        }
      }
      
      // Final fallback if no messageUrl
      if (!messageUrl) {
        messageUrl = fallbackUrl;
      }
      
      Logger.debug(`Message URL for ${symbol}: stored=${latestAnalysis.messageUrl}, fallback=${fallbackUrl}, final=${messageUrl}`);
      description += `[View Original Message](${messageUrl})`;

      embed.setDescription(description);

      // Prioritize Discord attachments (chart snapshots) for display
      let chartImageUrl: string | null = null;
      
      if (latestAnalysis.attachmentUrls && latestAnalysis.attachmentUrls.length > 0) {
        chartImageUrl = latestAnalysis.attachmentUrls[0] || null;
      } else if (latestAnalysis.chartUrls && latestAnalysis.chartUrls.length > 0) {
        chartImageUrl = latestAnalysis.chartUrls[0] || null;
      }

      if (chartImageUrl) {
        embed.setImage(chartImageUrl);
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      Logger.error('Error handling button interaction:', error);
      
      // Check if this is a permission-related error
      if (this.isPermissionError(error)) {
        Logger.warn('Permission error detected during button interaction - this may indicate permission changes');
      }
      
      const errorMessage = interaction.deferred 
        ? { content: 'An error occurred while fetching analysis data.' }
        : { content: 'An error occurred while fetching analysis data.', ephemeral: true };
        
      if (interaction.deferred) {
        await interaction.editReply(errorMessage);
      } else {
        await interaction.reply({ ...errorMessage, ephemeral: true });
      }
    }
  }

  private getTimeAgo(timestamp: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  private startEphemeralCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredEphemeral();
    }, 60 * 60 * 1000);
  }

  private cleanupExpiredEphemeral(): void {
    const expirationTime = 4 * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;

    for (const [key, interaction] of this.ephemeralTracking.entries()) {
      if (now - interaction.timestamp.getTime() > expirationTime) {
        this.ephemeralTracking.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      Logger.info(`Cleaned up ${cleaned} expired ephemeral interactions`);
    }
  }

  private getButtonLabel(symbol: StockSymbol): string {
    switch (symbol.priority) {
      case 'top_long':
        return `🟢 $${symbol.symbol}`;
      case 'top_short':
        return `🔴 $${symbol.symbol}`;
      case 'regular':
      default:
        return `📊 $${symbol.symbol}`;
    }
  }

  private getButtonStyle(priority: 'top_long' | 'top_short' | 'regular'): ButtonStyle {
    switch (priority) {
      case 'top_long':
        return ButtonStyle.Success;
      case 'top_short':
        return ButtonStyle.Danger;
      case 'regular':
      default:
        return ButtonStyle.Secondary;
    }
  }

  public getEphemeralStats(): { totalTracked: number } {
    return {
      totalTracked: this.ephemeralTracking.size
    };
  }

  private isPermissionError(error: any): boolean {
    if (!error || typeof error !== 'object') return false;
    
    // Discord API error codes related to permissions
    const permissionErrorCodes = [
      50001, // Missing Access
      50013, // Missing Permissions
      50021, // Cannot execute action on a system message
      10003, // Unknown Channel (could indicate permission issue)
      10008, // Unknown Message (could indicate permission issue)
      20022, // This interaction has already been acknowledged
    ];
    
    // Check for Discord API error codes
    if (error.code && permissionErrorCodes.includes(error.code)) {
      return true;
    }
    
    // Check for error messages that indicate permission issues
    const permissionErrorMessages = [
      'missing permissions',
      'missing access',
      'insufficient permissions',
      'permission denied',
      'forbidden',
      'cannot send messages',
      'cannot read message history',
      'cannot use external emojis'
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
    return permissionErrorMessages.some(msg => errorMessage.includes(msg));
  }

  public performFinalCleanup(): void {
    Logger.info('Performing final ephemeral cleanup before shutdown...');
    
    const startTime = Date.now();
    const totalTracked = this.ephemeralTracking.size;
    const totalGroups = this.messageGroups.size;
    
    this.ephemeralTracking.clear();
    this.messageGroups.clear();
    
    const duration = Date.now() - startTime;
    Logger.info(`Ephemeral final cleanup complete: ${totalTracked} interactions cleared, ${totalGroups} groups cleared (${duration}ms)`);
  }

  public getMessageGroup(groupId: string): MessageGroup | undefined {
    return this.messageGroups.get(groupId);
  }

  public getAllMessageGroups(): MessageGroup[] {
    return Array.from(this.messageGroups.values());
  }

  private isTopPicksSymbol(message: Message, symbol: string): boolean {
    // Check if the original message contains top picks section with this symbol
    const content = message.content.toLowerCase();
    const symbolUpper = symbol.toUpperCase();
    
    // Look for Hebrew "טופ פיקס" or English "top picks" patterns
    const topPicksPatterns = [
      /טופ פיקס.*?(?:long|short).*?:/gi,
      /top\s*picks.*?(?:long|short).*?:/gi
    ];
    
    for (const pattern of topPicksPatterns) {
      const matches = message.content.match(pattern);
      if (matches) {
        // Check if symbol appears after the top picks section
        const topPicksIndex = message.content.search(pattern);
        const remainingContent = message.content.slice(topPicksIndex);
        if (remainingContent.includes(symbolUpper)) {
          return true;
        }
      }
    }
    
    return false;
  }
}