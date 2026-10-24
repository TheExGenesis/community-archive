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
        '<rootDir>/tests/admin-*.test.ts',
      ],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.server.ts'],
    },
    {
      ...commonConfig,
      displayName: 'client',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/**/*.test.{js,jsx,ts,tsx}'],
      testPathIgnorePatterns: ['<rootDir>/src/lib/', '\\.live\\.test\\.tsx$'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    },
    {
      // Page tests on the installed chat hook and Workflow transport: those
      // packages ship as ES modules, so node_modules is transformed here.
      ...commonConfig,
      displayName: 'client-live',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/**/*.live.test.tsx'],
      transformIgnorePatterns: [],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    },
    {
      ...commonConfig,
      displayName: 'db-schema',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/db-schema/**/*.test.{js,jsx,ts,tsx}'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.server.ts'],
    },
    {
      ...commonConfig,
      displayName: 'db-insertion',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/db-insertion/**/*.test.{js,jsx,ts,tsx}'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.server.ts'],
    },
  ],
}

module.exports = createJestConfig(customJestConfig)
