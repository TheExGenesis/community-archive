# Direct Database Insertion Testing Guide

## Overview

Testing strategy for the **new direct insertion approach** that processes archives server-side and inserts directly into main tables (no temp tables or commit process).

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

### New Approach (Direct)
```
Server → Process Archive → Insert Directly to Main Tables
```

## Test Structure

```
src/lib/
├── test-fixtures/
│   ├── mock-data-builders.ts        # Helper functions for test data
│   ├── generate-mock-archives.ts    # Mock archive generators
│   ├── test-db-utils-direct.ts      # Direct insertion test utilities
│   └── generated/                   # Generated mock archives
└── db-insertion-direct.test.ts      # Direct insertion test suite
```

## Running Tests

### Prerequisites

1. Set up environment variables in `.env.local`:
```bash
# For local Supabase
NEXT_PUBLIC_LOCAL_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_LOCAL_SERVICE_ROLE=your-local-service-role-key

# For remote dev database  
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE=your-service-role-key

# Choose which to use
NEXT_PUBLIC_USE_REMOTE_DEV_DB=true  # or false for local
```

2. Generate mock archives:
```bash
pnpm dev:generate-mock-archives
```

### Running Tests

```bash
# Run direct insertion tests
pnpm test:db

# Watch mode for development
pnpm test:db:watch

# With coverage
pnpm test:db:coverage
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

## Test Utilities (`test-db-utils-direct.ts`)

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
- Increase Jest timeout

## Implementation Notes

The test suite includes a **placeholder** `insertArchiveDirectly()` function that demonstrates the expected interface:

```typescript
const insertArchiveDirectly = async (
  supabase: SupabaseClient,
  archive: Archive,
  progressCallback?: (progress) => void
): Promise<void> => {
  // TODO: Replace with actual implementation
  // Should:
  // 1. Insert account/profile
  // 2. Process tweets with entities
  // 3. Apply note tweet patching
  // 4. Deduplicate likes
  // 5. Insert followers/following
}
```

Replace this with your actual implementation when ready.

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

## Future Improvements

1. **Transaction support** - Wrap tests in transactions for rollback
2. **Parallel execution** - Better test isolation for parallel runs
3. **Mock insertion function** - Replace placeholder with real implementation
4. **Streaming support** - Test streaming/chunked insertion
5. **Error recovery** - Test partial failure scenarios