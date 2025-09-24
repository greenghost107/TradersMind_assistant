import { test, expect } from '@playwright/test';
import { AnalysisLinker } from '../src/services/AnalysisLinker';

test.describe('Hebrew Analysis Message Indexing', () => {
  let analysisLinker: AnalysisLinker;

  test.beforeEach(() => {
    analysisLinker = new AnalysisLinker();
  });

  test('should index Hebrew message with breakout terminology', async () => {
    const mockMessage = {
      id: 'test-hebrew-1',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: '$SERV\nעוד יום במשרד ו-ATH חדש🚀\n✍️ ברייקאאוט של ה-AVWAP ATH ב-20 לאוגוסט -> עם follow through והמשכיות לבלו סקייס',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('SERV')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('SERV', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index Hebrew message with relative strength and volume', async () => {
    const mockMessage = {
      id: 'test-hebrew-2',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: '$ATGE\nעם relative strength נהדר אתמול, עולה 6.22%+ בווליום עולה ומעל הממוצע ב-72%.\nיש פה בייסינג של 10 שבועות, אפשר אפילו לראות HTF.\nלזכור מה נכתב תמיד על מניות ששומרות על ה-50DMA שלהן וכאן היא שמרה על הממוצע בצורה נפלאה.\nמקום 9 ב-IBD50 וחלק ממניות הפוקוס אתמול.\nwatch for breakout',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('ATGE')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('ATGE', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index Hebrew message with ATH and new high', async () => {
    const mockMessage = {
      id: 'test-hebrew-3',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'מניית $ATGE✅\nעולה 0.51%+ אתמול ועושה עוד שיא כל הזמנים חדש בווליום עולה ומעל הממוצע🚀\nבאונס מדויק ה-EMA20, שמירה על הסטאפ רץ ורייד ווינרס.\n✍️ ברייקאאוט של קו פריצה אלכסון מהשיא + ה-AVWAP ATH + ה-50DMA.\n💡אין מכניקת עבודה טובה יותר מלנוע בעסקה עם הממוצע של השורט טרם טרנד עד שהוא נשבר. רק ככה תופסים תנועות!',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('ATGE')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('ATGE', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index Hebrew message with inside candle retest', async () => {
    const mockMessage = {
      id: 'test-hebrew-4',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'קורווב $CRWV✅ 👀\nאינסייד קנדל כריטסט לפריצה, מהאינסיידים האהובים עלינ מה שנקרא : )\nיום רביעי ה-10 לספטמבר היה הווליום הגדול מאז ההנפקה.\nהמניה הזו ברגע שמחליטה לנוע יכולה לטוס מהר מאוד. סטאפ קודם הביאה 200%+',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('CRWV')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('CRWV', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index Hebrew message with diagonal breakout line', async () => {
    const mockMessage = {
      id: 'test-hebrew-5',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'דור דאש $DASH ✅\nהראתה relative strength אתמול ועלתה 1.14%+.\nאפשר להוסיף לה קו ברייקאאוט אלכסון מהשיא ופריצה כזו זה אופציה לחיזוק / כניסה חדשה.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('DASH')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('DASH', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index Hebrew message with falling wedge pattern', async () => {
    const mockMessage = {
      id: 'test-hebrew-6',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'אריסטה נטוורקס $ANET✅\nנע עם ה-EMA20 כל עוד הוא נשמר.\nמקום 28 ב-IBD50.\nחלק מה-IBD Sector Leaders לשבוע הזה, לקרוא את הקטע עליה שם למטה:\n⁠🟦ibd-investors⁠\n✍️ ברייקאאוט מ-falling wedge אל תוך ה-EMA20 + ה-AVWAP ATH כל הדרך לבלו סקייס.\n⁠השקעות-טווח-ארוך⏳⁠',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('ANET')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('ANET', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index Hebrew message with 50DMA holding', async () => {
    const mockMessage = {
      id: 'test-hebrew-7',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'מניית $MP\nשמירה על ה-50DMA בצורה נהדרת -> פריצה של ה-AVWAP ATH + קו ברייקאאוט אלכסון מהשיא והמשכיות.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('MP')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('MP', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index Hebrew message with consolidation retest', async () => {
    const mockMessage = {
      id: 'test-hebrew-8',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'אמקור $EME✅ 👀\nריטטס לפריצה, מעניין מאוד לדעתי.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('EME')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('EME', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index simple Hebrew reply message with relevance boost', async () => {
    const mockMessage = {
      id: 'test-hebrew-9',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: '$MSFT\nעושה טוב',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: { messageId: 'parent-msg-1' }
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('MSFT')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('MSFT', 1);
    expect(analysis).toHaveLength(1);
  });

  test('should index mixed Hebrew/English with technical terms', async () => {
    const mockMessage = {
      id: 'test-hebrew-10',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'מייקרוסופט $MSFT וה-AVWAP ATH\nהולכת איתנו לשבוע הבא\nPAYtience',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('MSFT')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('MSFT', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index inside candle from consolidation', async () => {
    const mockMessage = {
      id: 'test-hebrew-11',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'קארבנה $CVNA✅ 👀\nהופה יש לנו אינסייד קנדל מהסוג האהוב מעל קו פריצה מקונסולדיציה של חודש וחצי.',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('CVNA')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('CVNA', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should index Livermore breakout message', async () => {
    const mockMessage = {
      id: 'test-hebrew-12',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: 'מניית $PSIX✅\nאמרנו שברייקאאוט של ליברמור לבל X1 יכול להוציא פה המון פקודות לפועל לכיוון מעלה🚀',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('PSIX')).toBe(true);
    
    const analysis = await analysisLinker.getLatestAnalysis('PSIX', 1);
    expect(analysis).toHaveLength(1);
    expect(analysis[0]?.relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  test('should reject Hebrew messages without technical content', async () => {
    const mockMessage = {
      id: 'test-hebrew-reject-1',
      author: { bot: false, id: 'user1', tag: 'TestUser#1234' },
      content: '$AAPL\nמניה טובה',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestUser' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(mockMessage);
    
    expect(analysisLinker.hasAnalysisFor('AAPL')).toBe(false);
  });

  test('should handle bot messages correctly', async () => {
    const botMessage = {
      id: 'test-hebrew-bot',
      author: { bot: true, id: 'bot1', tag: 'TestBot#1234' },
      content: '$AAPL ברייקאאוט פריצה שיא',
      createdAt: new Date(),
      guildId: 'test-guild',
      channel: { id: 'test-channel', isThread: () => false },
      member: { displayName: 'TestBot' },
      reference: null
    } as any;

    await analysisLinker.indexMessage(botMessage);
    
    expect(analysisLinker.getTrackedSymbolsCount()).toBe(0);
  });
});