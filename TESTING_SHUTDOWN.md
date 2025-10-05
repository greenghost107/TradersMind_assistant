# Bot Shutdown Cleanup Testing

This document explains how to test the bot's message cleanup functionality when receiving a SIGINT signal (Ctrl+C).

## Test Overview

The `bot-shutdown-cleanup.spec.ts` test verifies that:
1. ✅ Bot starts successfully with mocked Discord components
2. ✅ Mock button messages are created (simulating bot responses)
3. ✅ SIGINT signal triggers graceful shutdown
4. ✅ Bot logs show cleanup attempt during shutdown
5. ✅ Bot process exits cleanly with code 0

## Prerequisites

1. **Built Bot**: Run `npm run build` to compile the TypeScript
2. **No external dependencies**: Test uses mocks, no real Discord connection needed

## Setup

1. **Build the bot**:
   ```bash
   npm run build
   ```

2. **No environment setup needed**: Test uses mocked Discord components

## Running the Test

### Quick Test
```bash
npm run test:shutdown
```

### Verbose Output
```bash
npx playwright test bot-shutdown-cleanup.spec.ts --workers=1
```

## What the Test Does

### Step 1: Mock Setup
- Creates mock Discord channel and client components
- Creates mock bot messages with button components
- No real Discord connection required

### Step 2: Bot Startup
- Spawns the actual bot process using `node dist/bot.js`
- Uses mocked Discord token and channel IDs
- Waits for "is online and ready!" log message
- Captures all bot stdout/stderr for debugging

### Step 3: SIGINT Signal
- Sends `SIGINT` signal to bot process (equivalent to Ctrl+C)
- Bot should start graceful shutdown sequence
- Logs all shutdown activity

### Step 4: Verification
- Waits for bot process to exit
- Analyzes bot logs for expected cleanup messages
- Verifies bot attempted to call cleanup methods
- Confirms bot exited with code 0 (success)

## Expected Logs

When working correctly, you should see:
```
Created 2 mock bot messages with buttons
BOT: TestBot#1234 is online and ready!
2/2 messages exist before shutdown
Sending SIGINT to bot process...
BOT: Shutting down bot...
BOT: 🔍 DEBUG: Entered shutdown method
BOT: ℹ️ INFO: Initiating graceful shutdown...
BOT: 🧹 Performing final cleanup before shutdown...
BOT: 🧹 Clearing all bot button messages...
BOT: ✅ Final cleanup complete
BOT: ℹ️ INFO: Bot shutdown complete
Bot process exited with code: 0
✅ Found expected log: "Shutting down bot"
✅ Found expected log: "Performing final cleanup"  
✅ Found expected log: "Clearing all bot button messages"
Found 3/3 expected cleanup logs
```

## Troubleshooting

### Bot doesn't start
- Ensure `npm run build` was run
- Check Discord token is valid
- Verify channel IDs are correct

### No button messages created
- Check if your test message matches expected format
- Verify bot has permissions in test channel
- Look for "DEBUG: Creating single button message" log

### Messages not deleted
- Check for "🧹 Performing final cleanup" logs
- Verify no errors in shutdown sequence
- Ensure bot has delete message permissions

### Test timeout
- Increase timeout values in test if network is slow
- Check bot logs for stuck processes
- Verify Discord API connectivity

## Integration with CI/CD

To run in automated environments:
```bash
# Set environment variables and run
export DISCORD_TOKEN="$TEST_BOT_TOKEN"
export TEST_CHANNEL_ID="$TEST_CHANNEL_ID" 
export TEST_MANAGER_ID="$TEST_MANAGER_ID"
npm run build && npm run test:shutdown
```

This test provides confidence that the bot properly cleans up its messages when shut down gracefully.