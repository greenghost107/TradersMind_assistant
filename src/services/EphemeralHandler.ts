import { 
  Message, 
  ButtonInteraction, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  Colors
} from 'discord.js';
import { StockSymbol, EphemeralInteraction } from '../types';
import { AnalysisLinker } from './AnalysisLinker';
import { MessageRetention } from './MessageRetention';
import { MAX_DISCORD_BUTTONS } from '../config';
import { Logger } from '../utils/Logger';

export class EphemeralHandler {
  private ephemeralTracking: Map<string, EphemeralInteraction> = new Map();

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
    const symbolsWithAnalysis = symbols.filter(symbol => 
      this.analysisLinker.hasAnalysisFor(symbol.symbol)
    );
    
    if (symbolsWithAnalysis.length === 0) {
      Logger.debug(`No symbols with available analysis data found in message ${message.id}`);
      return;
    }
    
    Logger.debug(`Filtered ${symbols.length} symbols down to ${symbolsWithAnalysis.length} symbols with analysis data`);
    
    const limitedSymbols = symbolsWithAnalysis.slice(0, MAX_DISCORD_BUTTONS);
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    
    let currentRow = new ActionRowBuilder<ButtonBuilder>();
    let buttonsInRow = 0;
    
    for (const symbol of limitedSymbols) {
      if (buttonsInRow >= 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
        buttonsInRow = 0;
      }
      
      const button = new ButtonBuilder()
        .setCustomId(`symbol_${symbol.symbol}_${message.id}`)
        .setLabel(`📊 $${symbol.symbol}`)
        .setStyle(ButtonStyle.Secondary);
      
      currentRow.addComponents(button);
      buttonsInRow++;
    }
    
    if (buttonsInRow > 0) {
      rows.push(currentRow);
    }

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
    }
  }

  public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith('symbol_')) {
      return;
    }

    const [, symbol, messageId] = interaction.customId.split('_');
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

      if (analyses.length === 0) {
        await interaction.editReply({
          content: `📊 **$${symbol}**\n\n❌ No recent analysis found for this symbol.`
        });
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
        embed.setURL(latestUrl);
      }

      // Create a short preview of the analysis content (max ~200 characters)
      const shortPreview = latestAnalysis.content.length > 200 
        ? latestAnalysis.content.substring(0, 200) + '...'
        : latestAnalysis.content;

      let description = `**${channelName}** • ${timeAgo}\n\n${shortPreview}\n\n`;
      
      const messageUrl = latestAnalysis.messageUrl || `https://discord.com/channels/${interaction.guildId}/${latestAnalysis.channelId}/${latestAnalysis.messageId}`;
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

  public getEphemeralStats(): { totalTracked: number } {
    return {
      totalTracked: this.ephemeralTracking.size
    };
  }

  public performFinalCleanup(): void {
    Logger.info('Performing final ephemeral cleanup before shutdown...');
    
    const startTime = Date.now();
    const totalTracked = this.ephemeralTracking.size;
    
    this.ephemeralTracking.clear();
    
    const duration = Date.now() - startTime;
    Logger.info(`Ephemeral final cleanup complete: ${totalTracked} interactions cleared (${duration}ms)`);
  }
}