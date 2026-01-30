import { test, expect } from '@playwright/test';
import { SymbolDetector } from '../src/services/SymbolDetector';

test.describe('SymbolDetector', () => {
  let symbolDetector: SymbolDetector;

  test.beforeEach(() => {
    symbolDetector = new SymbolDetector();
  });

  test.describe('detectSymbols', () => {
    test('should detect valid stock symbols', () => {
      const content = 'Check out AAPL and MSFT for good trades';
      const symbols = symbolDetector.detectSymbols(content);

      expect(symbols).toHaveLength(2);
      expect(symbols.map(s => s.symbol)).toContain('AAPL');
      expect(symbols.map(s => s.symbol)).toContain('MSFT');
    });

    test('should filter out common words', () => {
      const content = 'THE quick AND brown FOR jumps OVER the lazy dog';
      const symbols = symbolDetector.detectSymbols(content);

      expect(symbols).toHaveLength(0);
    });

    test('should detect symbols with $ prefix with higher confidence', () => {
      const content = 'Buy $AAPL and MSFT';
      const symbols = symbolDetector.detectSymbols(content);

      const aaplSymbol = symbols.find(s => s.symbol === 'AAPL');
      const msftSymbol = symbols.find(s => s.symbol === 'MSFT');

      expect(aaplSymbol?.confidence).toBeGreaterThan(msftSymbol?.confidence || 0);
    });

    test('should limit to 25 symbols maximum', () => {
      const manySymbols = Array.from({ length: 30 }, (_, i) => `SYM${i.toString().padStart(2, '0')}`).join(' ');
      const symbols = symbolDetector.detectSymbols(manySymbols);

      expect(symbols.length).toBeLessThanOrEqual(25);
    });

    test('should sort symbols by confidence', () => {
      const content = 'Buy $AAPL and MSFT and check GOOGL';
      const symbols = symbolDetector.detectSymbols(content);

      for (let i = 1; i < symbols.length; i++) {
        expect(symbols[i - 1]!.confidence).toBeGreaterThanOrEqual(symbols[i]!.confidence);
      }
    });
  });

  test.describe('isLikelyStockSymbol', () => {
    test('should return true for valid symbols', () => {
      expect(symbolDetector.isLikelyStockSymbol('AAPL')).toBe(true);
      expect(symbolDetector.isLikelyStockSymbol('MSFT')).toBe(true);
      expect(symbolDetector.isLikelyStockSymbol('GOOGL')).toBe(true);
    });

    test('should return false for common words', () => {
      expect(symbolDetector.isLikelyStockSymbol('THE')).toBe(false);
      expect(symbolDetector.isLikelyStockSymbol('AND')).toBe(false);
      expect(symbolDetector.isLikelyStockSymbol('FOR')).toBe(false);
    });

    test('should return false for invalid lengths', () => {
      expect(symbolDetector.isLikelyStockSymbol('')).toBe(false);
      expect(symbolDetector.isLikelyStockSymbol('TOOLONG')).toBe(false);
    });

    test('should return false for non-uppercase', () => {
      expect(symbolDetector.isLikelyStockSymbol('aapl')).toBe(false);
      expect(symbolDetector.isLikelyStockSymbol('Aapl')).toBe(false);
    });
  });
});
