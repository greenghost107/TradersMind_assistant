import { getBotConfig } from '../index';
import { BotConfig } from '../../types';

export class DebugConfig {
  static getBotConfig(): BotConfig | null {
    // Use standard config but with enhanced debugging
    const baseConfig = getBotConfig();
    
    if (!baseConfig) {
      return null;
    }

    return {
      ...baseConfig,
      // Enhanced retention for debugging
      retentionHours: baseConfig.retentionHours * 2
    };
  }

  static getDebugSettings() {
    return {
      enableDetailedLogging: true,
      enableAnalysisLogging: true,
      enableInteractionLogging: true,
      enableUrlExtractionLogging: true,
      enableDatabaseLogging: true,
      enablePerformanceMetrics: true,
      
      // Debug-specific features
      logMessageContent: true,
      logUserInteractions: true,
      logButtonClicks: true,
      logChannelScanning: true,
      logSymbolDetection: true,
      
      // Enhanced error reporting
      includeStackTraces: true,
      logErrorContext: true,
      enableDebugEndpoints: true
    };
  }

  static getEnhancedHealthCheck() {
    return {
      includeDetailed: true,
      includeMemoryUsage: true,
      includeDatabaseStats: true,
      includeMessageCounts: true,
      includeSymbolStats: true,
      includeAnalysisCache: true,
      includeErrorCounts: true,
      includePerformanceMetrics: true
    };
  }

  static getValidationRules() {
    return {
      requireDiscordToken: true,
      requireDatabaseUrl: false, // Optional - can fall back to memory
      requireChannelIds: true,
      allowFallbackToMemory: true,
      warnOnMissingOptional: true
    };
  }

  static getDebugEndpoints() {
    return [
      '/debug/status',
      '/debug/memory', 
      '/debug/database',
      '/debug/analysis',
      '/debug/symbols',
      '/debug/errors',
      '/debug/performance'
    ];
  }
}