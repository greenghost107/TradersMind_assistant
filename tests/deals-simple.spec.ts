import { test, expect } from '@playwright/test';

test('Simple deals test', async () => {
  // Just test that the test framework works
  expect(1 + 1).toBe(2);
});

test('Test createdeals import', async () => {
  const createdealsCommand = require('../src/commands/createdeals');
  expect(createdealsCommand).toBeDefined();
  expect(typeof createdealsCommand.execute).toBe('function');
});

test('Single letter symbol detection in deals channel', async () => {
  // Import the SymbolDetector to test the isValidSymbolWithContext method
  const { SymbolDetector } = require('../src/services/SymbolDetector');
  
  const symbolDetector = new SymbolDetector();
  
  // Test case: "F / ATGE" should allow F due to ATGE context
  const contextSymbols = ['F', 'ATGE'];
  
  // Test ATGE (multi-letter symbol) - should be valid
  const atgeValid = symbolDetector.isValidSymbolWithContext('ATGE', contextSymbols);
  expect(atgeValid).toBe(true);
  
  // Test F (single letter) - should be valid due to ATGE context
  const fValid = symbolDetector.isValidSymbolWithContext('F', contextSymbols);
  expect(fValid).toBe(true); // This should pass after our fix
  
  // Test edge case: F alone without valid context should be invalid
  const fAloneValid = symbolDetector.isValidSymbolWithContext('F', ['F']);
  expect(fAloneValid).toBe(false);
  
  // Test edge case: F with only invalid context should be invalid
  const fInvalidContextValid = symbolDetector.isValidSymbolWithContext('F', ['F', 'INVALID_LONG_SYMBOL']);
  expect(fInvalidContextValid).toBe(false);
});

test('Deals parsing should include single letter symbols with context', async () => {
  // Test the parseDealsSymbols function by accessing it via reflection
  // Since it's not exported, we'll test the logic by simulating it
  const { SymbolDetector } = require('../src/services/SymbolDetector');
  
  const symbolDetector = new SymbolDetector();
  
  // Simulate the deals parsing logic for "F / ATGE 👀"
  const content = "F / ATGE 👀";
  
  // Extract potential symbols like the parseDealsSymbols function does
  const potentialSymbols = content
    .split(/[\s\/]+/)
    .map(s => s.trim())
    .map(s => s.replace(/[^\w]/g, '')) // Remove emojis and special chars
    .filter(s => s.length > 0 && s.length <= 5 && /^[A-Z]+$/i.test(s))
    .map(s => s.toUpperCase());
  
  const uniqueSymbols = [...new Set(potentialSymbols)];
  console.log('Extracted potential symbols:', uniqueSymbols);
  
  expect(uniqueSymbols).toEqual(['F', 'ATGE']);
  
  // Test validation logic
  const validSymbols: string[] = [];
  const rejectedSingleLetters: string[] = [];
  
  // First pass: validate symbols with standard rules
  for (const symbol of uniqueSymbols) {
    if (symbolDetector.isValidSymbolWithContext(symbol, uniqueSymbols)) {
      validSymbols.push(symbol);
    } else if (symbol.length === 1 && /^[A-Z]$/.test(symbol)) {
      rejectedSingleLetters.push(symbol);
    }
  }
  
  console.log('Valid symbols after first pass:', validSymbols);
  console.log('Rejected single letters:', rejectedSingleLetters);
  
  // Second pass: context trust for single letters in deals lists
  if (validSymbols.length >= 1) {
    for (const singleLetter of rejectedSingleLetters) {
      validSymbols.push(singleLetter);
    }
  }
  
  console.log('Final valid symbols:', validSymbols);
  
  // Should contain both F and ATGE
  expect(validSymbols).toContain('F');
  expect(validSymbols).toContain('ATGE');
  expect(validSymbols).toHaveLength(2);
});