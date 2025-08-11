module.exports = {
  env: {
    node: true,
    es6: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    'no-console': 'off',
    'no-unused-vars': 'off', // TypeScript handles this better
    'prefer-const': 'error',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.ts', // Skip TypeScript files for now since parser isn't configured
    '*.d.ts',
    'tests/',
    'playwright.config.ts'
  ],
};