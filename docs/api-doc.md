# API guide

> If you use Community Archive data, please cite it: see [how to cite](https://www.community-archive.org/cite).

> **The public Supabase REST API was retired on 19 November 2026.** The tweet
> corpus (tweets, likes, follows, mentions, media, quotes, retweets and the
> views and RPCs over them) no longer answers the public `anon` key. Use the
> keyed [Community Archive API v1](https://analytics.community-archive.org/v1/openapi.json)
> for filtered queries (the [migration guide](api-v1-migration.md) maps every
> old call) and the daily export for bulk data. Agents should start at
> [`community-archive.org/llms.txt`](https://www.community-archive.org/llms.txt).

There are four supported ways to access Community Archive data:

1. Download the consent-safe bulk Parquet package.
2. Query filtered records through the keyed
   [API v1](https://analytics.community-archive.org/v1/openapi.json) with a
   personal key from
   [`/settings/api-keys`](https://www.community-archive.org/settings/api-keys).
3. Search tweets by meaning through the [semantic search API](#semantic-search-api).
4. Authenticated owners may download their own processed archive through the
   policy-aware web endpoint.

The website version of this guide is at
[`community-archive.org/docs`](https://www.community-archive.org/docs).

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

## API v1

Base URL `https://analytics.community-archive.org/v1`, described by its
[OpenAPI document](https://analytics.community-archive.org/v1/openapi.json).
Sign in, create a personal key at
[`/settings/api-keys`](https://www.community-archive.org/settings/api-keys),
and send it as `Authorization: Bearer cak_...`. Keep the key on your server or
in your script, never in browser code. Page by passing `next_cursor` back as
`cursor` until it is `null`. Routes, limits and examples are in
[`llms.txt`](https://www.community-archive.org/llms.txt) and the
[migration guide](api-v1-migration.md).

```bash
export CA_API_KEY='cak_...'

curl --get "https://analytics.community-archive.org/v1/accounts/defenderofbasic/tweets" \
  -H "Authorization: Bearer $CA_API_KEY" \
  --data-urlencode "order=desc" \
  --data-urlencode "limit=5"
```

[`scripts/get_all_tweets_paginated.mts`](../scripts/get_all_tweets_paginated.mts)
pages through one account's whole timeline. Run it from the repository root
with `CA_API_KEY` set:

```bash
pnpm script scripts/get_all_tweets_paginated.mts exgenesis
```

For full-corpus work, prefer the bulk Parquet package instead of paging the
API.

## Retired: the Supabase REST API

Until 19 November 2026 the corpus tables were readable through Supabase
PostgREST at `https://fabxmporizzqflnftavs.supabase.co/rest/v1` with a shared
public `anon` key. That access has ended: corpus tables, views and RPCs now
refuse the anon key. The key still exists because the website's own sign-in,
directory, digest and gallery features use it; it is not a data API, and
nothing outside the website should depend on it. The
[migration guide](api-v1-migration.md) maps each old call to API v1.

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
