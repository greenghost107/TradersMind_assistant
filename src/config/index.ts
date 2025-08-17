import { config } from 'dotenv';
import { BotConfig } from '../types';
import { ModeManager, BotMode } from './ModeManager';
import { LocalConfig } from './modes/LocalConfig';
import { DebugConfig } from './modes/DebugConfig';
import { InfoConfig } from './modes/InfoConfig';
import { ProductionConfig } from './modes/ProductionConfig';

config();

export const ENV = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  ANALYSIS_CHANNEL_1_ID: process.env.ANALYSIS_CHANNEL_1_ID || '',
  ANALYSIS_CHANNEL_2_ID: process.env.ANALYSIS_CHANNEL_2_ID || '',
  GENERAL_NOTICES_CHANNEL_ID: process.env.GENERAL_NOTICES_CHANNEL_ID || '',
  MESSAGE_RETENTION_HOURS: parseInt(process.env.MESSAGE_RETENTION_HOURS || '26'),
  NODE_ENV: process.env.NODE_ENV || 'development'
};

export const getBotConfig = (): BotConfig | null => {
  const modeManager = ModeManager.getInstance();
  const currentMode = modeManager.getMode();

  // Mode-specific configuration
  switch (currentMode) {
    case BotMode.LOCAL:
      return LocalConfig.getBotConfig();
    
    case BotMode.DEBUG:
      return DebugConfig.getBotConfig();
    
    case BotMode.INFO:
      return InfoConfig.getBotConfig();
    
    case BotMode.PRODUCTION:
      return ProductionConfig.getBotConfig();
    
    default:
      // Fallback to original logic
      return getLegacyBotConfig();
  }
};

const getLegacyBotConfig = (): BotConfig | null => {
  if (!ENV.ANALYSIS_CHANNEL_1_ID || !ENV.ANALYSIS_CHANNEL_2_ID || !ENV.GENERAL_NOTICES_CHANNEL_ID) {
    return null;
  }
  
  return {
    analysisChannels: [ENV.ANALYSIS_CHANNEL_1_ID, ENV.ANALYSIS_CHANNEL_2_ID],
    generalNoticesChannel: ENV.GENERAL_NOTICES_CHANNEL_ID,
    retentionHours: ENV.MESSAGE_RETENTION_HOURS,
    guildId: '' // Not needed for env-based config
  };
};

export const COMMON_WORDS = new Set([
  'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR',
  'HAD', 'HAS', 'HIS', 'HOW', 'MAN', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WHO', 'BOY', 'DID',
  'ITS', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'DAY', 'GET', 'MAY', 'WAY', 'GOT', 'OUT',
  'TOP', 'RUN', 'TRY', 'WIN', 'YES', 'YET', 'BAD', 'BIG', 'END', 'FAR', 'FEW', 'LOT', 'OFF',
  'RED', 'SET', 'SIX', 'TEN', 'USD', 'CEO', 'IPO', 'SEC', 'FDA', 'API', 'URL', 'PDF', 'FAQ',
  'THE', 'THIS', 'THAT', 'WHAT', 'WHEN', 'WHERE', 'WHICH', 'WHILE', 'WITH', 'WILL', 'WELL',
  'VERY', 'THAN', 'THEY', 'THEM', 'THEN', 'THERE', 'THESE', 'THOSE', 'WANT', 'WORK', 'YEAR',
  'OVER', 'INTO', 'FROM', 'BEEN', 'HAVE', 'ONLY', 'SOME', 'TIME', 'BACK', 'AFTER', 'FIRST',
  'QUICK', 'BROWN', 'FOX', 'JUMPS', 'DIAMOND', 'HANDS'
]);

export const SYMBOL_PATTERN = /\b([A-Z]{1,5})\b/g;
export const MAX_DISCORD_BUTTONS = 25;

// Export mode-related utilities
export { ModeManager, BotMode } from './ModeManager';
export { LocalConfig } from './modes/LocalConfig';
export { DebugConfig } from './modes/DebugConfig';
export { InfoConfig } from './modes/InfoConfig';
export { ProductionConfig } from './modes/ProductionConfig';