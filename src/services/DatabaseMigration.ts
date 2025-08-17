import { DatabaseService, AnalysisData } from './DatabaseService';
import { AnalysisLinker } from './AnalysisLinker';
import { Logger } from '../utils/Logger';

export class DatabaseMigration {
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  async migrateFromMemoryToDatabase(analysisLinker: AnalysisLinker): Promise<void> {
    Logger.info('Starting migration from memory to database...');

    try {
      // 1. Create Admin as initial user
      let adminUser = await this.databaseService.getUserByDiscordId(process.env.ADMIN_DISCORD_ID || 'admin_default');
      
      if (!adminUser) {
        adminUser = await this.databaseService.addUser(
          process.env.ADMIN_DISCORD_ID || 'admin_default',
          'Admin'
        );
        Logger.info(`Created user: ${adminUser.username} (ID: ${adminUser.id})`);
      }

      // 2. Get memory data using reflection
      const memoryData = this.extractMemoryData(analysisLinker);
      Logger.info(`Found ${memoryData.latestAnalysisCount} symbols in memory to migrate`);

      let migratedCount = 0;
      
      // 3. Migrate latestAnalysisMap data
      for (const [symbol, analysis] of memoryData.latestAnalysisMap) {
        try {
          const dbAnalysisData: AnalysisData = {
            messageUrl: analysis.messageUrl,
            content: analysis.content.substring(0, 1000), // Limit to 1000 chars
            confidence: analysis.relevanceScore,
            timestamp: analysis.timestamp
          };

          await this.databaseService.updateLatestAnalysis(symbol, adminUser.id, dbAnalysisData);
          migratedCount++;
          
          if (migratedCount % 10 === 0) {
            Logger.info(`Migrated ${migratedCount} symbols...`);
          }
        } catch (error) {
          Logger.error(`Failed to migrate symbol ${symbol}:`, error);
        }
      }

      // 4. Migrate historical cache data
      let historyCount = 0;
      for (const [symbol, analyses] of memoryData.analysisCache) {
        // Skip the latest one as it's already migrated
        const historicalAnalyses = analyses.slice(1);
        
        for (const analysis of historicalAnalyses) {
          try {
            const dbAnalysisData: AnalysisData = {
              messageUrl: analysis.messageUrl,
              content: analysis.content.substring(0, 1000),
              confidence: analysis.relevanceScore,
              timestamp: analysis.timestamp
            };

            await this.databaseService.updateLatestAnalysis(symbol, adminUser.id, dbAnalysisData);
            historyCount++;
          } catch (error) {
            // Skip duplicates or errors in historical data
            Logger.debug(`Skipped historical analysis for ${symbol}:`, error);
          }
        }
      }

      Logger.info(`✅ Migration completed successfully!`);
      Logger.info(`   - Migrated ${migratedCount} latest symbols`);
      Logger.info(`   - Migrated ${historyCount} historical analyses`);
      Logger.info(`   - User: ${adminUser.username} (${adminUser.discord_id})`);

    } catch (error) {
      Logger.error('❌ Migration failed:', error);
      throw error;
    }
  }

  private extractMemoryData(analysisLinker: AnalysisLinker): {
    latestAnalysisMap: Map<string, any>,
    analysisCache: Map<string, any[]>,
    latestAnalysisCount: number
  } {
    // Access private properties using type assertion
    const linkerAny = analysisLinker as any;
    
    return {
      latestAnalysisMap: linkerAny.latestAnalysisMap || new Map(),
      analysisCache: linkerAny.analysisCache || new Map(),
      latestAnalysisCount: linkerAny.latestAnalysisMap?.size || 0
    };
  }

  async verifyMigration(): Promise<{success: boolean, symbolCount: number, users: number}> {
    try {
      const analysts = await this.databaseService.getAnalysts();
      
      let totalSymbols = 0;
      for (const analyst of analysts) {
        const count = await this.databaseService.getUserAnalysisCount(analyst.id);
        totalSymbols += count;
      }

      Logger.info(`Migration verification:`);
      Logger.info(`  - Users: ${analysts.length}`);
      Logger.info(`  - Total symbols: ${totalSymbols}`);

      return {
        success: true,
        symbolCount: totalSymbols,
        users: analysts.length
      };
    } catch (error) {
      Logger.error('Migration verification failed:', error);
      return {
        success: false,
        symbolCount: 0,
        users: 0
      };
    }
  }
}