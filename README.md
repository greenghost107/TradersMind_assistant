# TradersMind Discord Scanner Bot

A Discord bot that monitors Discord channels for stock analysis and provides easy access to the latest analysis when symbols are mentioned in general conversation. The bot features a **comprehensive 4-mode system** enabling seamless development, testing, and production workflows.

## 🚀 4-Mode System Overview

The bot operates in four distinct modes, each optimized for different stages of development and deployment:

### 📊 **INFO Mode** - Quick Information Display
- **Purpose**: Displays bot configuration and status information
- **Use Case**: Verification, debugging, and health checks
- **Database**: Read-only operations, no data persistence
- **Environment**: Any (development/production)
- **Example**: Use `/status` command to view current configuration

### 🔧 **DEBUG Mode** - Enhanced Logging & Diagnostics  
- **Purpose**: Development debugging with detailed logging
- **Use Case**: Troubleshooting message processing, symbol detection, and analysis linking
- **Database**: Uses production database with debug-level logging
- **Environment**: Development with production data access
- **Features**: Verbose console output, timing metrics, detailed error traces

### 🧪 **LOCAL Mode** - Complete Local Testing Environment
- **Purpose**: Full-featured local testing before production deployment
- **Use Case**: Feature development, integration testing, and validation
- **Database**: SQLite3 local database with mock data
- **Environment**: Isolated local development
- **Features**:
  - Automatic SQLite database setup and seeding
  - Mock Discord users (Admin, Analyst)
  - Pre-populated test analysis data (AAPL, TSLA, NVDA, MSFT)
  - Local test utilities and performance testing
  - Complete workflow testing without Discord API dependency

### 🚀 **PRODUCTION Mode** - Live Deployment
- **Purpose**: Live Discord bot serving real users
- **Use Case**: Production deployment with real Discord channels
- **Database**: PostgreSQL production database
- **Environment**: Production servers (Render, Heroku, etc.)
- **Features**: Optimized performance, error reporting, and monitoring

## 🔄 Mode-Specific Workflows

### Local Development Workflow
```bash
# 1. Set up local environment
npm run local:setup

# 2. Run in LOCAL mode with test data
npm run dev:local

# 3. Test features with mock data
npm run test:local

# 4. Switch to DEBUG mode for detailed logging
npm run dev:debug

# 5. Deploy to production
npm run deploy
```

### Testing Progression
1. **LOCAL Mode**: Develop and test features with SQLite + mock data
2. **DEBUG Mode**: Validate against real data with enhanced logging  
3. **INFO Mode**: Verify configuration and status
4. **PRODUCTION Mode**: Deploy with confidence

## 🛠️ Mode Configuration

Each mode has its own configuration class and environment file:

```
src/config/modes/
├── LocalConfig.ts      # SQLite setup, mock users, test data
├── DebugConfig.ts      # Enhanced logging, development settings  
├── InfoConfig.ts       # Read-only status and configuration display
└── ProductionConfig.ts # Optimized production settings
```

Environment files:
```
.env.local      # Local testing with SQLite
.env.debug      # Debug mode with production DB
.env.info       # Info mode (minimal config)
.env.production # Production deployment
```

## 📦 Installation & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Local Environment
```bash
# Initialize local testing environment
npm run local:setup

# This creates:
# - .env.local file with SQLite configuration
# - Local database with test data
# - Mock Discord users and analysis data
```

### 3. Choose Your Mode

#### For Local Development
```bash
# Run in LOCAL mode (SQLite + mock data)
npm run dev:local
```

#### For Production Testing  
```bash
# Run in DEBUG mode (real DB + enhanced logging)
npm run dev:debug
```

#### For Quick Status Check
```bash
# Run in INFO mode (status display only)
npm run dev:info
```

#### For Production Deployment
```bash
# Build and run in PRODUCTION mode
npm run build
npm run start:production
```

## 🎯 Core Features

### Analysis Monitoring & Indexing
- **Real-time Analysis Tracking**: Monitors Discord channels for stock analysis
- **Symbol Detection**: Advanced regex-based symbol detection with confidence scoring
- **Latest Analysis Mapping**: Maintains the most recent analysis per symbol per analyst
- **Historical Data**: Stores analysis history with configurable retention

### Multi-User Support
- **Admin User**: Primary analyst account (configured via ADMIN_DISCORD_ID)
- **Multiple Analysts**: Support for additional analysts (Tomer, future analysts)
- **User-Specific Analysis**: Each analyst's analysis tracked separately per symbol
- **Conflict Resolution**: Handles multiple analysts analyzing the same symbol

### Interactive Discord Interface
- **Ephemeral Responses**: Private button-based interface for viewing analysis
- **Smart Symbol Buttons**: Auto-generated buttons when symbols mentioned
- **Direct Message Links**: Clickable URLs to source analysis messages
- **Clean UI**: No message clutter, only relevant interactive elements

### Database Systems
- **Production**: PostgreSQL with full feature set
- **Local Testing**: SQLite3 with identical schema and mock data
- **Migration Support**: Seamless migration between database systems
- **Data Validation**: Comprehensive data integrity and validation

## 🧪 Testing

### Local Testing (Recommended)
```bash
# Set up and test locally with SQLite
npm run local:setup
npm run dev:local

# Run local tests
npm run test:local
```

### Unit & Integration Tests
```bash
# Jest unit tests
npm run test

# Playwright integration tests  
npm run test:playwright

# Complete test suite
npm run test:all
```

### Multi-User Testing
```bash
# Test multi-analyst scenarios
npm run test:multi-user

# Test database integration
npm run test:database
```

## 🌐 Production Deployment

### Environment Setup
Create production environment file:
```bash
cp .env.example .env.production
```

Configure production variables:
```env
NODE_ENV=production
DISCORD_TOKEN=your_discord_bot_token
ADMIN_DISCORD_ID=admin_discord_user_id

# Database (PostgreSQL)
DATABASE_URL=postgresql://username:password@host:port/database

# Discord Channels
ANALYSIS_CHANNEL_1_ID=123456789012345678
ANALYSIS_CHANNEL_2_ID=987654321098765432
GENERAL_NOTICES_CHANNEL_ID=456789123456789123

# Optional Configuration
MESSAGE_RETENTION_HOURS=26
```

### Deploy to Render/Heroku
```bash
# Build production bundle
npm run build

# Deploy with production mode
npm run start:production
```

### Deployment Verification
1. Check bot startup in production logs
2. Use `/status` command in Discord
3. Test symbol detection in monitored channels
4. Verify ephemeral button interactions work
5. Confirm analysis data persistence

## 📊 Architecture

### Mode Management System
```typescript
export enum BotMode {
  INFO = 'info',           // Status display
  DEBUG = 'debug',         // Enhanced logging  
  LOCAL = 'local',         // Local testing
  PRODUCTION = 'production' // Live deployment
}
```

### Service Architecture
- **ModeManager**: Detects and configures bot mode
- **DatabaseService**: Unified interface for PostgreSQL/SQLite
- **LocalDatabaseService**: SQLite implementation with test data
- **AnalysisLinker**: Links Discord messages to analysis data
- **SymbolDetector**: Regex-based symbol detection and validation
- **EphemeralHandler**: Discord interaction management

### Database Schema
Identical schema across PostgreSQL (production) and SQLite (local):
- **users**: Analyst accounts (Admin, Tomer, etc.)
- **symbols**: Latest analysis per symbol per user
- **analysis_history**: Historical analysis with configurable retention

## 🔧 Development

### Available Scripts
```bash
# Mode-specific development
npm run dev:local      # LOCAL mode with SQLite
npm run dev:debug      # DEBUG mode with enhanced logging
npm run dev:info       # INFO mode for status checking

# Testing
npm run test          # Unit tests
npm run test:playwright # Integration tests  
npm run test:all      # Complete test suite
npm run test:multi-user # Multi-analyst testing

# Local environment
npm run local:setup   # Initialize local testing environment
npm run local:reset   # Reset local test data

# Production
npm run build         # Compile TypeScript
npm run start:production # Run in production mode
npm run typecheck     # TypeScript validation
npm run lint          # Code linting
```

### File Structure
```
src/
├── bot.ts                    # Main entry point with mode detection
├── config/
│   ├── ModeManager.ts        # Mode detection and configuration
│   └── modes/                # Mode-specific configurations
│       ├── LocalConfig.ts    # Local testing setup
│       ├── DebugConfig.ts    # Debug configuration  
│       ├── InfoConfig.ts     # Info mode settings
│       └── ProductionConfig.ts # Production optimization
├── services/
│   ├── DatabaseService.ts          # PostgreSQL service
│   ├── LocalDatabaseService.ts     # SQLite service for local testing
│   ├── DatabaseMigration.ts        # Migration utilities
│   ├── DatabaseAnalysisLinker.ts   # Analysis data linking
│   ├── SymbolDetector.ts           # Symbol detection logic
│   └── EphemeralHandler.ts         # Discord interaction handling
├── scripts/
│   ├── setup-local.ts        # Local environment initialization
│   └── seed-test-data.ts     # Test data generation
├── utils/
│   ├── LocalTestUtils.ts     # Local testing utilities
│   └── Logger.ts             # Multi-mode logging
└── types/                    # TypeScript definitions
```

## 🚀 Getting Started

### Quick Start (Local Testing)
```bash
# 1. Clone and install
git clone <repository>
cd TradersMind_discord_scanner
npm install

# 2. Set up local environment  
npm run local:setup

# 3. Start in local mode
npm run dev:local

# 4. The bot is now running locally with:
#    - SQLite database with test data
#    - Mock users (Admin, Analyst)  
#    - Sample analysis data for AAPL, TSLA, NVDA, MSFT
#    - Full Discord bot functionality simulation
```

### Production Deployment
```bash
# 1. Configure production environment
cp .env.example .env.production
# Edit .env.production with your Discord and database credentials

# 2. Build and deploy
npm run build
npm run start:production
```

## 📝 Usage Examples

### Local Development Session
```bash
# Start local development
npm run dev:local

# In Discord bot logs, you'll see:
# ✅ Mode: LOCAL
# ✅ Database: SQLite (./local_bot.db) 
# ✅ Mock users created: Admin (Local), Analyst (Local)
# ✅ Test data: 5 symbols with sample analysis
# 🤖 Bot ready for local testing!
```

### Debug Session
```bash
# Start debug mode
npm run dev:debug

# Enhanced logging shows:
# [DEBUG] Symbol detected: AAPL (confidence: 0.85)
# [DEBUG] Analysis indexed: AAPL -> Admin (ID: 123)
# [DEBUG] Database query: 2.3ms
# [DEBUG] Discord interaction: button_click -> AAPL
```

### Production Verification
```bash
# Check status in Discord
/status

# Expected response:
# 📊 Bot Status: ✅ PRODUCTION Mode
# 🗄️ Database: PostgreSQL (connected)
# 👥 Users: 2 analysts active
# 📈 Symbols: 42 with recent analysis
# 🕒 Uptime: 2d 14h 23m
```

This comprehensive 4-mode system ensures reliable development, thorough testing, and confident production deployments.