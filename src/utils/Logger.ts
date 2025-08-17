export enum LogLevel {
  SILENT = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4
}

export class Logger {
  private static currentLevel: LogLevel = LogLevel.INFO;

  public static setLevel(level: LogLevel): void {
    Logger.currentLevel = level;
  }

  public static setLevelFromEnv(): void {
    const envLevel = process.env.DEBUG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case 'SILENT':
        Logger.setLevel(LogLevel.SILENT);
        break;
      case 'ERROR':
        Logger.setLevel(LogLevel.ERROR);
        break;
      case 'WARN':
        Logger.setLevel(LogLevel.WARN);
        break;
      case 'INFO':
        Logger.setLevel(LogLevel.INFO);
        break;
      case 'DEBUG':
        Logger.setLevel(LogLevel.DEBUG);
        break;
      default:
        Logger.setLevel(LogLevel.INFO);
    }
  }

  public static setLevelFromMode(mode: string): void {
    // Set log level based on bot mode
    switch (mode.toLowerCase()) {
      case 'local':
      case 'debug':
        Logger.setLevel(LogLevel.DEBUG);
        break;
      case 'info':
        Logger.setLevel(LogLevel.INFO);
        break;
      case 'production':
        Logger.setLevel(LogLevel.INFO);
        break;
      default:
        Logger.setLevel(LogLevel.INFO);
    }
  }

  private static shouldLog(level: LogLevel): boolean {
    return level <= Logger.currentLevel;
  }

  public static error(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.ERROR)) {
      console.error(`❌ ERROR: ${message}`, ...args);
    }
  }

  public static warn(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.WARN)) {
      console.warn(`⚠️ WARN: ${message}`, ...args);
    }
  }

  public static info(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.INFO)) {
      console.log(`ℹ️ INFO: ${message}`, ...args);
    }
  }

  public static debug(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.DEBUG)) {
      console.log(`🔍 DEBUG: ${message}`, ...args);
    }
  }

  // Specialized logging methods for different components
  public static botStartup(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.INFO)) {
      console.log(`🚀 ${message}`, ...args);
    }
  }

  public static analysis(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.DEBUG)) {
      console.log(`📊 ANALYSIS: ${message}`, ...args);
    }
  }

  public static interaction(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.DEBUG)) {
      console.log(`🎯 INTERACTION: ${message}`, ...args);
    }
  }

  public static urlExtraction(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.DEBUG)) {
      console.log(`🔗 URL: ${message}`, ...args);
    }
  }
}

// Initialize logger from environment on module load
Logger.setLevelFromEnv();