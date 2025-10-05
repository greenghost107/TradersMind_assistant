// Remove global slash commands (keeping guild-specific ones)
// This removes duplicates without affecting guild commands
// Run: node cleanup-global-commands.js

const { REST, Routes } = require('discord.js');
require('dotenv').config();

(async () => {
  try {
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN is required in .env file');
    }

    console.log('🧹 Starting global command cleanup...\n');

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    
    // Get application info
    const application = await rest.get(Routes.oauth2CurrentApplication());
    const clientId = application.id;
    
    console.log(`📱 Application: ${application.name} (${clientId})`);

    // List current global commands
    console.log('\n🔍 Current global commands:');
    const globalCommands = await rest.get(Routes.applicationCommands(clientId));
    
    if (globalCommands.length === 0) {
      console.log('   ✅ No global commands to remove');
      return;
    }

    globalCommands.forEach(cmd => {
      console.log(`   📋 /${cmd.name} - ${cmd.description}`);
    });

    console.log('\n⚠️  WARNING: This will remove ALL global commands.');
    console.log('   • Guild-specific commands will remain intact');
    console.log('   • This only affects global registrations');
    console.log('   • Production servers using guild commands are safe');

    // Remove all global commands by setting empty array
    console.log('\n🗑️  Removing global commands...');
    
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: [] }, // Empty array removes all global commands
    );

    console.log('✅ Global commands successfully removed!');
    console.log('\n📊 Result:');
    console.log('   • Global commands: REMOVED (eliminates duplicates)');
    console.log('   • Guild commands: PRESERVED (continue working)');
    console.log('   • Production: UNAFFECTED (uses separate registrations)');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
})();