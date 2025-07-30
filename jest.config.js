const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const commonConfig = {
  setupFiles: ['<rootDir>/jest.polyfills.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
  },
}

const customJestConfig = {
  projects: [
    {
      ...commonConfig,
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/lib/**/*.test.{js,jsx,ts,tsx}'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.server.ts'],
    },
    {
      ...commonConfig,
      displayName: 'client',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/src/**/*.test.{js,jsx,ts,tsx}',
        '!<rootDir>/src/lib/**/*.test.{js,jsx,ts,tsx}',
      ],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    },
  ],
}

module.exports = createJestConfig(customJestConfig)
