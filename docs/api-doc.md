# API guide

> **The Supabase REST API described here is retired on 19 November 2026.**
> Use the keyed [Community Archive API v1](https://analytics.community-archive.org/v1/openapi.json)
> instead; the [migration guide](api-v1-migration.md) maps every call. This
> page stays for integrations that have not moved yet.

There are four currently supported ways to access Community Archive data:

1. Download the consent-safe bulk Parquet package.
2. Query filtered records through the read-only Supabase REST API.
3. Search tweets by meaning through the [semantic search API](#semantic-search-api).
4. Authenticated owners may download their own processed archive through the
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

Follow `manifest_url` instead of bookmarking a versioned object. Each successful
publication re-checks current PostgreSQL membership and opt-outs, publishes the
new package atomically, and removes the superseded package. Historical releases
remain as a publication log, but their versioned file links expire after the
next successful dump.

Publication is scheduled nightly, but failed runs leave the previous snapshot
in place. Check `created_at` and source watermarks in the manifest before use;
the release date alone is not a freshness guarantee. Follow `publication.urls`
for the download URLs, and verify sizes and SHA-256 checksums against `files`.
Join tweets to profiles on `account_id`; keep all IDs as strings.

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

## Semantic search API

Find tweets by meaning rather than exact words. The service embeds your query
with the same model used for the corpus and returns the nearest tweets by
cosine similarity. It is open: no key is needed, and each client gets 100
requests a minute (`X-RateLimit-*` headers; wait on `429`).

- **Base URL:** `https://embed.tweetstack.app`
- **Search:** `POST /embeddings/search` with a JSON body
- **Coverage:** the consent-filtered serving corpus, about 18.5 million tweets;
  new tweets are embedded every ten minutes. `GET /embeddings/stats` reports
  the current `vectorCount` and `dimension`.
- **Model:** `Qwen/Qwen3-Embedding-4B` (1,024 dimensions) via DeepInfra. Pass
  `vector` instead of `searchTerm` only if you embed with the same model.

### Search with cURL

```bash
curl -s -X POST https://embed.tweetstack.app/embeddings/search \
  -H "Content-Type: application/json" \
  -d '{
    "searchTerm": "you can just do things",
    "k": 10,
    "threshold": 0.6,
    "filter": {
      "must": [
        { "key": "username", "match": { "value": "exgenesis" } },
        { "key": "created_at", "range": { "gte": "2025-01-01T00:00:00Z" } }
      ]
    }
  }'
```

### Request body

| Field          | Type     | Default | Notes                                                            |
| -------------- | -------- | ------- | ---------------------------------------------------------------- |
| `searchTerm`   | string   |         | Text to search for. Give this or `vector`, not both.             |
| `vector`       | number[] |         | A 1,024-dimension query embedding from the corpus model.         |
| `k`            | integer  | `10`    | Results to return, up to 1,000.                                  |
| `threshold`    | number   | `0.65`  | Minimum cosine similarity, 0 to 1. Lower it for broader results. |
| `filter`       | object   |         | Metadata filter, see below.                                      |
| `with_payload` | boolean  | `true`  | Include tweet metadata in each result.                           |
| `with_vector`  | boolean  | `false` | Include the stored embedding in each result.                     |

### Filters

`filter` takes `must` (AND), `should` (OR), and `must_not` (NOT) arrays. Each
condition names a metadata `key` and either a `match` or a `range`:

- `{ "key": "username", "match": { "value": "exgenesis" } }` exact value
- `{ "key": "text", "match": { "text": "archive" } }` case-insensitive substring
- `{ "key": "created_at", "range": { "gte": "2025-01-01T00:00:00Z", "lt": "2026-01-01T00:00:00Z" } }`
  with `gt`, `gte`, `lt`, `lte`; dates as ISO 8601 or Unix milliseconds

Filter on `account_id`, `username`, `account_display_name`, and `created_at`
for the fastest queries. A `text` substring filter is applied to the
candidates after the vector search, so it can return fewer than `k` results;
lower `threshold` or raise `k` if you need more. A flat object such as
`{"username": "exgenesis", "created_at": ">=2025-01-01"}` is also accepted and
means AND across its keys.

### Response

```json
{
  "success": true,
  "results": [
    {
      "key": "2043501488530653671",
      "distance": 0.89,
      "metadata": {
        "account_id": "1025998374",
        "username": "lydialaurenson",
        "account_display_name": "Lydia Laurenson",
        "created_at": "2026-04-13 01:28:15.000",
        "text": "@_chair @airkatakana you can just do things",
        "original_text": "@_chair @airkatakana you can just do things",
        "reply_to_tweet_id": "2043337227686600776",
        "source": "clickhouse",
        "provider": "deepinfra",
        "model": "Qwen/Qwen3-Embedding-4B"
      }
    }
  ],
  "count": 1
}
```

`key` is the tweet ID as a string, and `distance` is the cosine similarity
(higher is closer), sorted best first. Metadata holds only the fields the index
stores; for engagement counts, media, or the conversation, pass the keys to
[API v1](api-v1-migration.md) as `GET /v1/tweets?ids=A,B,C` (up to 100 per
call). Errors come back as `{"success": false, "error": "..."}` with a `400`
for an invalid body, for example a vector of the wrong dimension.

`POST /embeddings/retrieve` with `{"ids": ["<tweet_id>"], "with_vector": true}`
returns the stored metadata and embedding for up to 1,000 known tweet IDs.

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
