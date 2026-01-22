import { test, expect } from '@playwright/test';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Hebrew Message Not Indexed Tests', () => {
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
  });

  test('should not index Hebrew message without symbols in first line', async () => {
    const mockMessage = {
      id: 'test-hebrew-not-indexed-no-symbols',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'השוק נראה טוב היום, צפוי לעלייה\nכמה מניות חזקות:\n$JPM $AEM $ROKU נעים מעולה',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    // This should NOT be indexed - first line has no symbols, so detection stops there
    await analysisLinker.indexMessage(mockMessage);
    
    // Verify none of the symbols have analysis data (symbols only in subsequent lines)
    expect(analysisLinker.hasAnalysisFor('JPM')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('AEM')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('ROKU')).toBe(false);
    
    // Verify no symbols are tracked
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should not index English message with minimal content', async () => {
    const mockMessage = {
      id: 'test-english-not-indexed',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: '$AAPL good',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    // This should NOT be indexed - very minimal content, no technical analysis
    await analysisLinker.indexMessage(mockMessage);
    
    // Verify symbol is not indexed due to low content quality
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(false);
    
    // Verify no symbols are tracked
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should index Hebrew message from original request because it has strong technical content in first line', async () => {
    const mockMessage = {
      id: 'test-hebrew-indexed-original',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: '✅ ג\'יי פי מורגן $JPM נעה בצורה מעולה ובבלו סקייס.\n✅ מניית $AEM נעה בצורה מעולה ועם חוזקה של הזהב.\n✅ פוטו הולדינגס $FUTU פלאט לסשן נע עם הממוצע שכבר מבטיח רווח עד לדיווח שלה.\n✅ רוקו $ROKU נראית מעולה ומעל כל הממוצעים שלה ומעל קו הפריצה לסטייג\' 2. \n✅ מניית $WGS עם realtive strength טוב וחזרה למסחר מעל ה-EMA20 וקו הפריצה של הקונסולידציה ובאזורי ה-52WH.\n❌ פלנטיר $PLTR היחידה שמקרטעת כרגע, אני עם חצי פוזיציה שם ובינתיים בפנים עם ה-50DMA כרגע.\n\n❗ מזכיר על מה שכתבתי כל יום במהלך השבוע: \n⚠️ לא לראות קצת ירוק וישר להשתגע ולעבור מ-CASH לפול פוזציות.\nהשוק עדיין במצב "רגיש". לאט לאט, פוזיציה אחר פוזיציה ולפי הפידבק להמשיך.\nפורטפוליו פידבק איס קינג💎\n\nכל יום אני כותב את זה מחדש וכל יום מעלה קטע אחר ממומנטום מאסטרס בנושא וכל פעם כותב את זה ובמיוחד בכניסה שלי לג\'יי פי מורגן ואני מעתיק את ההודעה:\n❗ סביבת מסחר לבחירת סטאפים בפיצנטה. ואולי עדיף לקחת סלואו מוברס שהן לרוב מתבררות כעסקאות הטובות ביותר וה-"בריאות ביותר" נקרא לזה ככה.\n⁠סטאפים-לונג💰📈⁠\n\nלילה טוב לכולם ניפגש מחר🫶 \n@everyone',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    // This WILL be indexed because the first line contains technical Hebrew terms
    // that trigger the Hebrew+symbol pattern bonus
    await analysisLinker.indexMessage(mockMessage);
    
    // Only JPM from first line is analyzed and indexed due to "בבלו סקייס" (strong technical term)
    expect(analysisLinker.hasAnalysisFor('JPM')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('AEM')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('FUTU')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('ROKU')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('WGS')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('PLTR')).toBe(false);
    
    // Verify one symbol is tracked
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(1);
  });

  test('should index first line with Hebrew technical terms despite being part of multi-symbol message', async () => {
    const mockMessage = {
      id: 'test-hebrew-not-indexed-2',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: '✅ $AAPL בפריצה חדשה\n✅ $TSLA נע בחוזקה\n✅ $NVDA מעל הממוצעים\n✅ $MSFT במומנטום טוב\n❌ $AMD נחלש קצת\n\nזה לא ניתוח טכני מעמיק אלא רק עדכון מהיר על המניות.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    // This WILL be indexed - only first line analyzed: "✅ $AAPL בפריצה חדשה"
    // "פריצה" (breakout) is a strong Hebrew keyword, giving this a high relevance score
    await analysisLinker.indexMessage(mockMessage);
    
    // Only AAPL from first line should be indexed
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('TSLA')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('NVDA')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('MSFT')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('AMD')).toBe(false);
    
    // Verify only one symbol is tracked
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(1);
  });

  test('should not index message with very high symbol density and minimal content', async () => {
    const mockMessage = {
      id: 'test-hebrew-not-indexed-3',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: '$JPM $AEM $ROKU $WGS $PLTR $FUTU כולם נעים טוב',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    // This should NOT be indexed due to very high symbol density (6 symbols, few words)
    // Symbol density penalty should overcome Hebrew keyword bonuses
    await analysisLinker.indexMessage(mockMessage);
    
    // Verify none of the symbols have analysis data
    expect(analysisLinker.hasAnalysisFor('JPM')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('AEM')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('ROKU')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('WGS')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('PLTR')).toBe(false);
    expect(analysisLinker.hasAnalysisFor('FUTU')).toBe(false);
    
    // Verify no symbols are tracked
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });

  test('should index Hebrew message with general market commentary because it has Hebrew pattern bonus', async () => {
    const mockMessage = {
      id: 'test-hebrew-indexed-goodnight',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'השוק נע טוב היום. כמה מניות בחוזקה כמו $JPM ו $ROKU.\nלילה טוב לכולם, ניפגש מחר 🫶\n@everyone',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    // This WILL be indexed - gets Hebrew+symbol pattern bonus that pushes score above 0.7
    await analysisLinker.indexMessage(mockMessage);
    
    // Both symbols will be indexed because of Hebrew content bonus
    expect(analysisLinker.hasAnalysisFor('JPM')).toBe(true);
    expect(analysisLinker.hasAnalysisFor('ROKU')).toBe(true);
    
    // Verify symbols are tracked
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(2);
  });

  test('should index Hebrew message with proper technical analysis when symbol is in first line', async () => {
    const mockMessage = {
      id: 'test-hebrew-indexed-1',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: '$JPM ניתוח טכני מפורט - ברייקאאוט חזק מעל ה-EMA20 עם ווליום גבוה\nפריצה של קו הטרנד האלכסוני מהשיא הקודם. התמיכה חזקה ב-150 והמטרה 165. relative strength מצוין מול השוק הרחב. המומנטום חיובי עם RSI מעל 60. המניה נמצאת בסטייג\' 2 של הטרנד העולה ויש לה פוטנציאל להמשיך לבלו סקייס.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    // This SHOULD be indexed - first line contains symbol and strong Hebrew technical terms
    await analysisLinker.indexMessage(mockMessage);
    
    // Verify the symbol has analysis data
    expect(analysisLinker.hasAnalysisFor('JPM')).toBe(true);
    
    // Verify symbol is tracked
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(1);
    
    const analysis = await analysisLinker.getLatestAnalysis('JPM', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should handle bot messages correctly', async () => {
    const botMessage = {
      id: 'test-hebrew-bot',
      author: { bot: true, id: 'bot1', tag: 'TestBot#1234' },
      content: '✅ $JPM נע בצורה מעולה\n✅ $ROKU נראית טובה\n@everyone',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestBot' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(botMessage);
    
    // Bot messages should be ignored completely
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });
});