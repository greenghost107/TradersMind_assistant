import { Pool, PoolClient } from 'pg';

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

export class DatabaseService {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 50, // Max 50 connections (well under 100 limit)
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.pool.connect();
      console.log('✅ Database connected successfully');
      await this.createTables();
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Users table (analysts only)
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          discord_id VARCHAR(20) UNIQUE NOT NULL,
          username VARCHAR(50) NOT NULL,
          is_active BOOLEAN DEFAULT TRUE
        );
      `);

      // 2. Symbols table (latest analysis per user)
      await client.query(`
        CREATE TABLE IF NOT EXISTS symbols (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(10) NOT NULL,
          user_id INTEGER REFERENCES users(id),
          message_url TEXT NOT NULL,
          content TEXT,
          confidence FLOAT NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(symbol, user_id)
        );
      `);

      // 3. Analysis history (limited retention)
      await client.query(`
        CREATE TABLE IF NOT EXISTS analysis_history (
          id SERIAL PRIMARY KEY,
          symbol_id INTEGER REFERENCES symbols(id),
          message_url TEXT UNIQUE NOT NULL,
          content TEXT,
          timestamp TIMESTAMP NOT NULL
        );
      `);

      // Minimal indexes only
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_symbols_symbol ON symbols(symbol);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
      `);

      await client.query('COMMIT');
      console.log('✅ Database tables created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to create tables:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // User management
  async getUserByDiscordId(discordId: string): Promise<User | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM users WHERE discord_id = $1',
        [discordId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async addUser(discordId: string, username: string): Promise<User> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO users (discord_id, username) VALUES ($1, $2) RETURNING *',
        [discordId, username]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getAnalysts(): Promise<User[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM users WHERE is_active = TRUE ORDER BY username'
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Symbol operations (user-specific)
  async getLatestAnalysis(symbol: string, userId?: number): Promise<AnalysisData | null> {
    const client = await this.pool.connect();
    try {
      let query = `
        SELECT s.message_url, s.content, s.confidence, s.updated_at as timestamp
        FROM symbols s
        WHERE s.symbol = $1
      `;
      const params = [symbol];

      if (userId) {
        query += ' AND s.user_id = $2';
        params.push(userId.toString());
      }

      query += ' ORDER BY s.updated_at DESC LIMIT 1';

      const result = await client.query(query, params);
      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        messageUrl: row.message_url,
        content: row.content,
        confidence: row.confidence,
        timestamp: row.timestamp
      };
    } finally {
      client.release();
    }
  }

  async updateLatestAnalysis(symbol: string, userId: number, data: AnalysisData): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Insert or update latest analysis
      await client.query(`
        INSERT INTO symbols (symbol, user_id, message_url, content, confidence, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (symbol, user_id)
        DO UPDATE SET 
          message_url = EXCLUDED.message_url,
          content = EXCLUDED.content,
          confidence = EXCLUDED.confidence,
          updated_at = EXCLUDED.updated_at
      `, [symbol, userId, data.messageUrl, data.content, data.confidence, data.timestamp]);

      // Get symbol_id for history
      const symbolResult = await client.query(
        'SELECT id FROM symbols WHERE symbol = $1 AND user_id = $2',
        [symbol, userId]
      );
      const symbolId = symbolResult.rows[0].id;

      // Add to history
      await client.query(`
        INSERT INTO analysis_history (symbol_id, message_url, content, timestamp)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (message_url) DO NOTHING
      `, [symbolId, data.messageUrl, data.content, data.timestamp]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAnalysisHistory(symbol: string, userId?: number): Promise<AnalysisData[]> {
    const client = await this.pool.connect();
    try {
      let query = `
        SELECT ah.message_url, ah.content, s.confidence, ah.timestamp
        FROM analysis_history ah
        JOIN symbols s ON ah.symbol_id = s.id
        WHERE s.symbol = $1
      `;
      const params = [symbol];

      if (userId) {
        query += ' AND s.user_id = $2';
        params.push(userId.toString());
      }

      query += ' ORDER BY ah.timestamp DESC';

      const result = await client.query(query, params);
      return result.rows.map(row => ({
        messageUrl: row.message_url,
        content: row.content,
        confidence: row.confidence,
        timestamp: row.timestamp
      }));
    } finally {
      client.release();
    }
  }

  // Multi-user queries
  async getAllAnalystsForSymbol(symbol: string): Promise<{user: User, analysis: AnalysisData}[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          u.id, u.discord_id, u.username, u.is_active,
          s.message_url, s.content, s.confidence, s.updated_at as timestamp
        FROM symbols s
        JOIN users u ON s.user_id = u.id
        WHERE s.symbol = $1 AND u.is_active = TRUE
        ORDER BY s.updated_at DESC
      `, [symbol]);

      return result.rows.map(row => ({
        user: {
          id: row.id,
          discord_id: row.discord_id,
          username: row.username,
          is_active: row.is_active
        },
        analysis: {
          messageUrl: row.message_url,
          content: row.content,
          confidence: row.confidence,
          timestamp: row.timestamp
        }
      }));
    } finally {
      client.release();
    }
  }

  async getUserAnalysisCount(userId: number): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT COUNT(*) as count FROM symbols WHERE user_id = $1',
        [userId]
      );
      return parseInt(result.rows[0].count);
    } finally {
      client.release();
    }
  }

  // Cleanup operations
  async cleanupOldAnalysis(daysToKeep: number = 180): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        DELETE FROM analysis_history 
        WHERE timestamp < NOW() - INTERVAL '${daysToKeep} days'
      `);
      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  // Health check
  async getConnectionInfo(): Promise<{totalConnections: number, idleConnections: number}> {
    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}