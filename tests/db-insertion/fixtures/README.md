# Mock Archive Test Fixtures

This directory contains mock Twitter archive data generators for testing database insertion functionality.

## Files

- `mock-data-builders.ts` - Helper functions to build various archive data structures
- `generate-mock-archives.ts` - Main generator script (TypeScript version)
- `generate-mock-archives.js` - Simplified generator script (JavaScript version for quick testing)
- `generated/` - Output directory for generated mock archives

## Usage

### Generate Mock Archives

Run the generator script to create both small and large mock archives:

```bash
# Using npm script (JavaScript version - no dependencies needed)
pnpm dev:generate-mock-archives

# Using TypeScript version (requires tsx and node_modules installed)
pnpm dev:generate-mock-archives-ts
```

This will generate two files in `generated/`:
- `small-exhaustive.json` - Comprehensive test archive with edge cases (~15 tweets)
- `large-benchmark.json` - Large archive for performance testing (50,000 tweets)

### Small Exhaustive Archive

The small archive contains carefully crafted test cases covering:
- Basic tweets with minimal fields
- Tweets with replies and mentions
- Tweets with media (photos, videos)
- Tweets with URLs and hashtags
- Note tweets (long-form content)
- Problematic characters requiring sanitization
- Very large IDs (edge case)
- Unicode and emoji handling
- Duplicate likes (deduplication test)
- Self-follows (edge case)
- Community tweets
- Empty/missing optional fields

### Large Benchmark Archive

The large archive simulates realistic Twitter usage with:
- 50,000 tweets with realistic distribution
- 25,000 likes (with 10% duplicates for deduplication testing)
- 5,000 followers
- 2,000 following
- 5% of tweets have note tweets
- Realistic entity distribution:
  - 30% are replies
  - 20% have mentions
  - 15% have media
  - 25% have URLs
  - 40% have hashtags

## Using in Tests

```typescript
import { generateSmallExhaustiveMockArchive } from '@/lib/test-fixtures/generate-mock-archives'
import { insertArchiveForProcessing } from '@/lib/db_insert'

describe('Archive Insertion Tests', () => {
  it('should insert all tweets correctly', async () => {
    const mockArchive = generateSmallExhaustiveMockArchive()
    
    await insertArchiveForProcessing(
      supabase,
      mockArchive,
      (progress) => {}
    )
    
    // Verify insertion
    const tweets = await supabase
      .from('tweets')
      .select('*')
      .eq('account_id', '123456789')
    
    expect(tweets.data?.length).toBe(mockArchive.tweets.length)
  })
})
```

## Customizing Mock Data

You can customize the large archive generation:

```typescript
const customArchive = generateLargeBenchmarkArchive({
  tweetCount: 100000,      // More tweets
  likeCount: 50000,        // More likes
  followerCount: 10000,    // More followers
  followingCount: 5000,    // More following
  noteTweetPercentage: 0.1 // 10% of tweets have note tweets
})
```

## Test Coverage

The mock archives help test:
1. **Data Insertion**: Correct mapping of all fields
2. **Entity Extraction**: User mentions, media, URLs, hashtags
3. **Note Tweet Patching**: Matching and expanding truncated tweets
4. **Character Sanitization**: Handling problematic characters
5. **Deduplication**: Removing duplicate likes and mentions
6. **Batch Processing**: Handling large datasets efficiently
7. **Edge Cases**: Empty fields, very large IDs, self-follows
8. **Unicode Support**: Emojis and international characters
9. **Performance**: Processing speed with large datasets
10. **Data Integrity**: Constraint validation and upsert behavior