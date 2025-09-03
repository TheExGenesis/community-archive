# Database Insertion Testing Guide

## Overview

Our testing strategy for database insertion uses real database connections to ensure complete integration testing. We achieve test isolation and safety through:

1. **Unique Test Account IDs** - Each test uses a unique ID prefixed with `test_` and timestamp
2. **Temp Table Isolation** - Leveraging existing temp table system with account ID suffixes
3. **Comprehensive Cleanup** - Automatic cleanup after each test, even on failure
4. **Data Tracking** - Track all inserted data for reliable cleanup

## Test Structure

```
src/lib/
├── test-fixtures/
│   ├── mock-data-builders.ts      # Helper functions for building test data
│   ├── generate-mock-archives.ts  # Mock archive generators
│   ├── test-db-utils.ts          # Test database utilities
│   └── generated/                 # Generated mock archives
└── db-insertion.test.ts          # Main test suite
```

## Running Tests

### Prerequisites

1. Set up environment variables in `.env.local`:
```bash
# For local Supabase
NEXT_PUBLIC_LOCAL_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_LOCAL_SERVICE_ROLE=your-local-service-role-key
NEXT_PUBLIC_LOCAL_ANON_KEY=your-local-anon-key

# For remote dev database
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE=your-service-role-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Choose which to use
NEXT_PUBLIC_USE_REMOTE_DEV_DB=true  # or false for local
```

2. Install dependencies:
```bash
pnpm install
```

3. Generate mock archives:
```bash
pnpm dev:generate-mock-archives
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run only server tests (includes db insertion)
pnpm test:server

# Run specific test file
pnpm test src/lib/db-insertion.test.ts

# Run with coverage
pnpm test --coverage

# Run in watch mode
pnpm test --watch
```

## Test Utilities

### `test-db-utils.ts`

Key functions:

- `generateTestAccountId()` - Create unique test account ID
- `createTestClient()` - Create Supabase client for tests
- `TestDataTracker` - Track inserted data for cleanup
- `cleanupTestData()` - Remove all test data
- `verifyInsertion()` - Verify data was inserted correctly
- `waitForCommit()` - Wait for async processing
- `cleanupOldTestData()` - Clean up orphaned test data

### Mock Archives

Two types of mock archives:

1. **Small Exhaustive** (`small-exhaustive.json`)
   - ~15 tweets covering all edge cases
   - Comprehensive entity testing
   - Note tweet patching
   - Character sanitization
   - Deduplication scenarios

2. **Large Benchmark** (`large-benchmark.json`)
   - 50,000 tweets for performance testing
   - Realistic data distribution
   - 25,000 likes with duplicates
   - 5,000 followers / 2,000 following

## Test Categories

### 1. Basic Insertion
- Minimal archive insertion
- Account and profile creation
- Empty arrays handling

### 2. Entity Processing
- User mentions extraction
- Media attachment handling
- URL extraction
- Hashtags and symbols

### 3. Note Tweet Processing
- Patching truncated tweets
- Matching by text + timestamp
- Handling orphan note tweets

### 4. Deduplication
- Like deduplication by tweet ID
- User mention deduplication
- Follower/following uniqueness

### 5. Character Sanitization
- Null byte removal
- Control character handling
- Unicode preservation
- Emoji support

### 6. Performance
- Large dataset handling
- Batch processing
- Memory usage
- Processing time benchmarks

### 7. Error Handling
- Missing required fields
- Malformed data
- Database constraints
- Network failures

## Cleanup Strategy

### Automatic Cleanup

Tests use a three-tier cleanup strategy:

1. **After Each Test** - Clean up test data immediately
2. **On Test Failure** - Cleanup in `afterEach` ensures cleanup even on failure
3. **Before Test Suite** - Clean up old test data from previous runs

### Manual Cleanup

If needed, manually clean up test data:

```typescript
import { cleanupOldTestData, createTestClient } from '@/lib/test-fixtures/test-db-utils'

const supabase = createTestClient()
await cleanupOldTestData(supabase, 0) // Clean all test data
```

Or via SQL:
```sql
-- Delete all test accounts and related data
DELETE FROM all_account WHERE account_id LIKE 'test_%';

-- Drop all test temp tables
SELECT public.drop_temp_tables(account_id) 
FROM all_account 
WHERE account_id LIKE 'test_%';
```

## Best Practices

1. **Always use test account IDs** - Never use production-like account IDs
2. **Track all data** - Use `TestDataTracker` for all inserted data
3. **Clean up immediately** - Don't leave test data in database
4. **Test in isolation** - Each test should be independent
5. **Use appropriate timeouts** - Database operations may take time
6. **Log progress** - Help debug failing tests
7. **Verify insertion** - Always verify data was inserted correctly

## Troubleshooting

### Tests failing with "Not authenticated"
- Check service role key is set correctly
- Ensure using correct database (local vs remote)

### Cleanup not working
- Check if test account IDs are being tracked
- Verify database permissions
- Look for foreign key constraints

### Tests timing out
- Increase Jest timeout: `jest.setTimeout(60000)`
- Check database connection
- Reduce test data size

### Conflicts between tests
- Ensure unique account IDs
- Check for proper cleanup
- Run tests serially if needed: `--runInBand`

## CI/CD Integration

For CI/CD pipelines:

1. Set up test database
2. Configure environment variables
3. Run tests with coverage:
```bash
pnpm test:ci --coverage
```

4. Clean up after tests:
```bash
# Add to CI cleanup step
node -e "
  const { cleanupOldTestData, createTestClient } = require('./src/lib/test-fixtures/test-db-utils');
  cleanupOldTestData(createTestClient(), 0).then(() => process.exit(0));
"
```

## Future Improvements

Potential enhancements:

1. **Transaction support** - Rollback tests using transactions
2. **Parallel test execution** - Run tests in parallel with better isolation
3. **Test data factories** - More sophisticated data generation
4. **Performance benchmarks** - Track performance over time
5. **Visual test reports** - Better test result visualization
6. **Snapshot testing** - Compare database state snapshots