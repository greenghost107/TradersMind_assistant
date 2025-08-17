import { getBotConfig } from '../index';
import { BotConfig } from '../../types';

export class InfoConfig {
  static getBotConfig(): BotConfig | null {
    // Use standard configuration
    return getBotConfig();
  }

  static getInfoSettings() {
    return {
      enableDetailedLogging: false,
      enableAnalysisLogging: false,
      enableInteractionLogging: false,
      enableUrlExtractionLogging: false,
      enableDatabaseLogging: false,
      enablePerformanceMetrics: false,
      
      // Info-level features
      logStartup: true,
      logErrors: true,
      logWarnings: true,
      logKeyEvents: true,
      
      // Minimal error reporting
      includeStackTraces: false,
      logErrorContext: false,
      enableDebugEndpoints: false
    };
  }

  static getBasicHealthCheck() {
    return {
      includeDetailed: false,
      includeMemoryUsage: false,
      includeDatabaseStats: true,
      includeMessageCounts: false,
      includeSymbolStats: true,
      includeAnalysisCache: false,
      includeErrorCounts: false,
      includePerformanceMetrics: false
    };
  }

  static getValidationRules() {
    return {
      requireDiscordToken: true,
      requireDatabaseUrl: false, // Optional - can fall back to memory
      requireChannelIds: true,
      allowFallbackToMemory: true,
      warnOnMissingOptional: false
    };
  }

  static getProductionOptimizations() {
    return {
      enableConnectionPooling: true,
      enableCaching: true,
      enableCompression: false, // For simplicity
      enableRateLimiting: false, // Discord.js handles this
      optimizeMemoryUsage: true,
      enableGracefulShutdown: true
    };
  }
}