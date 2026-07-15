# Agents Guide

Guide for AI agents working with the Community Archive database.

**Canonical agent entry point:**
[`https://www.community-archive.org/llms.txt`](https://www.community-archive.org/llms.txt)

## Choose an access method

- **Bulk or corpus-wide analysis:** use the Parquet dump linked from the
  [GitHub data release](https://github.com/TheExGenesis/community-archive/releases/tag/data_export).
  Do not page through millions of API rows.
- **Filtered or application queries:** use the read-only Supabase REST API
  described below and in [api-doc.md](./api-doc.md).
- **One user's processed archive:** fetch
  `https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/archives/<lowercase-username>/archive.json`.

The current bulk file is
[`enriched_tweets.parquet`](https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/enriched_tweets/enriched_tweets.parquet).
Treat the GitHub release page as canonical for current export notes and the
download link.

## Overview

The Community Archive stores Twitter/X archive data in a PostgreSQL database hosted on Supabase. Data is organized around users (accounts), their tweets, and social graph relationships.

## Database Schema

### Core Tables

**User/Account Data:**

- `all_account` - Basic account info (account_id, username, display_name, stats)
- `all_profile` - Profile details (bio, website, location, avatar/header URLs)
- `archive_upload` - Tracks archive uploads with phases (uploading → ready_for_commit → committing → completed → failed)

**Tweet Data:**

- `tweets` - Core tweet content (tweet_id, account_id, full_text, timestamps, engagement metrics)
- `retweets` - Links tweets to retweeted tweets
- `quote_tweets` - Links tweets to quoted tweets
- `conversations` - Groups tweets by conversation_id
- `user_mentions` - Links tweets to mentioned users
- `mentioned_users` - User info for mentioned accounts
- `tweet_urls` - URLs extracted from tweets
- `tweet_media` - Media attachments (images, videos)

**Social Graph:**

- `followers` - Follower relationships
- `following` - Following relationships
- `likes` - Links accounts to liked tweets
- `liked_tweets` - Full text of liked tweets (separate table)

**Views:**

- `enriched_tweets` - Tweets joined with account/profile data, conversation_id, quoted_tweet_id

### Key Relationships

```
all_account (1) ──→ (many) tweets
all_account (1) ──→ (many) all_profile (via archive_upload_id)
tweets (1) ──→ (many) user_mentions
tweets (1) ──→ (many) tweet_urls
tweets (1) ──→ (many) tweet_media
tweets (1) ──→ (0..1) retweets
tweets (1) ──→ (0..1) quote_tweets
tweets (1) ──→ (0..1) conversations
```

### Important Fields

- `account_id` (TEXT) - Primary identifier for users, used across tables
- `tweet_id` (TEXT) - Primary identifier for tweets
- `username` (TEXT) - Lowercase Twitter handle
- `archive_upload_id` (BIGINT) - Links data to specific archive uploads
- `created_at` (TIMESTAMP WITH TIME ZONE) - Timestamp fields are timezone-aware
- `full_text` (TEXT) - Tweet content (full text, not truncated)
- `fts` (tsvector) - Full-text search vector on tweets.full_text and liked_tweets.full_text

## API Access

**Base URL:** `https://fabxmporizzqflnftavs.supabase.co`

**Authorization:** Use the anon key for read access:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8
```

**Raw Archive Storage:** Individual user archives available at:
`/storage/v1/object/public/archives/<username>/archive.json`

**Interactive reference:**
[`https://www.community-archive.org/api/reference`](https://www.community-archive.org/api/reference)

**OpenAPI specification:**
[`https://www.community-archive.org/openapi.json`](https://www.community-archive.org/openapi.json)

See [api-doc.md](./api-doc.md) for copy-pasteable REST, JavaScript, and
pagination examples.

## Common Query Patterns

### Get User Account ID from Username

```sql
SELECT account_id FROM all_account WHERE lower(username) = 'defenderofbasic';
```

### Get All Tweets for a User

```sql
SELECT * FROM tweets
WHERE account_id = '1680757426889342977'
ORDER BY created_at DESC;
```

### Get Tweets with Full Context (using enriched_tweets view)

```sql
SELECT * FROM enriched_tweets
WHERE lower(username) = 'defenderofbasic'
ORDER BY created_at DESC
LIMIT 100;
```

### Search Tweets by Full-Text

```sql
SELECT * FROM tweets
WHERE fts @@ to_tsquery('english', 'search & terms')
ORDER BY created_at DESC;
```

### Get Conversation Thread

```sql
SELECT * FROM enriched_tweets
WHERE conversation_id = (
  SELECT conversation_id FROM conversations
  WHERE tweet_id = '1234567890'
)
ORDER BY created_at ASC;
```

### Get Replies to a Tweet

```sql
SELECT * FROM tweets
WHERE reply_to_tweet_id = '1234567890'
ORDER BY created_at ASC;
```

### Get User's Most Liked Tweets

```sql
SELECT * FROM tweets
WHERE account_id = '1680757426889342977'
ORDER BY favorite_count DESC
LIMIT 10;
```

### Get Followers/Following

```sql
-- Followers
SELECT a.* FROM all_account a
JOIN followers f ON a.account_id = f.follower_account_id
WHERE f.account_id = '1680757426889342977';

-- Following
SELECT a.* FROM all_account a
JOIN following f ON a.account_id = f.following_account_id
WHERE f.account_id = '1680757426889342977';
```

### Get Liked Tweets for a User

```sql
SELECT lt.* FROM liked_tweets lt
JOIN likes l ON lt.tweet_id = l.liked_tweet_id
WHERE l.account_id = '1680757426889342977'
ORDER BY l.updated_at DESC;
```

### Get Tweets with Media

```sql
SELECT t.*, tm.media_url, tm.media_type
FROM tweets t
JOIN tweet_media tm ON t.tweet_id = tm.tweet_id
WHERE t.account_id = '1680757426889342977';
```

### Get Tweets Mentioning a User

```sql
SELECT t.* FROM tweets t
JOIN user_mentions um ON t.tweet_id = um.tweet_id
WHERE um.mentioned_user_id = '1680757426889342977';
```

## Data Types & Constraints

- **IDs**: All IDs are TEXT (not integers) - Twitter uses string IDs
- **Timestamps**: All timestamps are `TIMESTAMP WITH TIME ZONE`
- **Username**: Original casing may be preserved in `all_account.username`;
  compare case-insensitively when needed
- **Archive Uploads**: Data is linked to `archive_upload` records via `archive_upload_id`
- **Full-Text Search**: Use PostgreSQL's `tsvector`/`tsquery` for text search on `tweets.fts` and `liked_tweets.fts`

## Notes for Agents

1. **Username Lookup**: API rows preserve username casing. Use a
   case-insensitive comparison when the original casing is unknown. Public raw
   archive storage paths use lowercase usernames.
2. **Pagination**: API responses are capped at 1,000 rows. Use `limit` and
   `offset` with a stable `order`, or use the bulk Parquet dump for
   full-corpus work (see [api-doc.md](./api-doc.md)).
3. **Archive Uploads**: Multiple uploads per user are possible - `all_profile` can have multiple rows per `account_id` with different `archive_upload_id`
4. **Retweets**: Check `retweets` table to distinguish retweets from original tweets
5. **Quote Tweets**: Use `quote_tweets` to find quoted tweet relationships
6. **Conversations**: Use `conversations.conversation_id` to group related tweets
7. **Replies**: Use `reply_to_tweet_id` and `reply_to_user_id` to trace reply chains
8. **Media**: Media URLs may expire - stored at time of archive upload
9. **Likes**: Liked tweets are stored separately in `liked_tweets` table with full text

## Related Documentation

- [API Documentation](./api-doc.md) - How to query the database via Supabase API
- [Bulk Data Release](https://github.com/TheExGenesis/community-archive/releases/tag/data_export) - Canonical dump notes and download link
- [Website Docs](https://www.community-archive.org/docs) - Agent, API, and bulk-data quickstart
- [Archive Data Structure](./archive_data.md) - Structure of raw archive JSON files
- [Local Setup](./local-setup.md) - Setting up local development environment
- [Examples](../docs/examples/) - Code examples for common operations
