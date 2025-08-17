export enum BotMode {
  INFO = 'info',
  DEBUG = 'debug', 
  LOCAL = 'local',
  PRODUCTION = 'production'
}

export interface ModeConfig {
  mode: BotMode;
  databaseType: 'postgresql' | 'sqlite' | 'memory';
  logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug';
  healthPort: number;
  requiresDiscordToken: boolean;
  requiresDatabaseUrl: boolean;
  enableMockData: boolean;
  enablePerformanceMonitoring: boolean;
  enableDetailedLogging: boolean;
}

export class ModeManager {
  private static instance: ModeManager;
  private currentMode: BotMode;
  private modeConfig: ModeConfig;

  private constructor() {
    this.currentMode = this.detectModeFromEnvironment();
    this.modeConfig = this.createModeConfig(this.currentMode);
  }

  public static getInstance(): ModeManager {
    if (!ModeManager.instance) {
      ModeManager.instance = new ModeManager();
    }
    return ModeManager.instance;
  }

  private detectModeFromEnvironment(): BotMode {
    const envMode = process.env.BOT_MODE?.toLowerCase();
    
    switch (envMode) {
      case 'info':
        return BotMode.INFO;
      case 'debug':
        return BotMode.DEBUG;
      case 'local':
        return BotMode.LOCAL;
      case 'production':
        return BotMode.PRODUCTION;
      default:
        // Auto-detect based on environment
        if (process.env.NODE_ENV === 'production') {
          return BotMode.PRODUCTION;
        } else if (process.env.DATABASE_URL && process.env.DISCORD_TOKEN) {
          return BotMode.INFO;
        } else {
          return BotMode.LOCAL;
        }
    }
  }

  private createModeConfig(mode: BotMode): ModeConfig {
    const baseConfig = {
      mode,
      healthPort: parseInt(process.env.PORT || '10000'),
      enableMockData: false,
      enablePerformanceMonitoring: false,
      enableDetailedLogging: false
    };

    switch (mode) {
      case BotMode.INFO:
        return {
          ...baseConfig,
          databaseType: process.env.DATABASE_URL ? 'postgresql' : 'memory',
          logLevel: 'info',
          requiresDiscordToken: true,
          requiresDatabaseUrl: false,
          enableDetailedLogging: false
        };

      case BotMode.DEBUG:
        return {
          ...baseConfig,
          databaseType: process.env.DATABASE_URL ? 'postgresql' : 'memory',
          logLevel: 'debug',
          requiresDiscordToken: true,
          requiresDatabaseUrl: false,
          enableDetailedLogging: true
        };

      case BotMode.LOCAL:
        return {
          ...baseConfig,
          databaseType: 'sqlite',
          logLevel: 'debug',
          healthPort: parseInt(process.env.LOCAL_PORT || '3000'),
          requiresDiscordToken: false,
          requiresDatabaseUrl: false,
          enableMockData: true,
          enableDetailedLogging: true
        };

      case BotMode.PRODUCTION:
        return {
          ...baseConfig,
          databaseType: 'postgresql',
          logLevel: 'info',
          requiresDiscordToken: true,
          requiresDatabaseUrl: true,
          enablePerformanceMonitoring: true
        };

      default:
        return {
          ...baseConfig,
          databaseType: 'memory',
          logLevel: 'info',
          requiresDiscordToken: false,
          requiresDatabaseUrl: false
        };
    }
  }

  public getMode(): BotMode {
    return this.currentMode;
  }

  public getConfig(): ModeConfig {
    return this.modeConfig;
  }

  public isLocalMode(): boolean {
    return this.currentMode === BotMode.LOCAL;
  }

  public isProductionMode(): boolean {
    return this.currentMode === BotMode.PRODUCTION;
  }

  public isDebugMode(): boolean {
    return this.currentMode === BotMode.DEBUG;
  }

  public shouldUseMockData(): boolean {
    return this.modeConfig.enableMockData;
  }

  public shouldEnablePerformanceMonitoring(): boolean {
    return this.modeConfig.enablePerformanceMonitoring;
  }

  public validateEnvironment(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = this.modeConfig;

    // Check Discord token requirement
    if (config.requiresDiscordToken && !process.env.DISCORD_TOKEN) {
      errors.push(`${this.currentMode} mode requires DISCORD_TOKEN environment variable`);
    }

    // Check database URL requirement
    if (config.requiresDatabaseUrl && !process.env.DATABASE_URL) {
      errors.push(`${this.currentMode} mode requires DATABASE_URL environment variable`);
    }

    // Check SQLite path for local mode
    if (config.databaseType === 'sqlite' && !this.getSqlitePath()) {
      errors.push(`${this.currentMode} mode requires LOCAL_DB_PATH or default SQLite path`);
    }

    // Check channel configuration for non-local modes
    if (!this.isLocalMode()) {
      const requiredChannels = [
        'ANALYSIS_CHANNEL_1_ID',
        'ANALYSIS_CHANNEL_2_ID', 
        'GENERAL_NOTICES_CHANNEL_ID'
      ];

      for (const channel of requiredChannels) {
        if (!process.env[channel]) {
          errors.push(`${this.currentMode} mode requires ${channel} environment variable`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  public getSqlitePath(): string {
    return process.env.LOCAL_DB_PATH || './local_bot.db';
  }

  public getHealthPort(): number {
    return this.modeConfig.healthPort;
  }

  public getLogLevel(): string {
    return this.modeConfig.logLevel;
  }

  public getDatabaseType(): 'postgresql' | 'sqlite' | 'memory' {
    return this.modeConfig.databaseType;
  }

  public getModeInfo(): { mode: string; config: ModeConfig; validation: { valid: boolean; errors: string[] } } {
    return {
      mode: this.currentMode,
      config: this.modeConfig,
      validation: this.validateEnvironment()
    };
  }

  public static getAvailableModes(): string[] {
    return Object.values(BotMode);
  }

  public static getModeDescription(mode: BotMode): string {
    switch (mode) {
      case BotMode.INFO:
        return 'Production-ready with minimal logging, PostgreSQL or memory fallback';
      case BotMode.DEBUG:
        return 'Detailed logging for troubleshooting, PostgreSQL or memory fallback';
      case BotMode.LOCAL:
        return 'Complete local testing with SQLite, mock data, no external dependencies';
      case BotMode.PRODUCTION:
        return 'Optimized production with monitoring, requires PostgreSQL';
      default:
        return 'Unknown mode';
    }
  }
}