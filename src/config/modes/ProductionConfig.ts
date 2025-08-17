import { getBotConfig } from '../index';
import { BotConfig } from '../../types';

export class ProductionConfig {
  static getBotConfig(): BotConfig | null {
    const baseConfig = getBotConfig();
    
    if (!baseConfig) {
      return null;
    }

    return {
      ...baseConfig,
      // Production-optimized retention
      retentionHours: baseConfig.retentionHours
    };
  }

  static getProductionSettings() {
    return {
      enableDetailedLogging: false,
      enableAnalysisLogging: false,
      enableInteractionLogging: false,
      enableUrlExtractionLogging: false,
      enableDatabaseLogging: false,
      enablePerformanceMetrics: true,
      
      // Production-level features
      logStartup: true,
      logErrors: true,
      logWarnings: true,
      logKeyEvents: true,
      logPerformanceAlerts: true,
      
      // Enhanced error reporting for production
      includeStackTraces: false,
      logErrorContext: true,
      enableDebugEndpoints: false,
      enableMonitoringEndpoints: true,
      
      // Production monitoring
      enableHealthChecks: true,
      enableUptimeMonitoring: true,
      enableErrorTracking: true,
      enableMetricsCollection: true
    };
  }

  static getProductionHealthCheck() {
    return {
      includeDetailed: false,
      includeMemoryUsage: true,
      includeDatabaseStats: true,
      includeMessageCounts: true,
      includeSymbolStats: true,
      includeAnalysisCache: false,
      includeErrorCounts: true,
      includePerformanceMetrics: true,
      includeUptimeStats: true,
      includeSystemHealth: true
    };
  }

  static getValidationRules() {
    return {
      requireDiscordToken: true,
      requireDatabaseUrl: true, // Required for production
      requireChannelIds: true,
      allowFallbackToMemory: false, // No fallback in production
      warnOnMissingOptional: true,
      strictValidation: true
    };
  }

  static getProductionOptimizations() {
    return {
      enableConnectionPooling: true,
      enableCaching: true,
      enableCompression: true,
      enableRateLimiting: true,
      optimizeMemoryUsage: true,
      enableGracefulShutdown: true,
      enableAutoRecovery: true,
      enableLoadBalancing: false, // Single instance for now
      
      // Database optimizations
      connectionPoolSize: 20,
      connectionTimeout: 5000,
      queryTimeout: 10000,
      enableQueryOptimization: true,
      
      // Performance monitoring
      enableMetrics: true,
      metricsInterval: 60000, // 1 minute
      enableProfiling: false,
      enableTracing: false
    };
  }

  static getMonitoringEndpoints() {
    return [
      '/health',
      '/metrics',
      '/status',
      '/uptime'
    ];
  }

  static getSecuritySettings() {
    return {
      enableSecurityHeaders: true,
      enableCors: false, // Not needed for bot
      enableRequestLogging: true,
      enableSensitiveDataFiltering: true,
      
      // Error handling
      hideInternalErrors: true,
      sanitizeErrorMessages: true,
      enableErrorReporting: true
    };
  }
}