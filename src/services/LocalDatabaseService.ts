import { Database } from 'sqlite3';
import { promisify } from 'util';
import { Logger } from '../utils/Logger';

export interface User {
  id: number;
  discord_id: string;
  username: string;
  is_active: boolean;
}

export interface Symbol {
  id: number;
  symbol: string;
  user_id: number;
  message_url: string;
  content: string;
  confidence: number;
  updated_at: Date;
}

export interface AnalysisHistory {
  id: number;
  symbol_id: number;
  message_url: string;
  content: string;
  timestamp: Date;
}

export interface AnalysisData {
  messageUrl: string;
  content: string;
  confidence: number;
  timestamp: Date;
}

export class LocalDatabaseService {
  private db: Database;
  private dbPath: string;

  constructor(dbPath: string = './local_bot.db') {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.on('open', async () => {
        try {
          Logger.info(`✅ Local SQLite database connected: ${this.dbPath}`);
          await this.createTables();
          await this.seedTestData();
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      this.db.on('error', (error) => {
        Logger.error('❌ SQLite database error:', error);
        reject(error);
      });
    });
  }

  private async createTables(): Promise<void> {
    const runAsync = promisify(this.db.run.bind(this.db)) as any;

    try {
      // Enable foreign keys
      await runAsync('PRAGMA foreign_keys = ON');

      // 1. Users table (analysts only)
      await runAsync(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT UNIQUE NOT NULL,
          username TEXT NOT NULL,
          is_active BOOLEAN DEFAULT 1
        )
      `);

      // 2. Symbols table (latest analysis per user)
      await runAsync(`
        CREATE TABLE IF NOT EXISTS symbols (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          message_url TEXT NOT NULL,
          content TEXT,
          confidence REAL NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          UNIQUE(symbol, user_id)
        )
      `);

      // 3. Analysis history (limited retention)
      await runAsync(`
        CREATE TABLE IF NOT EXISTS analysis_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol_id INTEGER NOT NULL,
          message_url TEXT UNIQUE NOT NULL,
          content TEXT,
          timestamp DATETIME NOT NULL,
          FOREIGN KEY (symbol_id) REFERENCES symbols(id)
        )
      `);

      // Indexes for performance
      await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_symbol ON symbols(symbol)');
      await runAsync('CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id)');

      Logger.info('✅ Local database tables created successfully');
    } catch (error) {
      Logger.error('❌ Failed to create local database tables:', error);
      throw error;
    }
  }

  private async seedTestData(): Promise<void> {
    try {
      // Check if test data already exists
      const existingUsers = await this.getAnalysts();
      if (existingUsers.length > 0) {
        Logger.debug('Test data already exists, skipping seed');
        return;
      }

      Logger.info('Seeding local database with test data...');

      // Create test users
      const admin = await this.addUser('admin_local_123', 'Admin (Local)');
      const analyst = await this.addUser('analyst_local_456', 'Analyst (Local)');

      // Add test analysis data
      const testAnalyses = [
        {
          symbol: 'AAPL',
          user: admin,
          analysis: {
            messageUrl: 'local://test/message/1',
            content: 'AAPL showing strong bullish momentum above $185. Target $210 with stop at $175. Volume confirms breakout.',
            confidence: 0.85,
            timestamp: new Date('2025-01-15T09:30:00Z')
          }
        },
        {
          symbol: 'TSLA', 
          user: admin,
          analysis: {
            messageUrl: 'local://test/message/2',
            content: 'TSLA breaking key resistance at $250. Electric vehicle sector looking strong. PT $300.',
            confidence: 0.78,
            timestamp: new Date('2025-01-15T10:15:00Z')
          }
        },
        {
          symbol: 'NVDA',
          user: admin, 
          analysis: {
            messageUrl: 'local://test/message/3',
            content: 'NVDA consolidating before next AI earnings. Expect volatility. Watch $500 support.',
            confidence: 0.65,
            timestamp: new Date('2025-01-15T11:00:00Z')
          }
        },
        {
          symbol: 'AAPL',
          user: analyst,
          analysis: {
            messageUrl: 'local://test/message/4', 
            content: 'AAPL: Different perspective - overbought on RSI. Expecting pullback to $180 support level.',
            confidence: 0.72,
            timestamp: new Date('2025-01-15T14:00:00Z')
          }
        },
        {
          symbol: 'MSFT',
          user: analyst,
          analysis: {
            messageUrl: 'local://test/message/5',
            content: 'MSFT cloud growth story intact. Technical setup looks good for move to $380.',
            confidence: 0.80,
            timestamp: new Date('2025-01-15T15:30:00Z')
          }
        }
      ];

      for (const test of testAnalyses) {
        await this.updateLatestAnalysis(test.symbol, test.user.id, test.analysis);
      }

      Logger.info(`✅ Seeded ${testAnalyses.length} test analyses for local testing`);
    } catch (error) {
      Logger.error('❌ Failed to seed test data:', error);
      // Don't throw - seeding is optional
    }
  }

  // User management
  async getUserByDiscordId(discordId: string): Promise<User | null> {
    const getAsync = promisify(this.db.get.bind(this.db)) as any;
    
    try {
      const result = await getAsync(
        'SELECT * FROM users WHERE discord_id = ?',
        [discordId]
      ) as User | undefined;
      
      return result || null;
    } catch (error) {
      Logger.error('Failed to get user by Discord ID:', error);
      return null;
    }
  }

  async addUser(discordId: string, username: string): Promise<User> {
    const self = this;
    return new Promise((resolve, reject) => {
      self.db.run(
        'INSERT INTO users (discord_id, username) VALUES (?, ?)',
        [discordId, username],
        function(error) {
          if (error) {
            Logger.error('Failed to add user:', error);
            reject(error);
            return;
          }

          const insertId = this.lastID;
          
          self.db.get(
            'SELECT * FROM users WHERE id = ?',
            [insertId],
            (getError: any, user: User) => {
              if (getError) {
                reject(getError);
              } else {
                resolve(user);
              }
            }
          );
        }
      );
    });
  }

  async getAnalysts(): Promise<User[]> {
    const allAsync = promisify(this.db.all.bind(this.db)) as any;

    try {
      const result = await allAsync(
        'SELECT * FROM users WHERE is_active = 1 ORDER BY username'
      ) as User[];

      return result;
    } catch (error) {
      Logger.error('Failed to get analysts:', error);
      return [];
    }
  }

  // Symbol operations (user-specific)
  async getLatestAnalysis(symbol: string, userId?: number): Promise<AnalysisData | null> {
    const getAsync = promisify(this.db.get.bind(this.db)) as any;

    try {
      let query = `
        SELECT message_url, content, confidence, updated_at as timestamp
        FROM symbols
        WHERE symbol = ?
      `;
      const params: any[] = [symbol];

      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }

      query += ' ORDER BY updated_at DESC LIMIT 1';

      const result = await getAsync(query, params) as any;
      
      if (!result) return null;

      return {
        messageUrl: result.message_url,
        content: result.content,
        confidence: result.confidence,
        timestamp: new Date(result.timestamp)
      };
    } catch (error) {
      Logger.error('Failed to get latest analysis:', error);
      return null;
    }
  }

  async updateLatestAnalysis(symbol: string, userId: number, data: AnalysisData): Promise<void> {
    const runAsync = promisify(this.db.run.bind(this.db)) as any;
    const getAsync = promisify(this.db.get.bind(this.db)) as any;

    try {
      await runAsync('BEGIN TRANSACTION');

      // Insert or update latest analysis
      await runAsync(`
        INSERT OR REPLACE INTO symbols (symbol, user_id, message_url, content, confidence, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [symbol, userId, data.messageUrl, data.content, data.confidence, data.timestamp.toISOString()]);

      // Get symbol_id for history
      const symbolResult = await getAsync(
        'SELECT id FROM symbols WHERE symbol = ? AND user_id = ?',
        [symbol, userId]
      ) as { id: number };

      // Add to history (ignore duplicates)
      await runAsync(`
        INSERT OR IGNORE INTO analysis_history (symbol_id, message_url, content, timestamp)
        VALUES (?, ?, ?, ?)
      `, [symbolResult.id, data.messageUrl, data.content, data.timestamp.toISOString()]);

      await runAsync('COMMIT');
    } catch (error) {
      await runAsync('ROLLBACK');
      Logger.error('Failed to update latest analysis:', error);
      throw error;
    }
  }

  async getAnalysisHistory(symbol: string, userId?: number): Promise<AnalysisData[]> {
    const allAsync = promisify(this.db.all.bind(this.db)) as any;

    try {
      let query = `
        SELECT ah.message_url, ah.content, s.confidence, ah.timestamp
        FROM analysis_history ah
        JOIN symbols s ON ah.symbol_id = s.id
        WHERE s.symbol = ?
      `;
      const params: any[] = [symbol];

      if (userId) {
        query += ' AND s.user_id = ?';
        params.push(userId);
      }

      query += ' ORDER BY ah.timestamp DESC';

      const result = await allAsync(query, params) as any[];
      
      return result.map(row => ({
        messageUrl: row.message_url,
        content: row.content,
        confidence: row.confidence,
        timestamp: new Date(row.timestamp)
      }));
    } catch (error) {
      Logger.error('Failed to get analysis history:', error);
      return [];
    }
  }

  // Multi-user queries
  async getAllAnalystsForSymbol(symbol: string): Promise<{user: User, analysis: AnalysisData}[]> {
    const allAsync = promisify(this.db.all.bind(this.db)) as any;

    try {
      const result = await allAsync(`
        SELECT 
          u.id, u.discord_id, u.username, u.is_active,
          s.message_url, s.content, s.confidence, s.updated_at as timestamp
        FROM symbols s
        JOIN users u ON s.user_id = u.id
        WHERE s.symbol = ? AND u.is_active = 1
        ORDER BY s.updated_at DESC
      `, [symbol]) as any[];

      return result.map(row => ({
        user: {
          id: row.id,
          discord_id: row.discord_id,
          username: row.username,
          is_active: Boolean(row.is_active)
        },
        analysis: {
          messageUrl: row.message_url,
          content: row.content,
          confidence: row.confidence,
          timestamp: new Date(row.timestamp)
        }
      }));
    } catch (error) {
      Logger.error('Failed to get all analysts for symbol:', error);
      return [];
    }
  }

  async getUserAnalysisCount(userId: number): Promise<number> {
    const getAsync = promisify(this.db.get.bind(this.db)) as any;

    try {
      const result = await getAsync(
        'SELECT COUNT(*) as count FROM symbols WHERE user_id = ?',
        [userId]
      ) as { count: number };

      return result.count;
    } catch (error) {
      Logger.error('Failed to get user analysis count:', error);
      return 0;
    }
  }

  // Cleanup operations
  async cleanupOldAnalysis(daysToKeep: number = 180): Promise<number> {
    const runAsync = promisify(this.db.run.bind(this.db)) as any;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await runAsync(
        `DELETE FROM analysis_history WHERE timestamp < ?`,
        [cutoffDate.toISOString()]
      );

      return result.changes || 0;
    } catch (error) {
      Logger.error('Failed to cleanup old analysis:', error);
      return 0;
    }
  }

  // Health check
  async getConnectionInfo(): Promise<{totalConnections: number, idleConnections: number}> {
    // SQLite doesn't have connection pooling like PostgreSQL
    return {
      totalConnections: 1,
      idleConnections: 0
    };
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((error) => {
        if (error) {
          Logger.error('Failed to close SQLite database:', error);
          reject(error);
        } else {
          Logger.info('SQLite database connection closed');
          resolve();
        }
      });
    });
  }

  // Local-specific utilities
  async getTestDataSummary(): Promise<{users: number, symbols: number, analyses: number}> {
    const getAsync = promisify(this.db.get.bind(this.db)) as any;

    try {
      const [users, symbols, analyses] = await Promise.all([
        getAsync('SELECT COUNT(*) as count FROM users') as Promise<{count: number}>,
        getAsync('SELECT COUNT(*) as count FROM symbols') as Promise<{count: number}>,
        getAsync('SELECT COUNT(*) as count FROM analysis_history') as Promise<{count: number}>
      ]);

      return {
        users: users.count,
        symbols: symbols.count,
        analyses: analyses.count
      };
    } catch (error) {
      Logger.error('Failed to get test data summary:', error);
      return { users: 0, symbols: 0, analyses: 0 };
    }
  }

  async resetTestData(): Promise<void> {
    const runAsync = promisify(this.db.run.bind(this.db)) as any;

    try {
      await runAsync('BEGIN TRANSACTION');
      await runAsync('DELETE FROM analysis_history');
      await runAsync('DELETE FROM symbols');
      await runAsync('DELETE FROM users');
      await runAsync('COMMIT');

      Logger.info('✅ Test data reset successfully');
      await this.seedTestData();
    } catch (error) {
      await runAsync('ROLLBACK');
      Logger.error('Failed to reset test data:', error);
      throw error;
    }
  }
}