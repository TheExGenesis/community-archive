const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const commonConfig = {
  setupFiles: ['<rootDir>/jest.polyfills.js'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees/'],
  watchPathIgnorePatterns: ['<rootDir>/.claude/worktrees/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^server-only$': '<rootDir>/jest.server-only.js',
  },
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      { jsc: { transform: { react: { runtime: 'automatic' } } } },
    ],
  },
}

const customJestConfig = {
  projects: [
    {
      ...commonConfig,
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/lib/**/*.test.{js,jsx,ts,tsx}',
        '<rootDir>/tests/admin-search-sanitize.test.ts',
        '<rootDir>/tests/archive-processor/**/*.test.{js,jsx,ts,tsx}',
      ],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.server.ts'],
    },
    {
      ...commonConfig,
      displayName: 'client',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/**/*.test.{js,jsx,ts,tsx}'],
      testPathIgnorePatterns: ['<rootDir>/src/lib/'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    },
    {
      ...commonConfig,
      displayName: 'db-schema',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/tests/db-schema/**/*.test.{js,jsx,ts,tsx}',
      ],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.server.ts'],
    },
    {
      ...commonConfig,
      displayName: 'db-insertion',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/tests/db-insertion/**/*.test.{js,jsx,ts,tsx}',
      ],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.server.ts'],
    },
  ],
}

module.exports = createJestConfig(customJestConfig)
