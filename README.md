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
| `ANALYSIS_CHANNEL_1_ID` | Channel ID | Discord → Right-click channel → Copy ID |
| `ANALYSIS_CHANNEL_2_ID` | Channel ID | Discord → Right-click channel → Copy ID |
| `GENERAL_NOTICES_CHANNEL_ID` | Channel ID | Discord → Right-click channel → Copy ID |
| `MESSAGE_RETENTION_HOURS` | `26` | Default value (optional) |

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
- Verify `GENERAL_NOTICES_CHANNEL_ID` matches the channel you're testing in
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