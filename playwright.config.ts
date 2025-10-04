import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Run bot integration tests for Playwright
  testMatch: ['**/bot-shutdown-cleanup.spec.ts', '**/hebrew-button-flow.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'unit-tests',
    },
  ],
});