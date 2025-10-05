// List all registered slash commands (global and guild-specific)
// Run this to see current command registrations: node list-commands.js

const { REST, Routes, Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

(async () => {
  try {
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN is required in .env file');
    }

    console.log('🔍 Investigating current slash command registrations...\n');

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    
    // Get application info
    const application = await rest.get(Routes.oauth2CurrentApplication());
    const clientId = application.id;
    
    console.log(`📱 Application: ${application.name} (${clientId})\n`);

    // Check global commands
    console.log('🌍 GLOBAL COMMANDS:');
    try {
      const globalCommands = await rest.get(Routes.applicationCommands(clientId));
      if (globalCommands.length === 0) {
        console.log('   ✅ No global commands registered');
      } else {
        globalCommands.forEach(cmd => {
          console.log(`   📋 /${cmd.name} - ${cmd.description}`);
        });
      }
    } catch (error) {
      console.log('   ❌ Error fetching global commands:', error.message);
    }

    console.log('');

    // Get guild ID and check guild-specific commands
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(process.env.DISCORD_TOKEN);
    
    const channelId = process.env.MANAGER_GENERAL_MESSAGES_CHANNEL;
    if (channelId) {
      const channel = await client.channels.fetch(channelId);
      if (channel && channel.guild) {
        const guildId = channel.guild.id;
        const guildName = channel.guild.name;
        
        console.log(`🏠 GUILD COMMANDS for "${guildName}" (${guildId}):`);
        try {
          const guildCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
          if (guildCommands.length === 0) {
            console.log('   ✅ No guild-specific commands registered');
          } else {
            guildCommands.forEach(cmd => {
              console.log(`   📋 /${cmd.name} - ${cmd.description}`);
            });
          }
        } catch (error) {
          console.log('   ❌ Error fetching guild commands:', error.message);
        }
      }
    }

    console.log('\n📊 SUMMARY:');
    console.log('   • Global commands affect all servers where your bot is installed');
    console.log('   • Guild commands only affect the specific server');
    console.log('   • Duplicates occur when both exist with same name');

    await client.destroy();
    
  } catch (error) {
    console.error('❌ Error investigating commands:', error);
    process.exit(1);
  }
})();