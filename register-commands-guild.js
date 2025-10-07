// Register slash commands for a specific guild (instant registration)
// Run this for immediate command availability: node register-commands-guild.js

const { REST, Routes, Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const commands = [
  {
    name: 'status',
    description: 'Show bot configuration and monitoring status'
  },
  {
    name: 'createbuttons',
    description: 'Create interactive buttons for stock symbols from your recent message (Analysis channels only)'
  }
];

(async () => {
  try {
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN is required in .env file');
    }

    console.log('Starting guild-specific slash command registration...');

    // Create a temporary client to get guild info
    const client = new Client({ 
      intents: [GatewayIntentBits.Guilds] 
    });

    await client.login(process.env.DISCORD_TOKEN);
    
    // Get guild ID from one of the channels we know exists
    const channelId = process.env.MANAGER_GENERAL_MESSAGES_CHANNEL;
    if (!channelId) {
      throw new Error('MANAGER_GENERAL_MESSAGES_CHANNEL is required to determine guild ID');
    }

    console.log(`Getting guild info from channel ${channelId}...`);
    const channel = await client.channels.fetch(channelId);
    
    if (!channel || !channel.guild) {
      throw new Error('Could not find guild from the specified channel');
    }

    const guildId = channel.guild.id;
    console.log(`Found guild: ${channel.guild.name} (${guildId})`);

    // Register commands for this specific guild
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    
    console.log(`Registering commands for guild ${guildId}...`);
    
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guildId),
      { body: commands },
    );

    console.log('✅ Successfully registered guild-specific slash commands!');
    console.log('Commands should be available immediately in your Discord server.');
    
    await client.destroy();
    
  } catch (error) {
    console.error('❌ Error registering commands:', error);
    process.exit(1);
  }
})();