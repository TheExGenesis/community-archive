# API guide

There are three currently supported ways to access Community Archive data:

1. Download the consent-safe bulk Parquet package.
2. Query filtered records through the read-only Supabase REST API.
3. Authenticated owners may download their own processed archive through the
   policy-aware web endpoint.

The website version of this guide is at
[`community-archive.org/docs`](https://www.community-archive.org/docs). Agents
should start at
[`community-archive.org/llms.txt`](https://www.community-archive.org/llms.txt).

## Bulk Parquet export

The current consent-safe package contains enriched `tweets.parquet`, separate
`profiles.parquet`, and `manifest.json`. Start from the
[`latest.json` pointer](https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/community-archive-public-export/latest.json)
or the repository's [latest GitHub Release](https://github.com/TheExGenesis/community-archive/releases/latest).

Follow `manifest_url` instead of bookmarking a versioned object. Each nightly
publication re-checks current PostgreSQL membership and opt-outs, publishes the
new package atomically, and removes the superseded package. Historical releases
remain as a publication log, but their versioned file links expire after the
next successful dump.

## REST API

- API URL: `https://fabxmporizzqflnftavs.supabase.co`
- REST URL: `https://fabxmporizzqflnftavs.supabase.co/rest/v1`
- [Interactive API reference](https://www.community-archive.org/api/reference)
- [OpenAPI JSON](https://www.community-archive.org/openapi.json)
- Public anon key:
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8`

The anon key is intentionally public. Send it as both the `apikey` header and
the bearer token. Never expose or request a service-role key.

### Fetch recent tweets for a username with cURL

```bash
export CA_API_URL='https://fabxmporizzqflnftavs.supabase.co'
export CA_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8'

curl --get "$CA_API_URL/rest/v1/enriched_tweets" \
  -H "apikey: $CA_ANON_KEY" \
  -H "Authorization: Bearer $CA_ANON_KEY" \
  --data-urlencode "select=tweet_id,username,created_at,full_text" \
  --data-urlencode "username=ilike.defenderofbasic" \
  --data-urlencode "order=created_at.desc" \
  --data-urlencode "limit=5"
```

`enriched_tweets` is convenient because it joins tweet records with username,
display name, conversation, quote, and avatar fields.

### JavaScript with `@supabase/supabase-js`

```js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://fabxmporizzqflnftavs.supabase.co',
  process.env.CA_ANON_KEY,
)

const { data, error } = await supabase
  .from('enriched_tweets')
  .select('tweet_id, username, created_at, full_text')
  .ilike('username', 'defenderofbasic')
  .order('created_at', { ascending: false })
  .limit(5)

if (error) throw error
console.log(data)
```

### Look up an account ID

```js
const { data, error } = await supabase
  .from('all_account')
  .select('account_id')
  .ilike('username', username)
  .single()

if (error) throw error
const accountId = data.account_id
```

Twitter IDs must remain strings. JavaScript numbers cannot safely represent
every Twitter ID.

### Fetch tweets for an account ID

```js
const { data, error } = await supabase
  .from('tweets')
  .select('tweet_id, created_at, full_text, favorite_count, retweet_count')
  .eq('account_id', accountId)
  .order('created_at', { ascending: false })
  .limit(100)
```

## Filters and pagination

The API uses [PostgREST query syntax](https://postgrest.org/en/stable/references/api/tables_views.html):

- Case-insensitive equality: `username=ilike.defenderofbasic`
- At least: `created_at=gte.2025-01-01`
- Ordering: `order=created_at.desc`
- Columns: `select=tweet_id,username,full_text`
- Page size and offset: `limit=1000&offset=0`

Responses are capped at 1,000 rows. For reliable pagination:

1. Apply a stable order using a unique or indexed column.
2. Request at most 1,000 rows.
3. Increment the offset until a page contains fewer rows than requested.

See
[`scripts/get_all_tweets_paginated.mts`](../scripts/get_all_tweets_paginated.mts)
for a complete example. Run it from the repository root with:

```bash
pnpm script scripts/get_all_tweets_paginated.mts
```

For full-corpus access, prefer the bulk Parquet package instead of paginating
the REST API.

## Raw user archives

While signed in as the matching archive owner, use:

```text
https://www.community-archive.org/api/archive/<username>
```

Example:

<https://www.community-archive.org/api/archive/defenderofbasic>

The object contains archive-shaped sections such as `account`, `profile`,
`tweets`, `follower`, `following`, and optionally `like`. See
[archive_data.md](./archive_data.md) for structure and examples.
