import { test, expect } from '@playwright/test';

test('Simple deals test', async () => {
  // Just test that the test framework works
  expect(1 + 1).toBe(2);
});

test('Test createdeals import', async () => {
  const createdealsCommand = await import('../src/commands/createdeals');
  expect(createdealsCommand).toBeDefined();
  expect(typeof createdealsCommand.execute).toBe('function');
});