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
        '• `LONG_ANALYSIS_CHANNEL`\n' +
        '• `SHORT_ANALYSIS_CHANNEL`\n' +
        '• `MANAGER_GENERAL_MESSAGES_CHANNEL`\n\n' +
        'Optional configuration:\n' +
        '• `LONG_DISCUSSION_CHANNEL` - For manager discussion monitoring\n' +
        '• `SHORT_DISCUSSION_CHANNEL` - For manager discussion monitoring\n' +
        '• `MANAGER_ROLES` - Comma-separated list of manager role names\n\n' +
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
  
  // Get discussion channels (optional)
  const discussionChannels = config.discussionChannels.map(id => 
    interaction.guild!.channels.cache.get(id) || `<#${id}> (Channel not found)`
  );
  
  // Get retention statistics
  const retentionStats = MessageRetention.getGlobalStats();

  const embed = new EmbedBuilder()
    .setTitle('📊 Bot Configuration & Status')
    .setColor(Colors.Blue)
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
      ...(config.discussionChannels.length > 0 ? [{
        name: '💬 Discussion Channels (Manager Only)',
        value: discussionChannels.map((ch, i) => `• ${ch}`).join('\n'),
        inline: false
      }] : []),
      ...(config.managerId ? [{
        name: '👑 Manager ID',
        value: `• ${config.managerId}`,
        inline: false
      }] : []),
      {
        name: '⏰ Message Retention',
        value: '26 hours',
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
      (config.discussionChannels.length > 0 ? '• Bot also monitors discussion channels for manager messages\n' : '') +
      '• All responses are private (ephemeral) to you only'
    )
    .setFooter({
      text: 'Stock symbols are detected using pattern matching with confidence scoring'
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}