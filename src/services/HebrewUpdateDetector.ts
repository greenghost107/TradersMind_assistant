import { Logger } from '../utils/Logger';

export class HebrewUpdateDetector {
  
  public isHebrewDailyUpdate(content: string): boolean {
    Logger.debug('Checking if message is Hebrew daily update');
    
    // Check for multiple Hebrew section headers with ❗
    const hebrewSectionPattern = /❗\s*[\u0590-\u05FF]/g;
    const hebrewSections = content.match(hebrewSectionPattern);
    
    if (!hebrewSections || hebrewSections.length < 3) {
      Logger.debug(`Hebrew sections found: ${hebrewSections?.length || 0}, need at least 3`);
      return false;
    }
    
    // Check for top picks section with Hebrew "טופ פיקס"
    const topPicksPattern = /❕\s*טופ פיקס/;
    if (!topPicksPattern.test(content)) {
      Logger.debug('No Hebrew top picks section found');
      return false;
    }
    
    // Check for long/short indicators with emoji
    const longShortPattern = /📈\s*long:|📉\s*short:/;
    if (!longShortPattern.test(content)) {
      Logger.debug('No long/short indicators found');
      return false;
    }
    
    // Check for reminder bullets with 🔹
    const reminderPattern = /🔹/g;
    const reminders = content.match(reminderPattern);
    
    if (!reminders || reminders.length < 2) {
      Logger.debug(`Reminder bullets found: ${reminders?.length || 0}, need at least 2`);
      return false;
    }
    
    // Check for short side section
    const shortSidePattern = /🔻\s*שורט סייד/;
    if (!shortSidePattern.test(content)) {
      Logger.debug('No short side section found');
      return false;
    }
    
    Logger.info('Message identified as Hebrew daily update');
    return true;
  }
  
  public extractHebrewSections(content: string): string[] {
    const sections: string[] = [];
    const lines = content.split('\n');
    let currentSection = '';
    
    for (const line of lines) {
      if (line.match(/❗\s*[\u0590-\u05FF]/)) {
        if (currentSection.trim()) {
          sections.push(currentSection.trim());
        }
        currentSection = line;
      } else if (currentSection && line.trim()) {
        currentSection += '\n' + line;
      }
    }
    
    if (currentSection.trim()) {
      sections.push(currentSection.trim());
    }
    
    return sections;
  }
}