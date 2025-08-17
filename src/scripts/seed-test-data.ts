#!/usr/bin/env ts-node

import { config } from 'dotenv';
import { LocalDatabaseService } from '../services/LocalDatabaseService';
import { Logger } from '../utils/Logger';
import { ModeManager } from '../config/ModeManager';

// Load environment variables
config();

interface TestAnalysis {
  symbol: string;
  analyst: string;
  content: string;
  confidence: number;
  timestamp: Date;
}

async function seedTestData(): Promise<void> {
  Logger.info('🌱 Seeding test data for local development...');
  
  try {
    const modeManager = ModeManager.getInstance();
    
    if (!modeManager.isLocalMode()) {
      Logger.error('❌ Can only seed test data in local mode');
      process.exit(1);
    }
    
    const dbPath = modeManager.getSqlitePath();
    const localDb = new LocalDatabaseService(dbPath);
    await localDb.connect();
    
    // Reset existing data
    await localDb.resetTestData();
    
    // Create additional test analysts
    const analysts = [
      { discordId: 'admin_local_123', username: 'Admin (Local)' },
      { discordId: 'tomer_local_456', username: 'Tomer (Local)' },
      { discordId: 'analyst_test_789', username: 'Test Analyst' }
    ];
    
    const createdAnalysts = [];
    for (const analyst of analysts) {
      const user = await localDb.addUser(analyst.discordId, analyst.username);
      createdAnalysts.push(user);
      Logger.info(`👤 Created analyst: ${user.username}`);
    }
    
    // Generate comprehensive test analysis data
    const testAnalyses = generateTestAnalyses();
    
    let analysisCount = 0;
    for (const analysis of testAnalyses) {
      const analyst = createdAnalysts.find(a => a.username.includes(analysis.analyst));
      if (analyst) {
        await localDb.updateLatestAnalysis(analysis.symbol, analyst.id, {
          messageUrl: `local://test/analysis/${analysisCount + 1}`,
          content: analysis.content,
          confidence: analysis.confidence,
          timestamp: analysis.timestamp
        });
        analysisCount++;
      }
    }
    
    // Display summary
    const stats = await localDb.getTestDataSummary();
    Logger.info('✅ Test data seeding completed:');
    Logger.info(`   - Analysts: ${stats.users}`);
    Logger.info(`   - Symbols: ${stats.symbols}`);
    Logger.info(`   - Analyses: ${stats.analyses}`);
    
    await localDb.close();
    
  } catch (error) {
    Logger.error('❌ Failed to seed test data:', error);
    process.exit(1);
  }
}

function generateTestAnalyses(): TestAnalysis[] {
  const analyses: TestAnalysis[] = [];
  
  // Popular stocks with different analysts' perspectives
  const stocks = [
    {
      symbol: 'AAPL',
      scenarios: [
        {
          analyst: 'Admin',
          content: 'AAPL showing strong bullish momentum above $185. Breaking key resistance with volume. Target $210 with stop at $175. iPhone sales cycle looking strong.',
          confidence: 0.85,
          timeOffset: -120 // 2 hours ago
        },
        {
          analyst: 'Tomer',
          content: 'AAPL technical setup: RSI overbought but trend intact. Expecting pullback to $180 support before next leg up. Good risk/reward at support.',
          confidence: 0.72,
          timeOffset: -45 // 45 minutes ago
        }
      ]
    },
    {
      symbol: 'TSLA',
      scenarios: [
        {
          analyst: 'Admin',
          content: 'TSLA breaking $250 resistance after earnings beat. EV sector rotation beginning. PT $300 on delivery growth. Watch for momentum continuation.',
          confidence: 0.78,
          timeOffset: -180 // 3 hours ago
        },
        {
          analyst: 'Test Analyst',
          content: 'TSLA: Volatile but trending higher. Autonomous driving catalyst potential. Risk management crucial with this name due to Musk factor.',
          confidence: 0.65,
          timeOffset: -90 // 1.5 hours ago
        }
      ]
    },
    {
      symbol: 'NVDA',
      scenarios: [
        {
          analyst: 'Admin',
          content: 'NVDA consolidating before AI earnings. Expecting volatility around $500 level. Data center demand remains strong. Setup for breakout.',
          confidence: 0.80,
          timeOffset: -240 // 4 hours ago
        },
        {
          analyst: 'Tomer',
          content: 'NVDA: AI bubble concerns vs. fundamental growth. Technical levels at $480 support, $520 resistance. Playing the range for now.',
          confidence: 0.68,
          timeOffset: -30 // 30 minutes ago
        }
      ]
    },
    {
      symbol: 'MSFT',
      scenarios: [
        {
          analyst: 'Tomer',
          content: 'MSFT cloud growth story intact. Azure competing well with AWS. Technical setup bullish above $380. Less volatile than other mega caps.',
          confidence: 0.82,
          timeOffset: -300 // 5 hours ago
        }
      ]
    },
    {
      symbol: 'GOOGL',
      scenarios: [
        {
          analyst: 'Admin',
          content: 'GOOGL search dominance + AI integration story. Regulatory overhang but fundamentals strong. $140 key support, $160 target.',
          confidence: 0.75,
          timeOffset: -360 // 6 hours ago
        }
      ]
    },
    {
      symbol: 'AMZN',
      scenarios: [
        {
          analyst: 'Test Analyst',
          content: 'AMZN e-commerce recovery + AWS growth. Efficiency improvements showing in margins. Technical breakout above $150 targeting $170.',
          confidence: 0.70,
          timeOffset: -420 // 7 hours ago
        }
      ]
    },
    {
      symbol: 'META',
      scenarios: [
        {
          analyst: 'Admin',
          content: 'META VR/AR investment starting to pay off. Ad revenue stable. Cost cutting effective. $320 resistance, $280 support levels to watch.',
          confidence: 0.73,
          timeOffset: -150 // 2.5 hours ago
        }
      ]
    },
    {
      symbol: 'NFLX',
      scenarios: [
        {
          analyst: 'Tomer',
          content: 'NFLX password sharing crackdown boosting subs. Content costs stabilizing. Streaming wars intensifying but NFLX maintaining edge.',
          confidence: 0.67,
          timeOffset: -200 // ~3.3 hours ago
        }
      ]
    }
  ];
  
  // Generate analyses with realistic timestamps
  const now = new Date();
  stocks.forEach(stock => {
    stock.scenarios.forEach(scenario => {
      analyses.push({
        symbol: stock.symbol,
        analyst: scenario.analyst,
        content: scenario.content,
        confidence: scenario.confidence,
        timestamp: new Date(now.getTime() + scenario.timeOffset * 60000) // Convert minutes to milliseconds
      });
    });
  });
  
  // Add some historical analyses (older timestamps)
  const historicalAnalyses: TestAnalysis[] = [
    {
      symbol: 'SPY',
      analyst: 'Admin',
      content: 'SPY testing key 4200 resistance. Market breadth improving. Fed policy supportive. Bull market continuation likely.',
      confidence: 0.77,
      timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000) // 1 day ago
    },
    {
      symbol: 'QQQ',
      analyst: 'Tomer', 
      content: 'QQQ tech rally sustainable? Growth vs value rotation key theme. Watch 10-year yields for direction.',
      confidence: 0.69,
      timestamp: new Date(now.getTime() - 18 * 60 * 60 * 1000) // 18 hours ago
    }
  ];
  
  analyses.push(...historicalAnalyses);
  
  return analyses;
}

// Run seeding if this script is executed directly
if (require.main === module) {
  seedTestData()
    .then(() => {
      Logger.info('🎉 Test data seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      Logger.error('Seeding failed:', error);
      process.exit(1);
    });
}

export { seedTestData, generateTestAnalyses };