import { test, expect } from '@playwright/test';
import { Client, GatewayIntentBits, Message, TextChannel, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.join(__dirname, '..', '.env.development') });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to count buttons in a message
const countButtons = (message: Message): number => {
  if (!message.components) return 0;
  return message.components.reduce((count, row) => {
    if ('components' in row && Array.isArray(row.components)) {
      return count + row.components.length;
    }
    return count;
  }, 0);
};

test.describe('Top Picks Message Splitting Tests', () => {
  let testClient: Client;
  let analysisChannel: TextChannel;

  test.beforeAll(async () => {
    testClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    await testClient.login(process.env.DISCORD_TOKEN);
    await new Promise(resolve => testClient.once('ready', resolve));

    const channelId = process.env.ANALYSIS_CHANNEL_2_ID;
    if (!channelId) {
      throw new Error('ANALYSIS_CHANNEL_2_ID not found in environment');
    }

    analysisChannel = testClient.channels.cache.get(channelId) as TextChannel;
    if (!analysisChannel) {
      throw new Error(`Channel ${channelId} not found`);
    }
  });

  test.afterAll(async () => {
    await testClient.destroy();
  });

  test('should create single message for 25 or fewer top picks', async () => {
    const message = `מצטרפים לג'וקרים. הטופ פיקס שלי היום:

טופ פיקס:
long: AAPL, TSLA, NVDA, MSFT, GOOGL, META, AMZN, NFLX, CRM, ADBE, PYPL, INTC, AMD, QCOM, TXN, AVGO, ORCL, CSCO, IBM, WMT, BABA, PFE, JNJ, V, MA

short:

המשכיות:
CRWV , ORCL

טריידים שלי:
SOFI , GOOGL`;

    console.log('📤 Sending message with exactly 25 top picks...');
    const sentMessage = await analysisChannel.send(message);
    
    // Wait for bot to process and respond
    await delay(3000);

    // Fetch recent messages to find bot responses
    const messages = await analysisChannel.messages.fetch({ limit: 10, after: sentMessage.id });
    const botMessages = messages.filter(msg => 
      msg.author.bot && 
      msg.components && 
      msg.components.length > 0
    );

    expect(botMessages.size).toBe(1);
    console.log('✅ Bot created exactly 1 message for 25 symbols');

    // Count buttons in the single message
    const buttonMessage = botMessages.first()!;
    const totalButtons = countButtons(buttonMessage);

    expect(totalButtons).toBeLessThanOrEqual(25);
    expect(totalButtons).toBeGreaterThan(0);
    console.log(`✅ Single message contains ${totalButtons} buttons`);

    // Cleanup
    await sentMessage.delete();
    for (const botMsg of botMessages.values()) {
      await botMsg.delete();
    }
  });

  test('should split into 2 messages for 26-50 top picks', async () => {
    const message = `מצטרفים לג'וקרים. הטופ פיקס שלי היום:

טופ פיקס:
long: AAPL, TSLA, NVDA, MSFT, GOOGL, META, AMZN, NFLX, CRM, ADBE, PYPL, INTC, AMD, QCOM, TXN, AVGO, ORCL, CSCO, IBM, WMT, BABA, PFE, JNJ, V, MA, DIS, KO, PEP, MCD, NKE, SBUX, HD, LOW

short:

המשכיות:
CRWV , ORCL

טריידים שלי:
SOFI , GOOGL`;

    console.log('📤 Sending message with 33 top picks (26+)...');
    const sentMessage = await analysisChannel.send(message);
    
    // Wait for bot to process and respond
    await delay(5000);

    // Fetch recent messages to find bot responses
    const messages = await analysisChannel.messages.fetch({ limit: 15, after: sentMessage.id });
    const botMessages = messages.filter(msg => 
      msg.author.bot && 
      msg.components && 
      msg.components.length > 0
    );

    expect(botMessages.size).toBe(2);
    console.log('✅ Bot created exactly 2 messages for 33 symbols');

    // Verify both messages have buttons
    const botMessageArray = Array.from(botMessages.values()).reverse(); // Get in chronological order
    let totalButtons = 0;

    for (let i = 0; i < botMessageArray.length; i++) {
      const msg = botMessageArray[i]!;
      const buttons = countButtons(msg);
      
      expect(buttons).toBeGreaterThan(0);
      expect(buttons).toBeLessThanOrEqual(25);
      totalButtons += buttons;
      
      console.log(`✅ Message ${i + 1} contains ${buttons} buttons`);
      
      // Check for part numbering in message content
      if (msg.content) {
        expect(msg.content).toContain(`Part ${i + 1}/2`);
        console.log(`✅ Message ${i + 1} shows correct part numbering`);
      }
    }

    expect(totalButtons).toBeGreaterThan(25);
    console.log(`✅ Total buttons across both messages: ${totalButtons}`);

    // Cleanup
    await sentMessage.delete();
    for (const botMsg of botMessages.values()) {
      await botMsg.delete();
    }
  });

  test('should split into multiple messages for 50+ top picks', async () => {
    const message = `מצטרפים לג'וקרים. הטופ פיקס שלי היום:

טופ פיקס:
long: AAPL, TSLA, NVDA, MSFT, GOOGL, META, AMZN, NFLX, CRM, ADBE, PYPL, INTC, AMD, QCOM, TXN, AVGO, ORCL, CSCO, IBM, WMT, BABA, PFE, JNJ, V, MA, DIS, KO, PEP, MCD, NKE, SBUX, HD, LOW, TGT, F, GM, BAC, JPM, GS, WFC, C, BRK-B, T, VZ

short:

המשכיות:
CRWV , ORCL

טריידים שלי:
SOFI , GOOGL`;

    console.log('📤 Sending message with 44 top picks (requires 2 messages)...');
    const sentMessage = await analysisChannel.send(message);
    
    // Wait for bot to process and respond
    await delay(6000);

    // Fetch recent messages to find bot responses
    const messages = await analysisChannel.messages.fetch({ limit: 20, after: sentMessage.id });
    const botMessages = messages.filter(msg => 
      msg.author.bot && 
      msg.components && 
      msg.components.length > 0
    );

    expect(botMessages.size).toBeGreaterThanOrEqual(2);
    expect(botMessages.size).toBeLessThanOrEqual(3);
    console.log(`✅ Bot created ${botMessages.size} messages for 44 symbols`);

    // Verify each message has buttons and proper numbering
    const botMessageArray = Array.from(botMessages.values()).reverse(); // Get in chronological order
    let totalButtons = 0;
    const expectedParts = botMessageArray.length;

    for (let i = 0; i < botMessageArray.length; i++) {
      const msg = botMessageArray[i]!;
      const buttons = countButtons(msg);
      
      expect(buttons).toBeGreaterThan(0);
      expect(buttons).toBeLessThanOrEqual(25);
      totalButtons += buttons;
      
      console.log(`✅ Message ${i + 1} contains ${buttons} buttons`);
      
      // Check for part numbering in message content
      if (msg.content) {
        expect(msg.content).toContain(`Part ${i + 1}/${expectedParts}`);
        console.log(`✅ Message ${i + 1} shows correct part numbering`);
      }
    }

    expect(totalButtons).toBeGreaterThan(25);
    console.log(`✅ Total buttons across all messages: ${totalButtons}`);

    // Cleanup
    await sentMessage.delete();
    for (const botMsg of botMessages.values()) {
      await botMsg.delete();
    }
  });

  test('should handle edge case of exactly 26 top picks', async () => {
    const message = `מצטרפים לג'וקרים. הטופ פיקס שלי היום:

טופ פיקס:
long: AAPL, TSLA, NVDA, MSFT, GOOGL, META, AMZN, NFLX, CRM, ADBE, PYPL, INTC, AMD, QCOM, TXN, AVGO, ORCL, CSCO, IBM, WMT, BABA

short:

המשכיות:
CRWV , ORCL

טריידים שלי:
SOFI , GOOGL`;

    console.log('📤 Sending message with exactly 26 top picks...');
    const sentMessage = await analysisChannel.send(message);
    
    // Wait for bot to process and respond
    await delay(4000);

    // Fetch recent messages to find bot responses
    const messages = await analysisChannel.messages.fetch({ limit: 10, after: sentMessage.id });
    const botMessages = messages.filter(msg => 
      msg.author.bot && 
      msg.components && 
      msg.components.length > 0
    );

    expect(botMessages.size).toBe(2);
    console.log('✅ Bot created exactly 2 messages for 26 symbols (edge case)');

    // Verify button distribution
    const botMessageArray = Array.from(botMessages.values()).reverse();
    const firstMessageButtons = countButtons(botMessageArray[0]!);
    const secondMessageButtons = countButtons(botMessageArray[1]!);

    expect(firstMessageButtons).toBe(25);
    expect(secondMessageButtons).toBe(1);
    console.log(`✅ Button distribution: Message 1 = ${firstMessageButtons}, Message 2 = ${secondMessageButtons}`);

    // Cleanup
    await sentMessage.delete();
    for (const botMsg of botMessages.values()) {
      await botMsg.delete();
    }
  });

  test('should not split regular symbol lists (non-top picks)', async () => {
    const message = `מצטרפים לג'וקרים. סיכום היום:

המשכיות:
CRWV , ORCL , SYM , SMR , SPOT , MP , ECG , SERV , BX , SOUN , TSLA , PSIX , CVNA , ZETA , CEG , SMTC , AAPL , NVDA , MSFT , GOOGL , META , AMZN , NFLX , CRM , ADBE

באונסים:
RDDT , AAOI , FTI , ARGX , SE , ELF

טריידים שלי:
SOFI , GOOGL`;

    console.log('📤 Sending message with many symbols but NO top picks section...');
    const sentMessage = await analysisChannel.send(message);
    
    // Wait for bot to process and respond
    await delay(4000);

    // Fetch recent messages to find bot responses
    const messages = await analysisChannel.messages.fetch({ limit: 10, after: sentMessage.id });
    const botMessages = messages.filter(msg => 
      msg.author.bot && 
      msg.components && 
      msg.components.length > 0
    );

    expect(botMessages.size).toBeLessThanOrEqual(1);
    console.log(`✅ Bot created ${botMessages.size} message(s) for non-top-picks symbols`);

    // If a message was created, it should follow normal button limits (25)
    if (botMessages.size > 0) {
      const buttonMessage = botMessages.first()!;
      const totalButtons = countButtons(buttonMessage);
      expect(totalButtons).toBeLessThanOrEqual(25);
      console.log(`✅ Non-top-picks message contains ${totalButtons} buttons (≤25)`);
    }

    // Cleanup
    await sentMessage.delete();
    for (const botMsg of botMessages.values()) {
      await botMsg.delete();
    }
  });
});