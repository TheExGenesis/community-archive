import { QueryCache } from '@tanstack/react-query'
import { cleanupOldTestData, createTestClient } from '@/lib/test-fixtures/test-db-utils'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables for test environment
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// Set NODE_ENV for tests
process.env.NODE_ENV = 'test'

const queryCache = new QueryCache()

// Global test setup
beforeAll(async () => {
  console.log('🧪 Starting test suite...')
  
  // Clean up old test data from previous runs
  try {
    const supabase = createTestClient()
    await cleanupOldTestData(supabase, 1) // Clean up test data older than 1 hour
    console.log('✅ Old test data cleaned up')
  } catch (error) {
    console.warn('⚠️ Failed to clean up old test data:', error)
  }
})

beforeEach(() => {
  // Clear query cache before each test
  queryCache.clear()
})

afterEach(() => {
  // Clear query cache after each test
  queryCache.clear()
})

afterAll(async () => {
  console.log('🏁 Test suite completed')
  
  // Final cleanup of any remaining test data
  try {
    const supabase = createTestClient()
    await cleanupOldTestData(supabase, 0) // Clean up all test data
    console.log('✅ Final test data cleanup complete')
  } catch (error) {
    console.warn('⚠️ Failed final cleanup:', error)
  }
})

// Add custom matchers if needed
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const pass = uuidRegex.test(received)
    return {
      pass,
      message: () => 
        pass
          ? `expected ${received} not to be a valid UUID`
          : `expected ${received} to be a valid UUID`
    }
  },
  
  toBeValidTwitterId(received: string) {
    const pass = /^\d{1,20}$/.test(received) && received.length <= 20
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid Twitter ID`
          : `expected ${received} to be a valid Twitter ID (numeric string, max 20 digits)`
    }
  }
})

// Extend Jest matchers TypeScript definitions
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R
      toBeValidTwitterId(): R
    }
  }
}