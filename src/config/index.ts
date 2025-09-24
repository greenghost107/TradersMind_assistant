import { config } from 'dotenv';
import { BotConfig } from '../types';

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

export const HEBREW_KEYWORDS = {
  strong: [
    'ברייקאאוט',
    'פריצה',
    'relative strength',
    'שיא',
    'ווליום',
    'ממוצע',
    'AVWAP',
    'EMA20',
    '50DMA',
    'HTF',
    'קו פריצה',
    'בלו סקייס',
    'אלכסון',
    'קונסולדיציה',
    'ריטטס',
    'אינסייד קנדל',
    'falling wedge',
    'ליברמור',
    'ATH'
  ],
  medium: [
    'עולה',
    'נע',
    'מעל',
    'שמירה',
    'המשכיות',
    'טרנד',
    'מומנטום',
    'סטאפ',
    'באונס',
    'כריטסט',
    'רייד ווינרס',
    'IBD50',
    'Sector Leaders',
    'פוקוס'
  ],
  weak: [
    'מניה',
    'מניית',
    'watch',
    'יום',
    'שבוע',
    'חדש',
    'נהדר'
  ]
};