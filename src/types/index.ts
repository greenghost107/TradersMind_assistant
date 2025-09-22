export interface BotConfig {
  analysisChannels: string[];
  generalNoticesChannel: string;
  retentionHours: number;
  guildId: string;
}

export interface StockSymbol {
  symbol: string;
  confidence: number;
  position: number;
  priority: 'top_long' | 'top_short' | 'regular';
}

export interface AnalysisData {
  messageId: string;
  channelId: string;
  authorId: string;
  content: string;
  symbols: string[];
  timestamp: Date;
  relevanceScore: number;
  messageUrl?: string;
  chartUrls?: string[];
  attachmentUrls?: string[];
  hasCharts?: boolean;
}

export interface EphemeralInteraction {
  userId: string;
  messageId: string;
  timestamp: Date;
  symbols: string[];
}

export interface RetentionJob {
  messageId: string;
  channelId: string;
  createdAt: Date;
  deleteAt: Date;
}