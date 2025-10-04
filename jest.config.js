module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests', '<rootDir>/test-jest'],
  testMatch: [
    '**/__tests__/**/*.test.ts', 
    '**/tests/**/*.spec.ts', 
    '**/test-jest/**/*.test.ts'
  ],
  // Exclude Playwright tests from Jest
  testPathIgnorePatterns: [
    '/node_modules/',
    'bot-shutdown-cleanup.spec.ts',
    'hebrew-analysis-indexing.spec.ts',
    'top-picks-over-25-symbols.spec.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/deploy-commands.ts',
    '!src/bot.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};