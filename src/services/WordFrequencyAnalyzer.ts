import { Message, TextChannel, Collection, Client } from 'discord.js';
import { BotConfig } from '../types';
import { DiscussionChannelHandler } from './DiscussionChannelHandler';
import { COMMON_WORDS } from '../config';
import { Logger } from '../utils/Logger';
import * as fs from 'fs';

// Control flag - set to true to activate analysis
const is_active: boolean = true;

interface WordFrequency {
  word: string;
  count: number;
  context: string[];
}

export class WordFrequencyAnalyzer {
  private discussionHandler: DiscussionChannelHandler;
  private hebrewWords: Map<string, WordFrequency> = new Map();
  private englishWords: Map<string, WordFrequency> = new Map();
  private strong_words: Set<string> = new Set();
  private medium_words: Set<string> = new Set();
  private weak_words: Set<string> = new Set();
  private processedMessages: number = 0;
  private analysisStartTime: Date = new Date();

  constructor() {
    this.discussionHandler = new DiscussionChannelHandler();
  }

  public isActive(): boolean {
    return is_active;
  }

  public async processMessage(message: Message, config: BotConfig): Promise<void> {
    if (!is_active) return;

    // Only process manager messages from analysis or discussion channels
    const isAnalysisChannel = config.analysisChannels.includes(message.channel.id);
    const isDiscussionChannel = config.discussionChannels.includes(message.channel.id);
    const isManagerMessage = this.discussionHandler.isManagerMessage(message, config);

    if (!isManagerMessage || (!isAnalysisChannel && !isDiscussionChannel)) {
      return;
    }

    await this.analyzeMessageContent(message.content);
    this.processedMessages++;

    if (this.processedMessages % 100 === 0) {
      Logger.info(`Word frequency analyzer: processed ${this.processedMessages} messages`);
    }
  }

  public async scanHistoricalMessages(client: Client, config: BotConfig): Promise<void> {
    if (!is_active) {
      Logger.info('Word frequency analyzer is inactive - skipping historical scan');
      return;
    }

    Logger.info('🔍 Starting historical message scan for word frequency analysis...');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // Reduced from 200 to 30 days
    Logger.info(`📅 Scanning messages from ${cutoffDate.toISOString().split('T')[0]} onwards`);

    const allChannels = [...config.analysisChannels, ...config.discussionChannels];
    Logger.info(`📊 Will scan ${allChannels.length} channels: ${allChannels.join(', ')}`);

    for (let i = 0; i < allChannels.length; i++) {
      const channelId = allChannels[i]!;
      
      try {
        const channel = await client.channels.fetch(channelId) as TextChannel;
        if (!channel) {
          Logger.warn(`⚠️  Channel ${channelId} not found, skipping...`);
          continue;
        }

        Logger.info(`🔍 [${i + 1}/${allChannels.length}] Scanning channel: ${channel.name} (${channelId})`);
        
        let lastMessageId: string | undefined;
        let messagesScanned = 0;
        let totalMessages = 0;
        let batchCount = 0;
        const channelStartTime = Date.now();

        while (true) {
          const fetchOptions = { 
            limit: 100,
            ...(lastMessageId && { before: lastMessageId })
          };

          const batch = await channel.messages.fetch(fetchOptions);
          if (batch.size === 0) {
            Logger.info(`✅ No more messages in channel ${channel.name}`);
            break;
          }

          batchCount++;
          totalMessages += batch.size;
          let hitCutoff = false;

          for (const message of batch.values()) {
            if (message.createdAt < cutoffDate) {
              Logger.info(`📅 Reached 30-day cutoff in channel ${channel.name} (${new Date(message.createdAt).toISOString().split('T')[0]})`);
              hitCutoff = true;
              break; // Exit message loop, but continue to next channel
            }

            if (this.discussionHandler.isManagerMessage(message, config)) {
              await this.analyzeMessageContent(message.content);
              messagesScanned++;
            }

            lastMessageId = message.id;
          }

          // Progress logging every 5 batches (500 messages)
          if (batchCount % 5 === 0) {
            const elapsed = (Date.now() - channelStartTime) / 1000;
            Logger.info(`📈 Channel ${channel.name}: processed ${totalMessages} messages, found ${messagesScanned} manager messages (${elapsed.toFixed(1)}s elapsed)`);
          }

          if (hitCutoff) break;

          // Reduced rate limiting
          await new Promise(resolve => setTimeout(resolve, 250));
        }

        const channelElapsed = (Date.now() - channelStartTime) / 1000;
        Logger.info(`✅ Completed channel ${channel.name}: ${messagesScanned} manager messages analyzed from ${totalMessages} total messages (${channelElapsed.toFixed(1)}s)`);
        
      } catch (error) {
        Logger.error(`❌ Error scanning channel ${channelId}:`, error);
        // Continue processing other channels
        continue;
      }
    }

    Logger.info(`🎉 Historical scan completed! Total manager messages processed: ${this.processedMessages}`);
    Logger.info(`📊 Dictionary contains ${this.hebrewWords.size} Hebrew words and ${this.englishWords.size} English words`);
    await this.generateAnalysisReport();
  }

  private async analyzeMessageContent(content: string): Promise<void> {
    const words = this.extractWords(content);
    
    for (const word of words) {
      if (this.isHebrew(word)) {
        this.trackWord(word, this.hebrewWords, content);
      } else if (this.isEnglish(word) && !this.shouldFilterWord(word)) {
        this.trackWord(word, this.englishWords, content);
      }
    }
  }

  private extractWords(content: string): string[] {
    // Remove emojis and special characters, split by whitespace and punctuation
    const cleaned = content.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, ' ');
    return cleaned.split(/[\s\p{P}]+/u).filter(word => word.length > 1);
  }

  private isHebrew(word: string): boolean {
    return /[\u0590-\u05FF]/.test(word);
  }

  private isEnglish(word: string): boolean {
    return /^[A-Za-z]+$/.test(word);
  }

  private shouldFilterWord(word: string): boolean {
    const upperWord = word.toUpperCase();
    
    // Filter common words
    if (COMMON_WORDS.has(upperWord)) return true;
    
    // Filter known abbreviations and technical terms
    const technicalTerms = new Set([
      'AVWAP', 'EMA', 'DMA', 'HTF', 'ATH', 'IBD', 'API', 'URL', 'PDF', 'FAQ',
      'CEO', 'IPO', 'SEC', 'FDA', 'USD', 'NYSE', 'NASDAQ'
    ]);
    
    if (technicalTerms.has(upperWord)) return true;
    
    // Filter very short words (2 chars or less)
    if (word.length <= 2) return true;
    
    // Filter if it looks like a stock symbol (all caps, 1-5 chars)
    if (/^[A-Z]{1,5}$/.test(word)) return true;
    
    return false;
  }

  private trackWord(word: string, wordMap: Map<string, WordFrequency>, context: string): void {
    const normalizedWord = word.toLowerCase();
    
    if (wordMap.has(normalizedWord)) {
      const frequency = wordMap.get(normalizedWord)!;
      frequency.count++;
      
      // Keep context samples (max 3)
      if (frequency.context.length < 3) {
        const contextSnippet = context.substring(0, 100) + '...';
        frequency.context.push(contextSnippet);
      }
    } else {
      wordMap.set(normalizedWord, {
        word: normalizedWord,
        count: 1,
        context: [context.substring(0, 100) + '...']
      });
    }
  }

  private categorizeWords(): void {
    // Categorize Hebrew words
    for (const [word, frequency] of this.hebrewWords.entries()) {
      if (frequency.count >= 20) {
        this.strong_words.add(word);
      } else if (frequency.count >= 5) {
        this.medium_words.add(word);
      } else {
        this.weak_words.add(word);
      }
    }

    // Categorize English words
    for (const [word, frequency] of this.englishWords.entries()) {
      if (frequency.count >= 50) {
        this.strong_words.add(word);
      } else if (frequency.count >= 10) {
        this.medium_words.add(word);
      } else {
        this.weak_words.add(word);
      }
    }
  }

  public async generateAnalysisReport(): Promise<void> {
    if (!is_active) {
      Logger.info('🚫 Word frequency analyzer inactive - skipping report generation');
      return;
    }

    Logger.info('📊 Generating word frequency analysis report...');
    
    if (this.processedMessages === 0) {
      Logger.warn('⚠️  No messages were processed - cannot generate meaningful report');
      return;
    }

    this.categorizeWords();

    const hebrewSorted = Array.from(this.hebrewWords.values()).sort((a, b) => b.count - a.count);
    const englishSorted = Array.from(this.englishWords.values()).sort((a, b) => b.count - a.count);

    const report = this.buildReport(hebrewSorted, englishSorted);
    
    try {
      const fileName = 'tradersMind_dict_analysis.txt';
      fs.writeFileSync(fileName, report, 'utf8');
      
      Logger.info(`✅ Word frequency analysis report generated: ${fileName}`);
      Logger.info(`📈 Analysis Summary:
    - Total messages processed: ${this.processedMessages}
    - Hebrew words found: ${this.hebrewWords.size}
    - English words found: ${this.englishWords.size}
    - Strong words: ${this.strong_words.size}
    - Medium words: ${this.medium_words.size}
    - Weak words: ${this.weak_words.size}`);
    } catch (error) {
      Logger.error('❌ Failed to write analysis report:', error);
    }
  }

  private buildReport(hebrewSorted: WordFrequency[], englishSorted: WordFrequency[]): string {
    const analysisDate = new Date().toISOString().split('T')[0];
    
    let report = `TradersMind Dictionary Analysis Report
Generated: ${analysisDate}
Analysis Period: Last 200 days
Messages Processed: ${this.processedMessages}

=====================================
SUMMARY STATISTICS
=====================================
Hebrew Words: ${this.hebrewWords.size}
English Words: ${this.englishWords.size}
Strong Words (high frequency): ${this.strong_words.size}
Medium Words (medium frequency): ${this.medium_words.size}
Weak Words (low frequency): ${this.weak_words.size}

=====================================
HEBREW WORD FREQUENCIES (Top 50)
=====================================
`;

    hebrewSorted.slice(0, 50).forEach((freq, index) => {
      report += `${index + 1}. ${freq.word} (${freq.count} times)\n`;
    });

    report += `

=====================================
ENGLISH WORD FREQUENCIES (Top 50)
=====================================
`;

    englishSorted.slice(0, 50).forEach((freq, index) => {
      report += `${index + 1}. ${freq.word} (${freq.count} times)\n`;
    });

    report += `

=====================================
STRONG WORDS COLLECTION
=====================================
`;
    Array.from(this.strong_words).sort().forEach(word => {
      const freq = this.hebrewWords.get(word) || this.englishWords.get(word);
      report += `${word} (${freq?.count || 0})\n`;
    });

    report += `

=====================================
RECOMMENDATIONS FOR EXCLUSION
=====================================
Words that should potentially be excluded from indexing:

High Frequency Common Words:
`;

    // Show high-frequency words that might be too common
    const commonCandidates = [...hebrewSorted, ...englishSorted]
      .filter(f => f.count > 30)
      .slice(0, 20);

    commonCandidates.forEach(freq => {
      report += `- ${freq.word} (${freq.count} occurrences) - Consider if too generic\n`;
    });

    report += `

Technical Abbreviations Found:
`;

    const technicalPattern = /^[A-Z]{2,6}[0-9]*$/;
    englishSorted
      .filter(f => technicalPattern.test(f.word.toUpperCase()))
      .slice(0, 15)
      .forEach(freq => {
        report += `- ${freq.word} (${freq.count} occurrences) - Likely abbreviation\n`;
      });

    return report;
  }
}