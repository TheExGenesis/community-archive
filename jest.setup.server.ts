import { QueryCache } from '@tanstack/react-query'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables for tests
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// Set NODE_ENV for tests if not already set
if (!process.env.NODE_ENV) {
  ;(process.env as any).NODE_ENV = 'test'
}

const queryCache = new QueryCache()

beforeEach(() => {
  // Any setup you need before each test
})

afterEach(() => {
  queryCache.clear()
  // Any cleanup you need after each test
})
