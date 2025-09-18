# Direct Database Insertion Testing Guide

## Overview

Testing strategy for the **direct insertion approach** using `ArchiveUploadProcessor` that processes archives server-side and inserts directly into main tables (no temp tables or commit process).

Test isolation is achieved through:

1. **Unique Test Account IDs** - Each test uses `test_<timestamp>_<random>` format
2. **Direct Table Cleanup** - Remove test data directly from main tables
3. **Comprehensive Tracking** - Track all inserted data for reliable cleanup
4. **No Temp Tables** - Focus on end-to-end insertion results

## Architecture Changes

### Old Approach (Temp Tables)
```
Client → Temp Tables → Commit Process → Main Tables
```

### New Approach (Direct with ArchiveUploadProcessor)
```
Server → Process Archive → Insert Directly to Main Tables
```

## Test Structure

```
tests/
├── db-insertion/
│   ├── db-insertion.test.ts         # Main test suite
│   └── fixtures/
│       ├── mock-data-builders.ts    # Helper functions for test data
│       ├── generate-mock-archives.ts # Mock archive generators
│       ├── test-db-utils.ts         # Database utilities
│       ├── test-connection.js       # Connection validation
│       ├── validate-test-structure.js # Structure validation
│       ├── TESTING.md               # This file
│       ├── README.md                # Fixtures documentation
│       └── generated/               # Generated mock archives
│           ├── small-exhaustive.json
│           └── large-benchmark.json
└── jest.config.js                   # Jest configuration
```

## Running Tests

### Prerequisites

1. Set up environment variables in `.env.local`:
```bash
# For local Supabase
# Database Configuration
# Choose between local Supabase or remote dev database
NEXT_PUBLIC_USE_REMOTE_DEV_DB=false  # Set to true for remote DB

# Local Supabase (if NEXT_PUBLIC_USE_REMOTE_DEV_DB=false)
NEXT_PUBLIC_LOCAL_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_LOCAL_SERVICE_ROLE=your-local-service-role-key

# Remote Dev Database (if NEXT_PUBLIC_USE_REMOTE_DEV_DB=true)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE=your-service-role-key

# Choose which to use
NEXT_PUBLIC_USE_REMOTE_DEV_DB=true  # or false for local
# Test-specific (for direct postgres connection)
TESTS_POSTGRES_CONNECTION_STRING=postgresql://postgres:password@localhost:54322/postgres

# Environment
NODE_ENV=test or development
```

2. Generate mock archives:
```bash
pnpm dev:generate-mock-archives
```

3. Validate setup:
```bash
# Test database connectivity
node tests/db-insertion/fixtures/test-connection.js

# Validate test structure
node tests/db-insertion/fixtures/validate-test-structure.js
```

### Running Tests

```bash
# Run direct insertion tests
pnpm test:db

# Watch mode for development
pnpm test:db:watch

# With coverage
pnpm test:db:coverage

# Run specific test file
npx jest tests/db-insertion/db-insertion.test.ts

# Run specific test case
npx jest tests/db-insertion/db-insertion.test.ts -t "should insert account and profile correctly"
```

## Key Differences from Temp Table Approach

### 1. No Temp Table Operations
- ❌ No `create_temp_tables()`
- ❌ No `drop_temp_tables()` 
- ❌ No `commit_temp_data()`
- ✅ Direct insertion to main tables

### 2. Simplified Cleanup
Instead of dropping temp tables, we:
- Delete from main tables using test account IDs
- Track all inserted records
- Clean up in reverse order of foreign key dependencies

### 3. Focus on End Results
Tests verify:
- Final data in main tables
- Correct entity extraction
- Note tweet patching results
- Deduplication effectiveness

## Test Utilities (`test-db-utils.ts`)

### Core Functions

```typescript
// Generate unique test ID
generateTestAccountId(): string

// Create test Supabase client
createTestClient(): SupabaseClient

// Track test data for cleanup
class TestDataTracker {
  addAccountId(id: string)
  addTweetId(id: string)
  addLikedTweetId(id: string)
}

// Clean up test data from main tables
cleanupTestData(supabase, tracker): Promise<void>

// Verify insertion results
verifyInsertion(supabase, expectedData): Promise<Result>

// Verify entity extraction
verifyEntityExtraction(supabase, tweetId): Promise<Entities>

// Verify note tweet patching
verifyNoteTweetPatching(supabase, tweetId, expectedText): Promise<boolean>
```

### Cleanup Order (Important!)

Due to foreign key constraints, cleanup must follow this order:

1. `user_mentions` (references tweets & mentioned_users)
2. `tweet_media` (references tweets)
3. `tweet_urls` (references tweets)
4. `likes` (references accounts & tweets)
5. `liked_tweets`
6. `followers` / `following`
7. `tweets` (must be after entities)
8. `mentioned_users` (orphaned ones)
9. `all_profile`
10. `archive_upload`
11. `all_account` (last)

## Test Categories

### 1. Account & Profile Insertion
```typescript
it('should insert account and profile correctly', async () => {
  // Direct insertion to all_account and all_profile
  // No temp tables involved
})
```

### 2. Tweet Processing
```typescript
it('should insert tweets with entities', async () => {
  // Direct insertion to tweets table
  // Extract and insert entities directly
})
```

### 3. Note Tweet Patching
```typescript
it('should expand tweets with note tweets', async () => {
  // Patch tweets during insertion
  // Verify full_text is expanded
})
```

### 4. Deduplication
```typescript
it('should deduplicate likes by tweet ID', async () => {
  // Insert likes with duplicates
  // Verify only unique ones persist
})
```

### 5. Character Sanitization
```typescript
it('should sanitize problematic characters', async () => {
  // Remove null bytes and control chars
  // Preserve valid Unicode and emojis
})
```

### 6. Batch Processing
```typescript
it('should handle large datasets efficiently', async () => {
  // Test batch insertion performance
  // Verify all data inserted correctly
})
```

## Mock Data

### Small Exhaustive Archive
- 15 tweets with all edge cases
- Note tweet patching scenarios
- Problematic characters
- All entity types
- Deduplication tests

### Large Benchmark Archive  
- Configurable size (default 50,000 tweets)
- Realistic data distribution
- Performance testing
- Memory usage validation

## Best Practices

### 1. Always Track Test Data
```typescript
tracker.addAccountId(testAccountId)
tracker.addTweetId(tweetId)
// Track everything you insert!
```

### 2. Clean Up in afterEach
```typescript
afterEach(async () => {
  if (tracker) {
    await cleanupTestData(supabase, tracker)
  }
})
```

### 3. Use Unique Test IDs
```typescript
const testAccountId = generateTestAccountId()
// Format: test_1735927200123_4567
```

### 4. Verify End Results
```typescript
const result = await verifyInsertion(supabase, {
  accountId: testAccountId,
  tweetCount: 100,
  likeCount: 50
})
```

## Troubleshooting

### Foreign Key Constraint Errors
- Check cleanup order
- Ensure all related data is tracked
- Verify deletion sequence

### Test Data Persisting
```sql
-- Find all test data
SELECT * FROM all_account WHERE account_id LIKE 'test_%';

-- Manual cleanup
DELETE FROM all_account WHERE account_id LIKE 'test_%';
```

### Performance Issues
- Reduce test data size
- Use batch operations
- Increase Jest timeout: `jest.setTimeout(60000)`

### Connection Issues
```bash
# Test database connectivity
node tests/db-insertion/fixtures/test-connection.js

# Check environment variables
echo $NEXT_PUBLIC_LOCAL_SUPABASE_URL
echo $TESTS_POSTGRES_CONNECTION_STRING
```

### Mock Data Issues
```bash
# Regenerate all mock data
npm run dev:generate-mock-archives

# Validate test structure
node tests/db-insertion/fixtures/validate-test-structure.js
```

### Debug Mode
Run tests with additional logging:
```bash
# Enable debug output
DEBUG=true npm test:db

# Run single test with verbose output
npx jest tests/db-insertion/db-insertion.test.ts --verbose --no-cache
```

## Implementation Notes

The test suite uses the `insertArchiveDirectly()` function that integrates with `ArchiveUploadProcessor`:

```typescript
const insertArchiveDirectly = async (
  supabase: SupabaseClient,
  archive: Archive,
  progressCallback?: (progress: { phase: string; percent: number | null }) => void
): Promise<void> => {
  // Creates postgres connection from TESTS_POSTGRES_CONNECTION_STRING
  const sql = postgres(postgresUrl, {
    max: 5,
    idle_timeout: 20,
    prepare: false,
    transform: { undefined: null }
  })
  
  // Uses ArchiveUploadProcessor for actual processing:
  // 1. Insert/update all_account
  // 2. Create archive_upload record
  // 3. Process archive with ArchiveUploadProcessor
  // 4. Mark upload as completed
  const processor = new ArchiveUploadProcessor(sql, archiveUploadId)
  await processor.processArchive(archive)
}
```

This approach provides real end-to-end testing of the actual insertion pipeline.

## CI/CD Integration

```yaml
# Example GitHub Actions
- name: Run DB Tests
  run: |
    pnpm test:db:coverage
    
- name: Cleanup Test Data
  if: always()
  run: |
    node scripts/cleanup-test-data.js
```

## Migration from Temp Tables

When migrating existing tests:

1. Remove temp table operations
2. Update to use direct insertion
3. Adjust cleanup to use main tables
4. Focus on end results, not intermediate states
5. Remove references to `upload_phase` and `ready_for_commit`

## Current Implementation Status

✅ **Real Implementation** - Uses `ArchiveUploadProcessor` for actual processing  
✅ **Direct Database Connection** - Tests use `TESTS_POSTGRES_CONNECTION_STRING` for postgres client  
✅ **Comprehensive Test Coverage** - Account, profile, tweets, entities, deduplication  
✅ **Connection Validation** - Helper scripts for testing setup  
✅ **Mock Data Generation** - Both small exhaustive and large benchmark archives  
✅ **Cleanup Automation** - Thorough test data cleanup with foreign key handling  

## Future Improvements

1. **Transaction support** - Wrap tests in transactions for rollback
2. **Parallel execution** - Better test isolation for parallel runs
3. **Streaming support** - Test streaming/chunked insertion  
4. **Error recovery** - Test partial failure scenarios
5. **Performance benchmarks** - Automated performance regression testing
6. **Database migration testing** - Test schema changes impact