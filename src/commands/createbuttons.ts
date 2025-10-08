import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { getBotConfig } from '../config';
import { DiscussionChannelHandler } from '../services/DiscussionChannelHandler';
import { SymbolDetector } from '../services/SymbolDetector';
import { EphemeralHandler } from '../services/EphemeralHandler';
import { AnalysisLinker } from '../services/AnalysisLinker';
import { MessageRetention } from '../services/MessageRetention';
import { StockSymbol } from '../types';
import { Logger } from '../utils/Logger';

// Service instances - will be initialized by the bot
let discussionChannelHandler: DiscussionChannelHandler;
let symbolDetector: SymbolDetector;
let ephemeralHandler: EphemeralHandler;

// Initialize services (called by bot during startup)
export function initializeServices(
  dch: DiscussionChannelHandler,
  sd: SymbolDetector,
  eh: EphemeralHandler
) {
  discussionChannelHandler = dch;
  symbolDetector = sd;
  ephemeralHandler = eh;
}

export const data = new SlashCommandBuilder()
  .setName('createbuttons')
  .setDescription('Create interactive buttons for stock symbols from your recent message (Analysis channels only)');

export async function execute(interaction: ChatInputCommandInteraction) {
  const startTime = Date.now();
  Logger.info(`/createbuttons started by ${interaction.user.tag} in channel ${interaction.channel?.id}`);
  
  try {
    // Get bot configuration
    const config = getBotConfig();
    
    if (!config) {
      Logger.error('Bot configuration error in /createbuttons');
      await interaction.reply({ 
        content: '❌ Bot configuration error - please contact administrator', 
        ephemeral: true 
      });
      return;
    }

    // Validate this command is used in analysis channels only
    if (!interaction.channel?.id || !config.analysisChannels.includes(interaction.channel.id)) {
      Logger.warn(`/createbuttons used in wrong channel: ${interaction.channel?.id} by ${interaction.user.tag}`);
      await interaction.reply({ 
        content: '❌ This command only works in analysis channels', 
        ephemeral: true 
      });
      return;
    }

    // Validate manager permissions
    // Create a mock message object for permission checking
    const mockMessage = {
      author: interaction.user,
      channel: interaction.channel,
      id: 'mock-interaction-message'
    } as any;

    if (!discussionChannelHandler || !discussionChannelHandler.isManagerMessage(mockMessage, config)) {
      Logger.warn(`/createbuttons permission denied for user: ${interaction.user.tag}`);
      await interaction.reply({ 
        content: '❌ Only managers can use this command', 
        ephemeral: true 
      });
      return;
    }

    // Send initial ephemeral response
    await interaction.reply({ 
      content: '⏳ Processing symbols...', 
      ephemeral: true 
    });

    // Find manager's most recent message in analysis channel
    const channel = interaction.channel;
    if (!channel || !('messages' in channel)) {
      await interaction.editReply({ 
        content: '❌ Unable to access channel messages' 
      });
      return;
    }

    // Fetch recent messages to find manager's last message
    const messages = await channel.messages.fetch({ limit: 20 });
    const managerMessages = messages.filter(msg => 
      msg.author.id === interaction.user.id && 
      !msg.author.bot &&
      msg.content.trim().length > 0
    );

    Logger.debug(`Found ${managerMessages.size} manager messages in channel`);

    if (managerMessages.size === 0) {
      Logger.warn(`No recent messages found for ${interaction.user.tag} in channel ${interaction.channel?.id}`);
      await interaction.editReply({ 
        content: '❌ No recent message found to create deals from' 
      });
      return;
    }

    // Get the most recent manager message
    const latestMessage = managerMessages.first()!;
    
    // Parse symbols from the message content
    const symbols = parseDealsSymbols(latestMessage.content);
    Logger.debug(`Parsed ${symbols.length} symbols: ${symbols.map(s => s.symbol).join(', ')}`);
    
    if (symbols.length === 0) {
      Logger.warn(`No symbols found in message: "${latestMessage.content}"`);
      await interaction.editReply({ 
        content: '❌ No valid symbols found in your message' 
      });
      return;
    }

    // Create symbol buttons using existing EphemeralHandler
    if (!ephemeralHandler) {
      Logger.error('EphemeralHandler not initialized in /createbuttons');
      await interaction.editReply({ 
        content: '❌ Service initialization error - please contact administrator' 
      });
      return;
    }

    await ephemeralHandler.createSymbolButtons(latestMessage, symbols);
    Logger.debug('Symbol buttons created successfully');
    
    // Update ephemeral response with success message
    await interaction.editReply({ 
      content: `✅ Created symbol buttons for ${symbols.length} symbols: ${symbols.map(s => s.symbol).join(', ')}` 
    });
    
    const duration = Date.now() - startTime;
    Logger.info(`✅ /createbuttons completed for ${interaction.user.tag}: ${symbols.length} symbols in ${duration}ms`);
    
    // Preserve 5-second auto-deletion behavior
    setTimeout(async () => {
      try {
        await interaction.deleteReply();
      } catch (error) {
        // Ignore errors if reply was already deleted
      }
    }, 5000);

  } catch (error) {
    const duration = Date.now() - startTime;
    Logger.error(`❌ /createbuttons failed for ${interaction.user.tag} after ${duration}ms:`, error);
    
    try {
      await interaction.editReply({ 
        content: '❌ An error occurred while creating symbol buttons' 
      });
    } catch (editError) {
      Logger.error('Error updating interaction response:', editError);
    }
  }
}

/**
 * Parses symbols from a deals message format like "QUBT / BKV / MSFT / VEEV 👀"
 * Handles various formats: "SYMBOL / SYMBOL", "SYMBOL/SYMBOL", "SYMBOL SYMBOL"
 */
function parseDealsSymbols(content: string): StockSymbol[] {
  Logger.debug(`Parsing deals symbols from content: "${content}"`);

  // Split content into lines and find the first line with potential symbols
  const lines = content.split('\n');
  let symbolLine = '';
  
  // Look for the first line that contains potential stock symbols
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines, @everyone tags, and lines that are just emojis
    if (!trimmedLine || 
        trimmedLine === '@everyone' || 
        /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}👀]+$/u.test(trimmedLine)) {
      continue;
    }
    
    symbolLine = trimmedLine;
    break;
  }

  if (!symbolLine) {
    Logger.debug('No symbol line found in message');
    return [];
  }

  Logger.debug(`Processing symbol line: "${symbolLine}"`);

  // Split by various separators: " / ", "/", " ", "\t"
  const potentialSymbols = symbolLine
    .split(/[\s\/]+/)
    .map(s => s.trim())
    .map(s => s.replace(/[^\w]/g, '')) // Remove emojis and special chars
    .filter(s => s.length > 0 && s.length <= 5 && /^[A-Z]+$/i.test(s))
    .map(s => s.toUpperCase());

  // Remove duplicates
  const uniqueSymbols = [...new Set(potentialSymbols)];

  Logger.debug(`Found potential symbols: ${uniqueSymbols.join(', ')}`);

  // Use context-aware validation for deals
  const symbolDetector = new SymbolDetector();
  const validSymbols: string[] = [];
  const rejectedSingleLetters: string[] = [];

  // First pass: validate symbols with standard rules
  for (const symbol of uniqueSymbols) {
    if (symbolDetector.isValidSymbolWithContext(symbol, uniqueSymbols)) {
      validSymbols.push(symbol);
    } else if (symbol.length === 1 && /^[A-Z]$/.test(symbol)) {
      rejectedSingleLetters.push(symbol);
    }
  }

  // Second pass: context trust for single letters in deals lists
  if (validSymbols.length >= 1) {
    Logger.debug(`Context trust enabled for deals: ${validSymbols.length} valid symbols found`);
    for (const singleLetter of rejectedSingleLetters) {
      validSymbols.push(singleLetter);
      Logger.debug(`Added single letter "${singleLetter}" via deals context trust`);
    }
  }

  // Convert to StockSymbol objects with high confidence for deals
  const symbols: StockSymbol[] = validSymbols.map((symbol, index) => ({
    symbol,
    confidence: 1.0, // High confidence for manually specified deals
    position: index,
    priority: 'regular' as const
  }));

  Logger.debug(`Final parsed deals symbols: ${symbols.map(s => s.symbol).join(', ')}`);
  return symbols;
}