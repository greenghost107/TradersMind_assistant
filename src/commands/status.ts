import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { getBotConfig, ENV } from '../config';
import { MessageRetention } from '../services/MessageRetention';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Show bot configuration and monitoring status');

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ 
      content: 'This command can only be used in a guild.', 
      ephemeral: true 
    });
    return;
  }

  const config = getBotConfig();
  
  if (!config) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Bot Not Configured')
      .setDescription(
        'The bot is not properly configured. Missing required environment variables:\n\n' +
        '• `ANALYSIS_CHANNEL_1_ID`\n' +
        '• `ANALYSIS_CHANNEL_2_ID`\n' +
        '• `GENERAL_NOTICES_CHANNEL_ID`\n\n' +
        'Please contact an administrator to configure these channels.'
      )
      .setColor(Colors.Red)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    return;
  }

  const analysis1Channel = interaction.guild.channels.cache.get(config.analysisChannels[0]!);
  const analysis2Channel = interaction.guild.channels.cache.get(config.analysisChannels[1]!);
  const generalChannel = interaction.guild.channels.cache.get(config.generalNoticesChannel);
  
  // Get retention statistics
  const retentionStats = MessageRetention.getGlobalStats();

  const embed = new EmbedBuilder()
    .setTitle('📊 Bot Configuration & Status')
    .setColor(retentionStats?.isDebugMode ? Colors.Orange : Colors.Blue)
    .addFields([
      {
        name: '📈 Analysis Channels',
        value: `• ${analysis1Channel || `<#${config.analysisChannels[0]}> (Channel not found)`}\n` +
               `• ${analysis2Channel || `<#${config.analysisChannels[1]}> (Channel not found)`}`,
        inline: false
      },
      {
        name: '📢 General Notices Channel',
        value: `${generalChannel || `<#${config.generalNoticesChannel}> (Channel not found)`}`,
        inline: false
      },
      {
        name: '⏰ Message Retention',
        value: retentionStats?.isDebugMode 
          ? `🔧 DEBUG: ${config.retentionHours} seconds`
          : `${config.retentionHours} hours`,
        inline: true
      },
      {
        name: '🤖 Bot Status',
        value: '✅ Active and monitoring',
        inline: true
      },
      ...(retentionStats ? [{
        name: '🗑️ Pending Cleanups',
        value: `${retentionStats.pendingJobs} messages scheduled for deletion`,
        inline: true
      }] : [])
    ])
    .setDescription(
      '**How it works:**\n' +
      '• Bot monitors the general notices channel for stock symbols\n' +
      '• When symbols are detected, interactive buttons appear\n' +
      '• Click buttons to see related analysis from analysis channels\n' +
      '• All responses are private (ephemeral) to you only\n' +
      (retentionStats?.isDebugMode ? '\n🔧 **DEBUG MODE ACTIVE** - Fast cleanup for testing' : '')
    )
    .setFooter({
      text: 'Stock symbols are detected using pattern matching with confidence scoring'
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}