// Simple script to register the /status command
// Run this once after setting up your bot: node register-status-command.js

const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
  {
    name: 'status',
    description: 'Show bot configuration and monitoring status'
  }
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN is required in .env file');
    }

    console.log('Started registering /status command...');

    // Get application info to get client ID
    const application = await rest.get(Routes.oauth2CurrentApplication());
    const clientId = application.id;

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );

    console.log('Successfully registered /status command!');
  } catch (error) {
    console.error('Error registering command:', error);
  }
})();