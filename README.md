# TradersMind Discord Scanner Bot

A Discord bot that monitors Discord channels for stock analysis and provides easy access to the latest analysis when symbols are mentioned in general conversation.

## How It Works

### 🚀 **Startup Initialization**
- Bot automatically scrapes the last 7 days of analysis from both analysis channels
- Builds a map of the latest analysis per stock symbol
- **Ready from first startup** - no need to wait for new analysis messages
- Progress shown during initialization: "📊 Found 15 symbols from last week"

### Analysis Channels (LONG_ANALYSIS_CHANNEL & SHORT_ANALYSIS_CHANNEL)
- The bot monitors these channels for analysis messages
- **Expected message format**: First line contains the stock symbol(s), rest is analysis content
- **Reply messages supported**: Reply messages are indexed with their own content (useful for follow-up analysis)
- **Hebrew & English support**: Full support for Hebrew technical analysis terminology
- **Historical scraping**: Bot reads last week's messages on startup
- Example:
  ```
  AAPL
  Technical analysis shows bullish breakout pattern above $185.
  Price target $210 with support at $180.
  ```
- **Relevance scoring**: Messages must score ≥0.7 to be indexed (filters out ticker-only mentions)
- The bot maintains a map of the latest analysis message URL for each symbol

### General Notices Channel (MANAGER_GENERAL_MESSAGES_CHANNEL)  
- When users post messages with top picks, the bot creates interactive symbol buttons
- **Top Picks Detection**: Automatically parses Hebrew "טופ פיקס" and English "top picks" sections
- **Priority System**: 
  - 🟢 `top_long` - Green buttons for long picks
  - 🔴 `top_short` - Red buttons for short picks  
  - 📊 `regular` - Gray buttons for regular mentions
- **Analysis Filtering**: Only symbols WITH recent analysis get buttons
- **No symbol limit**: All top picks are parsed (no 25-symbol cap) before filtering
- **Message Splitting**: Automatically splits into multiple messages if >20 symbols with analysis
- Users can click symbol buttons to see the latest analysis privately (ephemeral response)
- The response includes a direct link to the most recent analysis message
- **Works immediately** even for historical analysis from before bot startup

## Features

- **🚀 Startup Scraping**: Automatically loads last 7 days of analysis on bot startup
- **⚡ Immediate Response**: Bot works from first startup with historical data
- **📊 First-Line Symbol Extraction**: Only symbols in the first line of analysis messages are indexed
- **🔗 Latest Analysis Tracking**: Maintains a map of the most recent analysis URL per symbol
- **🤖 Smart Symbol Detection**: Uses regex patterns with word filtering, supports emojis
- **🌍 Hebrew & English Support**: Full Hebrew keyword matching for technical analysis (ברייקאאוט, פריצה, ATH, etc.)
- **💬 Reply Message Indexing**: Reply messages get +0.2 relevance boost and are indexed independently
- **🎯 Top Picks Parser**: Automatically extracts and prioritizes symbols from "טופ פיקס" / "top picks" sections
- **♾️ Unlimited Symbol Parsing**: No 25-symbol limit - all top picks parsed before filtering
- **🔍 Relevance Filtering**: Smart scoring (≥0.7 threshold) rejects ticker-only lists
- **👻 Ephemeral Interactions**: Private button-based interface for viewing analysis  
- **🧹 Hebrew Update Triggered Cleanup**: Automatic immediate cleanup when Hebrew daily updates are posted
- **🧹 Hebrew Update Triggered Cleanup**: Automatic immediate cleanup when Hebrew daily updates are posted
- **🔗 Direct Message Links**: Provides clickable URLs to Discord analysis messages
- **🔍 Permission Diagnostics**: Comprehensive startup and runtime permission monitoring
- **⚙️ Environment-Based Configuration**: Simple setup using environment variables
- **☁️ Deployment Ready**: No database needed, works on any free tier platform

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Get Discord Channel IDs

To configure the bot, you need to get the Channel IDs for your Discord channels:

**Step 1: Enable Developer Mode**
1. Open Discord and go to User Settings (gear icon)
2. Go to "Advanced" in the left sidebar
3. Enable "Developer Mode"

**Step 2: Copy Channel IDs**
1. Right-click on each channel you want to monitor
2. Select "Copy Channel ID" from the context menu
3. The Channel ID will be copied to your clipboard (it's a long number like `123456789012345678`)

**Channels you need:**
- **Long Analysis Channel**: Where your long position analysis content is posted
- **Short Analysis Channel**: Where your short position analysis content is posted  
- **Manager General Messages Channel**: Where the bot will monitor for top picks and stock symbols

**Manager User ID:**
- Right-click on the manager's Discord profile → "Copy User ID"
- Only messages from this user will be processed for analysis and trigger cleanup

### 3. Environment Configuration
```bash
cp .env.example .env
```

Edit the `.env` file with your information:
```env
# Your Discord bot token
DISCORD_TOKEN=your_discord_bot_token_here

# Channel IDs (replace with your actual channel IDs)
LONG_ANALYSIS_CHANNEL=123456789012345678
SHORT_ANALYSIS_CHANNEL=987654321098765432
MANAGER_GENERAL_MESSAGES_CHANNEL=456789123456789123

# Manager Configuration (only messages from this user ID are processed)
MANAGER_ID=your_manager_user_id_here

```

### 4. Register the Status Command (One-time setup)
```bash
node register-status-command.js
```

### 5. Build and Start
```bash
npm run build
npm start

# Production mode (all platforms including Windows):
npm run start:production

# Or for development:
npm run dev
```

#### Windows Users
The project includes `cross-env` for Windows compatibility. All environment variable scripts work on Windows, Mac, and Linux:

```bash
# These commands work on Windows:
npm run start:production
npm run start:development
npm run dev:production
npm run dev:development
```

## Usage

### For Analysts (Analysis Channels)
1. Post analysis messages with the symbol(s) on the first line
2. Follow with your analysis content on subsequent lines
3. The bot automatically indexes the latest analysis per symbol

### For Traders (General Channel) 
1. Mention stock symbols in conversation
2. Click the interactive buttons that appear
3. View the latest analysis privately (only you can see it)
4. Click the embedded link to jump to the full analysis message

### For Managers (Message Cleanup)
1. Post Hebrew daily update messages in the general channel
2. Bot automatically detects Hebrew update patterns and immediately cleans up all previous bot messages
3. Only configured manager (MANAGER_ID) can trigger this immediate cleanup
4. Bot messages are cleaned up immediately when Hebrew daily updates are detected

### Commands
- `/status` - View bot configuration and monitoring status

## Architecture

### Services
- **ChannelScanner**: Monitors general notices channel for top picks messages
- **SymbolDetector**: Detects stock symbols using pattern matching (no 25-symbol limit)
- **TopPicksParser**: Extracts symbols from "טופ פיקס" / "top picks" sections with priority
- **AnalysisLinker**: Indexes and links analysis messages to symbols with Hebrew keyword support
- **EphemeralHandler**: Manages button interactions and ephemeral responses (splits >20 buttons)
- **MessageRetention**: Handles immediate Hebrew update triggered cleanup
- **HebrewUpdateDetector**: Detects Hebrew daily update patterns to trigger immediate message cleanup

### Message Flow
1. **Analysis Channels** → AnalysisLinker indexes messages (relevance ≥0.7, Hebrew/English keywords)
2. **General Notices** → SymbolDetector parses ALL top picks (unlimited symbols)
3. **Filtering** → ChannelScanner filters symbols WITH analysis
4. **Button Creation** → EphemeralHandler creates buttons (splits if >20 symbols)
5. **User Interaction** → Click button → Private analysis preview with direct link

### Key Features
- **Environment-Based Configuration**: No complex setup commands needed
- **Ephemeral Interactions**: Private responses visible only to requesting user
- **Hebrew Update Triggered Cleanup**: Immediate deletion of all bot messages when Hebrew daily updates are detected
- **Hebrew Update Triggered Cleanup**: Bot messages automatically cleaned up when Hebrew daily updates are detected
- **Smart Symbol Detection**: Pattern matching with confidence scoring and word filtering
- **Hebrew Keyword Matching**: 40+ Hebrew technical terms (strong/medium/weak scoring)
- **Reply Message Boost**: +0.2 relevance score for follow-up analysis
- **Unlimited Symbol Parsing**: All top picks parsed before filtering (no 25-cap)
- **Service-Oriented Architecture**: Clean separation of concerns
- **Comprehensive Error Handling**: Graceful failure recovery

## Development

### Available Scripts (Windows/Mac/Linux Compatible)

**Development:**
- `npm run dev` - Start in development mode with ts-node
- `npm run dev:development` - Development mode with NODE_ENV=development
- `npm run dev:production` - Development mode with NODE_ENV=production

**Production:**
- `npm start` - Start built application (default environment)
- `npm run start:production` - Start with NODE_ENV=production
- `npm run start:development` - Start with NODE_ENV=development

**Build & Test:**
- `npm run build` - Compile TypeScript to JavaScript
- `npm run test` - Run Jest unit tests
- `npm run test:playwright` - Run Playwright integration tests
- `npm run test:all` - Run all tests
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

> **Note:** All scripts use `cross-env` for cross-platform environment variable support, ensuring compatibility across Windows, Mac, and Linux.

### Testing

The project includes comprehensive test coverage using both Jest and Playwright:

#### Unit Tests (Jest)
- **SymbolDetector tests** - Symbol detection and validation logic
- Located in `src/__tests__/`

#### Integration Tests (Playwright)  
- **Symbol Detection** - End-to-end symbol detection from message content
- **Top Picks Prioritization** - Parsing 25+ symbols, priority ordering, deduplication
- **Hebrew Analysis Indexing** - Hebrew keyword matching, relevance scoring, reply boost
- **Symbol List Filtering** - Rejection of ticker-only lists, density penalties
- **Analysis Linking** - URL generation and latest analysis tracking
- **Ephemeral Handler** - Button creation and interaction handling
- **Bot Integration** - Complete workflow from analysis to user interaction
- Located in `tests/`

Run tests with:
```bash
# Unit tests only
npm run test

# Integration tests only  
npm run test:playwright

# All tests
npm run test:all
```

## 🔍 Permission Diagnostic System

The bot includes a comprehensive permission diagnostic system that helps identify and troubleshoot Discord permission issues:

### 🚀 **Startup Diagnostics** (Non-blocking)
- **Automatic Execution**: Runs during bot startup without blocking initialization
- **Complete Permission Analysis**: Traces Discord's permission hierarchy step-by-step
- **Multi-Channel Support**: Analyzes all configured channels (analysis + general)
- **Detailed Logging**: Color-coded console output with clear status indicators

### 📊 **Permission Resolution Tracing**
The system traces Discord's complete permission hierarchy:
1. **Server Owner** → All permissions automatically granted
2. **Administrator Role** → All permissions via admin role
3. **@everyone Guild Permissions** → Base server permissions  
4. **Role Permissions** → Additional permissions from assigned roles
5. **Channel @everyone Overrides** → Channel-specific @everyone modifications
6. **Channel Role Overrides** → Channel-specific role permission overrides  
7. **User-Specific Overrides** → Direct user permission overrides

### 🎯 **Critical Permission Monitoring**
Monitors these essential permissions for bot functionality:

**Guild Level:**
- `ViewChannel` - Access to see channels
- `SendMessages` - Send button responses  
- `UseExternalEmojis` - Display emojis in buttons

**Analysis Channels (Read-Only):**
- `ViewChannel` - Access channel content
- `ReadMessageHistory` - Scan historical messages

**General Channel (Write Access):**
- `ViewChannel` - Access channel content
- `SendMessages` - Reply with buttons
- `EmbedLinks` - Rich analysis previews  
- `UseExternalEmojis` - Button emoji labels
- `ReadMessageHistory` - Access message history

### 🔄 **Runtime Monitoring**
- **Error Detection**: Automatically triggers diagnostics on Discord API permission errors
- **Change Detection**: Compares permission states and identifies changes
- **Health Check Integration**: Permission status available via `/health` endpoint
- **Non-disruptive**: Continues bot operation regardless of permission issues

### 📋 **Diagnostic Outputs**

#### Console Logging
```
✅ Permission Status: HEALTHY
📊 Guild: Your Server (123456789)
🤖 Bot: YourBot#1234 (987654321)  
📁 Channels: 3/3 accessible

🔍 Channel: general-chat (333333333)
📍 Type: general, Access: ✅
🔗 Permission Resolution Trace:
  1. ✅ role: @everyone - Grants: ViewChannel, SendMessages
  2. ✅ role_override: Bot Role - Grants: UseExternalEmojis
```

#### Structured Data Export
- **JSON Files**: Exported to `diagnostics/` directory
- **Reproduction Data**: Complete configuration for local testing
- **Latest Report**: Always available as `diagnostics/latest.json`
- **Timestamped Reports**: Historical diagnostic data with timestamps

#### Health Check Endpoint
```json
{
  "permissions": {
    "status": "healthy",
    "lastChecked": "2024-01-15T10:30:00.000Z",
    "accessibleChannels": 3,
    "totalChannels": 3,
    "criticalIssues": 0,
    "warnings": 0
  }
}
```

### 🚨 **Troubleshooting Guide**

**Bot not posting buttons?**
1. Check startup logs for permission status
2. Review `diagnostics/latest.json` for detailed analysis
3. Look for "CRITICAL ISSUES" in console output
4. Verify channel-specific permission overrides

**Common Issues:**
- **Missing UseExternalEmojis**: Buttons won't display emoji correctly
- **Channel Permission Overrides**: @everyone or role overrides blocking access  
- **Missing EmbedLinks**: Analysis previews won't display rich formatting
- **SendMessages Required in Wrong Channel**: Bot only needs SendMessages in general channel, not analysis channels

**Windows Users:**
- **NODE_ENV errors**: Use `npm run start:production` instead of manual NODE_ENV commands
- **Cross-platform scripts**: All npm scripts work on Windows thanks to `cross-env` package
- **PowerShell vs CMD**: All npm scripts work in both PowerShell and Command Prompt

The diagnostic system ensures you have complete visibility into permission issues without affecting bot performance or reliability.

## Deployment

### Local Development
Follow the setup instructions above for local development.

### Production Deployment (Render)

This bot is configured for easy deployment to Render.com. Follow these steps:

#### Prerequisites
1. **Discord Bot Setup**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application or use existing one
   - Go to "Bot" section and copy your bot token
   - Ensure bot has proper permissions in your Discord server (see permissions below)

#### Required Discord Bot Permissions

Your bot needs exactly these 4 permissions:

| Permission | Purpose |
|------------|---------|
| **Send Messages** | Send button responses and handle interactions |
| **Use External Emojis** | Display emoji (📊) in button labels |
| **Embed Links** | Display rich analysis embeds with charts and formatted content |
| **Read Message History** | Scrape historical analysis messages on startup to build analysis cache |

**How to set permissions:**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications) → Your App → OAuth2 → URL Generator
2. Select **Bot** scope
3. Select the 4 permissions listed above
4. Use the generated URL to invite your bot to the server
5. Or manually assign these permissions in your Discord server's role settings

2. **GitHub Repository**:
   - Push your code to a GitHub repository
   - Make sure all files including `render.yaml` are committed

#### Step-by-Step Render Deployment

**Step 1: Push to GitHub**
```bash
git add .
git commit -m "Add Render deployment configuration"
git push origin main
```

If you don't have a GitHub repository:
1. Go to [GitHub](https://github.com) → "New repository"
2. Name: `TradersMind_discord_scanner` (or your preferred name)
3. Don't initialize with README (your project already has one)
4. Follow the instructions to push your existing code

**Step 2: Create Render Service**
1. Go to [Render.com](https://render.com) → "Get Started for Free"
2. Sign up with your GitHub account (recommended)
3. Click "New +" button → "Web Service"
4. Click "Connect a repository"
5. Find and select your repository
6. Click "Connect"

**Step 3: Configure Service Settings**
Use these exact settings:
- **Name**: `tradersmind-discord-bot` (or your preferred name)
- **Environment**: `Node`
- **Region**: Choose closest to your users
- **Branch**: `main`
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm start`
- **Instance Type**: `Free` (to start with)

**Step 4: Environment Variables Setup**
In the Render dashboard, go to the "Environment" tab and add these variables:

| Variable Name | Value | How to Get |
|---------------|-------|------------|
| `NODE_ENV` | `production` | Just type this |
| `DISCORD_TOKEN` | Your bot token | Discord Developer Portal → Your App → Bot → Token |
| `LONG_ANALYSIS_CHANNEL` | Channel ID | Discord → Right-click channel → Copy ID |
| `SHORT_ANALYSIS_CHANNEL` | Channel ID | Discord → Right-click channel → Copy ID |
| `MANAGER_GENERAL_MESSAGES_CHANNEL` | Channel ID | Discord → Right-click channel → Copy ID |
| `MANAGER_ID` | User ID | Discord → Right-click manager profile → Copy User ID |

**How to get Discord Channel IDs:**
1. In Discord: User Settings → Advanced → Enable "Developer Mode"
2. Right-click on any channel → "Copy ID"
3. Use these IDs for the environment variables

**Step 5: Deploy & Monitor**
1. Click "Create Web Service"
2. Wait for deployment (5-10 minutes)
3. Monitor logs in Render dashboard
4. Look for "Bot is online and ready!" message in logs
5. Test bot functionality in Discord

**Step 6: Verification Checklist**
- ✅ Render logs show successful startup
- ✅ Bot appears online in Discord server
- ✅ Send test message with stock symbols in monitored channels
- ✅ Use `/status` command to verify bot configuration
- ✅ Check that ephemeral buttons appear and work correctly

#### Cost Information
- **Render Free Tier**: $0/month (sleeps after 15min inactivity)
- **Render Starter**: $7/month (always on, recommended for production bots)

#### Troubleshooting Deployment

**Bot not starting:**
- Check Render logs for error messages
- Verify all environment variables are set correctly
- Ensure `DISCORD_TOKEN` is valid and not expired

**Bot appears offline:**
- Check Discord Developer Portal → Bot → Privileged Gateway Intents
- Ensure bot has proper permissions in your Discord server
- Verify channel IDs are correct

**Buttons not appearing:**
- Verify `MANAGER_GENERAL_MESSAGES_CHANNEL` matches the channel you're testing in
- Check that analysis channels have recent messages with symbols
- Use `/status` command to verify bot configuration

### Alternative Deployment Options

- **Heroku**: Similar setup using `Procfile` instead of `render.yaml`
- **Railway**: Direct GitHub integration with environment variables
- **Docker**: Use the included configuration for containerized deployments
- **VPS/Server**: Direct Node.js deployment with PM2 or similar process manager

### Deployment Notes

- **Simplified Setup**: Only requires environment variables - no slash command deployment needed
- **Container-Ready**: Perfect for Docker deployments with environment-based config
- **Stateless**: No local file dependencies (removed JSON config persistence)
- **Single Command**: Only the `/status` command needs to be registered (can be done manually in Discord Developer Portal)

## File Structure

```
src/
├── bot.ts                 # Main entry point
├── config/                # Configuration and constants
├── services/              # Core business logic services
├── commands/              # Slash command handlers
├── types/                 # TypeScript type definitions
└── utils/                 # Utility functions and helpers
```