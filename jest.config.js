const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const commonConfig = {
  setupFiles: ['<rootDir>/jest.polyfills.js'],
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
        '<rootDir>/tests/**/*.test.{js,jsx,ts,tsx}',
      ],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.server.ts'],
    },
    {
      ...commonConfig,
      displayName: 'client',
      testEnvironment: 'jsdom',
      // Client tests use jsdom, but the shared MSW lifecycle runs the
      // node-only setupServer entry from jest.setup.ts.
      testEnvironmentOptions: {
        customExportConditions: ['node', 'node-addons'],
      },
      testMatch: ['<rootDir>/src/**/*.test.{js,jsx,ts,tsx}'],
      testPathIgnorePatterns: ['<rootDir>/src/lib/'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    },
  ],
}

module.exports = createJestConfig(customJestConfig)
