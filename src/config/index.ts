import { config } from 'dotenv';
import { BotConfig } from '../types';
import * as path from 'path';
import * as fs from 'fs';

// Load environment-specific .env file
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = `.env.${nodeEnv}`;
const envPath = path.resolve(process.cwd(), envFile);

// Check if environment-specific file exists, fallback to .env
if (fs.existsSync(envPath)) {
  config({ path: envPath });
  console.log(`🔧 Loaded environment config from ${envFile}`);
} else {
  config(); // Load default .env
  console.log(`🔧 Loaded environment config from .env (${envFile} not found)`);
}

export const ENV = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  LONG_ANALYSIS_CHANNEL: process.env.LONG_ANALYSIS_CHANNEL || '',
  SHORT_ANALYSIS_CHANNEL: process.env.SHORT_ANALYSIS_CHANNEL || '',
  LONG_DISCUSSION_CHANNEL: process.env.LONG_DISCUSSION_CHANNEL || '',
  SHORT_DISCUSSION_CHANNEL: process.env.SHORT_DISCUSSION_CHANNEL || '',
  MANAGER_GENERAL_MESSAGES_CHANNEL: process.env.MANAGER_GENERAL_MESSAGES_CHANNEL || '',
  DEALS_DISCUSSION_CHANNEL: process.env.DEALS_DISCUSSION_CHANNEL || '',
  MANAGER_ID: process.env.MANAGER_ID || '',
  NODE_ENV: process.env.NODE_ENV || 'development'
};

export const getBotConfig = (): BotConfig | null => {
  if (!ENV.LONG_ANALYSIS_CHANNEL || !ENV.SHORT_ANALYSIS_CHANNEL || !ENV.MANAGER_GENERAL_MESSAGES_CHANNEL) {
    return null;
  }
  
  // Parse discussion channels (optional)
  const discussionChannels: string[] = [];
  if (ENV.LONG_DISCUSSION_CHANNEL) discussionChannels.push(ENV.LONG_DISCUSSION_CHANNEL);
  if (ENV.SHORT_DISCUSSION_CHANNEL) discussionChannels.push(ENV.SHORT_DISCUSSION_CHANNEL);
  
  const config: BotConfig = {
    analysisChannels: [ENV.LONG_ANALYSIS_CHANNEL, ENV.SHORT_ANALYSIS_CHANNEL],
    discussionChannels,
    generalNoticesChannel: ENV.MANAGER_GENERAL_MESSAGES_CHANNEL,
    guildId: '' // Not needed for env-based config
  };
  
  if (ENV.MANAGER_ID) {
    config.managerId = ENV.MANAGER_ID;
  }
  
  if (ENV.DEALS_DISCUSSION_CHANNEL) {
    config.dealsChannel = ENV.DEALS_DISCUSSION_CHANNEL;
  }
  
  return config;
};

export const COMMON_WORDS = new Set([
  'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR',
  'HAD', 'HAS', 'HIS', 'HOW', 'MAN', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WHO', 'BOY', 'DID',
  'ITS', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'DAY', 'GET', 'MAY', 'WAY', 'GOT', 'OUT',
  'TOP', 'RUN', 'TRY', 'WIN', 'YES', 'YET', 'BAD', 'BIG', 'END', 'FAR', 'FEW', 'LOT', 'OFF',
  'RED', 'SET', 'SIX', 'TEN', 'USD', 'CEO', 'IPO', 'SEC', 'FDA', 'API', 'URL', 'PDF', 'FAQ', 'AVWAP',
  'THE', 'THIS', 'THAT', 'WHAT', 'WHEN', 'WHERE', 'WHICH', 'WHILE', 'WITH', 'WILL', 'WELL',
  'VERY', 'THAN', 'THEY', 'THEM', 'THEN', 'THERE', 'THESE', 'THOSE', 'WANT', 'WORK', 'YEAR',
  'OVER', 'INTO', 'FROM', 'BEEN', 'HAVE', 'ONLY', 'SOME', 'TIME', 'BACK', 'AFTER', 'FIRST',
  'QUICK', 'BROWN', 'FOX', 'JUMPS', 'DIAMOND', 'HANDS',
  // Discord platform noise
  'HTTPS', 'COM', 'DISCORD', 'CHANNELS', 'EVERYONE',
  // Common English trading noise
  'EARNING', 'GAP', 'WATCH', 'LEADERS', 'FOLLOW', 'ADVANCE', 'PRO', 'INVESTING', 'STRENGTH',
  'ACTION', 'BOUNCE', 'PLAN', 'STATUS', 'SECTOR', 'PLAY', 'STOCK', 'YOUR', 'AGAINST'
]);

// Hebrew stopwords - high-frequency generic words with little trading value
export const HEBREW_STOPWORDS = new Set([
  'של', 'על', 'עם', 'מה', 'לא', 'את', 'זה', 'כל', 'היום', 'עוד', 'חדש', 'מקום',
  'הזה', 'שלה', 'חלק', 'יש', 'אני', 'פה', 'רק', 'אתמול', 'לאחר', 'חדשים', 
  'שלא', 'האחרון', 'לב', 'לעבר', 'לשבוע', 'חודשים', 'מניות', 'שלוש', 'שנים',
  'תמיד', 'יותר', 'יכול', 'יכולה', 'יכולות', 'כאן', 'כבר', 'כדי', 'ככה', 'כמה',
  'כמו', 'כרגע', 'להיות', 'ללא', 'לנו', 'לפני', 'לראות', 'לשכוח', 'לתת',
  'מאוד', 'מאז', 'משהו', 'נהדר', 'נוסף', 'סוחרים', 'עבודה', 'עד', 'עליו',
  'פני', 'ראשון', 'רביעי', 'שבו', 'שבועות', 'שהוא', 'שהיא', 'שום', 'שזה',
  'שימו', 'שלום', 'שם', 'שני', 'תוך'
]);

export const SYMBOL_PATTERN = /\b([A-Z]{1,5})\b/g;
export const MAX_DISCORD_BUTTONS = 25;
export const DAYS_TO_SCRAPE = 14;

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
    'ATH',
    '✅',
    // Discovered high-value trading terms
    'ווינרס',
    'קנדל',
    'אינסייד',
    'רייד',
    'סקייס',
    'באונס',
    'והמשכיות',
    'הפריצה',
    'לבלו',
    'הממוצע'
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
    'פוקוס',
    // Additional discovered medium-value terms
    'קונסולידציה',
    'פולבק',
    'נראה',
    'נראו',
    'מזכיר',
    'מחיר',
    'ממשיכה',
    'מניה',
    'מעלה',
    'מעניין',
    'מקו',
    'נסחרת',
    'נר',
    'נשבר',
    'נשמר',
    'סגירה',
    'סטייג',
    'פורצת',
    'פותחת',
    'פיבוט',
    'קו',
    'ריטסט',
    'תנועה'
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