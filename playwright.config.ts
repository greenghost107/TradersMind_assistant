import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Run bot integration tests for Playwright
  testMatch: ['**/bot-shutdown-cleanup.spec.ts', '**/hebrew-button-flow.spec.ts', '**/createbuttons-command.spec.ts', '**/symbol-detection.spec.ts', '**/dynamic-symbol-allowlist.spec.ts', '**/sofi-indexing-bug.spec.ts', '**/ibd-reference-filtering.spec.ts', '**/symbol-message-slash-command-not-indexed.spec.ts', '**/button-points-to-latest-analysis.spec.ts', '**/timestamp-comparison-simple.spec.ts', '**/historical-scraper-chronological-bug.spec.ts'],
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