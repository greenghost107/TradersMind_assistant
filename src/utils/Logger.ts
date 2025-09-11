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

  private static shouldLog(level: LogLevel): boolean {
    return level <= Logger.currentLevel;
  }

  private static formatTimestamp(): string {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear().toString().slice(-2);
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');

        return `${day}/${month}/${year} ${hours}:${minutes}`;}

  public static error(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.ERROR)) {
      console.error(`[${Logger.formatTimestamp()}] ❌ ERROR: ${message}`, ...args);
    }
  }

  public static warn(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.WARN)) {
      console.warn(`[${Logger.formatTimestamp()}] ⚠️ WARN: ${message}`, ...args);
    }
  }

  public static info(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.INFO)) {
      console.log(`[${Logger.formatTimestamp()}] ℹ️ INFO: ${message}`, ...args);
    }
  }

  public static debug(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.DEBUG)) {
      console.log(`[${Logger.formatTimestamp()}] 🔍 DEBUG: ${message}`, ...args);
    }
  }

  // Specialized logging methods for different components
  public static botStartup(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.INFO)) {
      console.log(`[${Logger.formatTimestamp()}] 🚀 ${message}`, ...args);
    }
  }

  public static analysis(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.DEBUG)) {
      console.log(`[${Logger.formatTimestamp()}] 📊 ANALYSIS: ${message}`, ...args);
    }
  }

  public static interaction(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.DEBUG)) {
      console.log(`[${Logger.formatTimestamp()}] 🎯 INTERACTION: ${message}`, ...args);
    }
  }

  public static urlExtraction(message: string, ...args: any[]): void {
    if (Logger.shouldLog(LogLevel.DEBUG)) {
      console.log(`[${Logger.formatTimestamp()}] 🔗 URL: ${message}`, ...args);
    }
  }
}

// Initialize logger from environment on module load
Logger.setLevelFromEnv();