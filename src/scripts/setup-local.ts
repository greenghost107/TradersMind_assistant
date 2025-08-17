#!/usr/bin/env ts-node

import { config } from 'dotenv';
import { LocalDatabaseService } from '../services/LocalDatabaseService';
import { LocalTestUtils } from '../utils/LocalTestUtils';
import { Logger } from '../utils/Logger';
import { ModeManager } from '../config/ModeManager';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
config();

async function setupLocalEnvironment(): Promise<void> {
  Logger.info('🏠 Setting up local development environment...');
  
  try {
    // Initialize ModeManager to ensure we're in local mode
    const modeManager = ModeManager.getInstance();
    if (!modeManager.isLocalMode()) {
      Logger.warn('⚠️ Not in local mode. Set BOT_MODE=local to run local setup.');
    }

    // Create .env.local if it doesn't exist
    await createLocalEnvFile();
    
    // Initialize local database
    await initializeLocalDatabase();
    
    // Run test scenarios
    await runTestScenarios();
    
    Logger.info('✅ Local environment setup completed successfully!');
    Logger.info('');
    Logger.info('🚀 Quick start commands:');
    Logger.info('   npm run dev:local     # Run bot in local mode');
    Logger.info('   npm run test:local    # Run local tests');
    Logger.info('   npm run local:reset   # Reset local database');
    Logger.info('');

  } catch (error) {
    Logger.error('❌ Local environment setup failed:', error);
    process.exit(1);
  }
}

async function createLocalEnvFile(): Promise<void> {
  const envLocalPath = path.join(process.cwd(), '.env.local');
  
  if (fs.existsSync(envLocalPath)) {
    Logger.info('📄 .env.local already exists');
    return;
  }

  const envLocalContent = `# Local Development Environment
# This file is for local testing only - do not commit to version control

# Bot Mode
BOT_MODE=local

# Logging
DEBUG_LEVEL=debug

# Local Database
LOCAL_DB_PATH=./local_bot.db
LOCAL_PORT=3000

# Skip Discord connection for pure local testing
SKIP_DISCORD=true

# Mock data and testing
ENABLE_MOCK_DATA=true
ENABLE_TEST_SCENARIOS=true

# Optional: Add real Discord token for Discord integration testing
# DISCORD_TOKEN=your_test_bot_token_here

# Optional: Add real channel IDs for integration testing
# ANALYSIS_CHANNEL_1_ID=your_test_channel_id
# ANALYSIS_CHANNEL_2_ID=your_test_channel_id
# GENERAL_NOTICES_CHANNEL_ID=your_test_channel_id

# Message Retention (shorter for local testing)
RETENTION_HOURS=24

# Admin's Discord ID for user creation (local testing)
ADMIN_DISCORD_ID=admin_local_123
`;

  fs.writeFileSync(envLocalPath, envLocalContent);
  Logger.info('✅ Created .env.local configuration file');
}

async function initializeLocalDatabase(): Promise<void> {
  Logger.info('🗄️ Initializing local SQLite database...');
  
  const modeManager = ModeManager.getInstance();
  const dbPath = modeManager.getSqlitePath();
  
  // Remove existing database if it exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    Logger.info(`🗑️ Removed existing database: ${dbPath}`);
  }
  
  // Create new database with test data
  const localDb = new LocalDatabaseService(dbPath);
  await localDb.connect();
  
  // Get test data summary
  const stats = await localDb.getTestDataSummary();
  Logger.info(`✅ Local database initialized with ${stats.users} users, ${stats.symbols} symbols`);
  
  await localDb.close();
}

async function runTestScenarios(): Promise<void> {
  Logger.info('🧪 Running test scenarios...');
  
  await LocalTestUtils.initializeTestEnvironment();
  
  // Run basic functionality test
  const basicTest = await LocalTestUtils.runBasicFunctionalityTest();
  if (!basicTest) {
    Logger.warn('⚠️ Basic functionality test failed');
  }
  
  // Run performance test with smaller dataset for setup
  const perfTest = await LocalTestUtils.runPerformanceTest(20);
  if (!perfTest) {
    Logger.warn('⚠️ Performance test below optimal levels');
  }
  
  // Display database stats
  const stats = await LocalTestUtils.getTestDatabaseStats();
  Logger.info(`📊 Test database contains: ${stats.users} users, ${stats.symbols} symbols, ${stats.analyses} analyses`);
  
  await LocalTestUtils.cleanupTestEnvironment();
}

async function validateSetup(): Promise<boolean> {
  Logger.info('🔍 Validating local setup...');
  
  try {
    const modeManager = ModeManager.getInstance();
    const validation = modeManager.validateEnvironment();
    
    if (validation.valid) {
      Logger.info('✅ Environment validation passed');
      return true;
    } else {
      Logger.warn('⚠️ Environment validation warnings:');
      validation.errors.forEach(error => Logger.warn(`   - ${error}`));
      return false;
    }
  } catch (error) {
    Logger.error('❌ Setup validation failed:', error);
    return false;
  }
}

// Run setup if this script is executed directly
if (require.main === module) {
  setupLocalEnvironment()
    .then(async () => {
      await validateSetup();
      process.exit(0);
    })
    .catch((error) => {
      Logger.error('Setup failed:', error);
      process.exit(1);
    });
}

export { setupLocalEnvironment, createLocalEnvFile, initializeLocalDatabase };