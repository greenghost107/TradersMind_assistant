# TradersMind Discord Scanner Bot

A Discord bot that monitors Discord channels for stock analysis and provides easy access to the latest analysis when symbols are mentioned in general conversation.

## How It Works

### 🚀 **Startup Initialization**
- Bot automatically scrapes the last 7 days of analysis from both analysis channels
- Builds a map of the latest analysis per stock symbol
- **Ready from first startup** - no need to wait for new analysis messages
- Progress shown during initialization: "📊 Found 15 symbols from last week"

### Analysis Channels (ANALYSIS_CHANNEL_1_ID & ANALYSIS_CHANNEL_2_ID)
- The bot monitors these channels for analysis messages
- **Expected message format**: First line contains the stock symbol(s), rest is analysis content
- **Historical scraping**: Bot reads last week's messages on startup
- Example:
  ```
  AAPL
  Technical analysis shows bullish breakout pattern above $185.
  Price target $210 with support at $180.
  ```
- The bot maintains a map of the latest analysis message URL for each symbol

### General Notices Channel (GENERAL_NOTICES_CHANNEL_ID)  
- When users mention stock symbols in this channel, the bot shows clean interactive buttons
- **Button format**: `📊 $SYMBOL` (chart emoji + ticker symbol)
- **No text clutter**: Only buttons appear, no description text or timestamps
- Users can click symbol buttons to see the latest analysis privately (ephemeral response)
- The response includes a direct link to the most recent analysis message
- **Works immediately** even for historical analysis from before bot startup

## Features

- **🚀 Startup Scraping**: Automatically loads last 7 days of analysis on bot startup
- **⚡ Immediate Response**: Bot works from first startup with historical data
- **📊 First-Line Symbol Extraction**: Only symbols in the first line of analysis messages are indexed
- **🔗 Latest Analysis Tracking**: Maintains a map of the most recent analysis URL per symbol
- **🤖 Smart Symbol Detection**: Uses regex patterns with word filtering, supports emojis
- **👻 Ephemeral Interactions**: Private button-based interface for viewing analysis  
- **🧹 Message Retention**: Configurable automatic cleanup of bot messages
- **🔗 Direct Message Links**: Provides clickable URLs to Discord analysis messages
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
- **Analysis Channel 1**: Where your first analysis content is posted
- **Analysis Channel 2**: Where your second analysis content is posted  
- **General Notices Channel**: Where the bot will monitor for stock symbols

### 3. Environment Configuration
```bash
cp .env.example .env
```

Edit the `.env` file with your information:
```env
# Your Discord bot token
DISCORD_TOKEN=your_discord_bot_token_here

# Channel IDs (replace with your actual channel IDs)
ANALYSIS_CHANNEL_1_ID=123456789012345678
ANALYSIS_CHANNEL_2_ID=987654321098765432
GENERAL_NOTICES_CHANNEL_ID=456789123456789123

# Optional: Message retention in hours (default: 26)
MESSAGE_RETENTION_HOURS=26
```

### 4. Register the Status Command (One-time setup)
```bash
node register-status-command.js
```

### 5. Build and Start
```bash
npm run build
npm start

# Or for development:
npm run dev
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

### Commands
- `/status` - View bot configuration and monitoring status

## Architecture

### Services
- **ChannelScanner**: Monitors messages in configured channels
- **SymbolDetector**: Detects stock symbols using pattern matching
- **AnalysisLinker**: Indexes and links analysis messages to symbols
- **EphemeralHandler**: Manages button interactions and ephemeral responses
- **MessageRetention**: Handles automatic message cleanup

### Key Features
- **Environment-Based Configuration**: No complex setup commands needed
- **Ephemeral Interactions**: Private responses visible only to requesting user
- **Multi-tiered Cleanup**: Automatic message and cache cleanup with safety buffers
- **Smart Symbol Detection**: Pattern matching with confidence scoring and word filtering
- **Service-Oriented Architecture**: Clean separation of concerns
- **Comprehensive Error Handling**: Graceful failure recovery

## Development

- `npm run dev` - Start in development mode with ts-node
- `npm run build` - Compile TypeScript to JavaScript
- `npm run test` - Run Jest unit tests
- `npm run test:playwright` - Run Playwright integration tests
- `npm run test:all` - Run all tests
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

### Testing

The project includes comprehensive test coverage using both Jest and Playwright:

#### Unit Tests (Jest)
- **SymbolDetector tests** - Symbol detection and validation logic
- Located in `src/__tests__/`

#### Integration Tests (Playwright)  
- **Symbol Detection** - End-to-end symbol detection from message content
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

## Deployment Notes

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