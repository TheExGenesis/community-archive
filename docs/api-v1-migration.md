# Moving to the Community Archive API (v1)

The public Supabase REST API for the tweet corpus
(`https://fabxmporizzqflnftavs.supabase.co/rest/v1/...` with the shared
`anon` key) is retired on **19 November 2026**. Its replacement is a small read API with a
personal key:

- **Base URL:** `https://analytics.community-archive.org/v1`
- **Key:** sign in at <https://www.community-archive.org/settings/api-keys>,
  create a key, and send `Authorization: Bearer cak_...` on every request.
  Keep it on your server or in your script, never in browser code.
- **Reference:** [`/v1/openapi.json`](https://analytics.community-archive.org/v1/openapi.json)
  (OpenAPI 3.1; load it in any OpenAPI viewer or client generator).
- **Limits:** 60 requests a minute and 20,000 a day per key, and two
  requests running at once per account. On `429` or `503`, wait for
  `Retry-After` seconds and retry. A `422` means the request was too broad
  for its query budget; narrow it (for example, add a date range).

The old API keeps working until 19 November 2026 and stops after that.

## Call by call

| Old PostgREST call                                                                                                          | New call                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /rest/v1/tweets?tweet_id=eq.X`                                                                                         | `GET /v1/tweets/X`                                                                       |
| `GET /rest/v1/tweets?tweet_id=in.(A,B,C)`                                                                                   | `GET /v1/tweets?ids=A,B,C` (up to 100)                                                   |
| `GET /rest/v1/tweets?account_id=eq.X&order=created_at.desc&limit=1000&offset=N`                                             | `GET /v1/accounts/X/tweets?order=desc&limit=200&cursor=…`                                |
| same, `order=created_at.asc`                                                                                                | `GET /v1/accounts/X/tweets?order=asc`                                                    |
| `...&full_text=not.like.RT*` (skip retweets)                                                                                | add `exclude_retweets=true` (also `exclude_replies=true`)                                |
| `GET /rest/v1/enriched_tweets?created_at=gte.A&created_at=lt.B`                                                             | `GET /v1/tweets?since=A&until=B` (window up to 31 days)                                  |
| `GET /rest/v1/enriched_tweets?tweet_id=in.(…)`                                                                              | `GET /v1/tweets?ids=…`                                                                   |
| `POST /rest/v1/rpc/search_tweets` (`search_query`, `from_user`, `to_user`, `since_date`, `until_date`, `limit_`, `offset_`) | `GET /v1/tweets/search?q=…&from_user=…&reply_to_user=…&since=…&until=…&limit=…&offset=…` |
| `GET /rest/v1/all_account?username=ilike.X` or `account?username=eq.X`                                                      | `GET /v1/accounts/X`, or `GET /v1/accounts?usernames=X,Y`                                |
| `GET /rest/v1/all_account?account_id=eq.X` and `profile?account_id=eq.X`                                                    | `GET /v1/accounts/X` (one object with profile fields)                                    |
| `GET /rest/v1/all_account?account_id=in.(…)`                                                                                | `GET /v1/accounts?ids=…` (up to 100)                                                     |
| `GET /rest/v1/tweet_media?tweet_id=…`                                                                                       | `media` on every tweet                                                                   |
| `GET /rest/v1/tweet_urls?tweet_id=…`                                                                                        | `urls` on every tweet                                                                    |
| `GET /rest/v1/quote_tweets?tweet_id=…`                                                                                      | `quoted_tweet_id` on the tweet                                                           |
| `GET /rest/v1/retweets?tweet_id=…`                                                                                          | `retweeted_tweet_id` on the tweet                                                        |
| `GET /rest/v1/conversations?tweet_id=…`                                                                                     | `conversation_id` on the tweet                                                           |
| `GET /rest/v1/user_mentions?tweet_id=…`                                                                                     | `mentioned_account_ids` on the tweet                                                     |
| `GET /rest/v1/user_directory` (members)                                                                                     | `GET /v1/members`                                                                        |
| `GET /rest/v1/likes?account_id=eq.X` (+ `liked_tweets`)                                                                     | `GET /v1/accounts/X/likes` (`liked_tweet_id`, `full_text`, `author_account_id`)          |
| `GET /rest/v1/followers?account_id=eq.X`                                                                                    | `GET /v1/accounts/X/followers`                                                           |
| `GET /rest/v1/following?account_id=eq.X`                                                                                    | `GET /v1/accounts/X/following`                                                           |
| Other RPCs and views (`word_occurrences`, `get_monthly_tweet_counts`, `global_activity_summary`, …)                         | Not in v1. Open an issue describing what you need.                                       |

`X` in an account path is a numeric account ID or a username. A numeric
username needs an `@` prefix (`/v1/accounts/@1234`).

## What changes in the data

- **One shape for every tweet**, the old `enriched_tweets` plus attachments:
  `tweet_id`, `account_id`, `username`, `account_display_name`,
  `avatar_media_url`, `created_at`, `full_text`, `favorite_count`,
  `retweet_count`, `reply_to_tweet_id`, `reply_to_user_id`,
  `reply_to_username`, `quoted_tweet_id`, `retweeted_tweet_id`,
  `conversation_id`, `media[]`, `urls[]`, `mentioned_account_ids[]`.
  Internal columns (`archive_upload_id`, `fts`, `updated_at`) are gone.
- **IDs are strings**, as before. Timestamps are ISO 8601 UTC
  (`2026-10-16T17:01:54.000Z`).
- **Deleted or withdrawn tweets are left out**, so a page can hold fewer
  items than `limit`.
- **Responses are wrapped:** `{"data": …, "next_cursor": …, "request_id": …}`.
  Errors are `{"error": {"code", "message"}, "request_id"}`.

## Paging

Offsets and `Range` headers are replaced by a cursor. Ask for up to 200 tweets
(500 likes or follows, 1,000 members), then pass `next_cursor` back as `cursor` until it is `null`.
Don't stop on a short or empty page; stop on `next_cursor: null`. Search
pages with `offset` (up to 5,000) and returns `next_offset`.

```python
import os, time, httpx

API = "https://analytics.community-archive.org/v1"
client = httpx.Client(
    headers={"Authorization": f"Bearer {os.environ['CA_API_KEY']}"},
    timeout=30,
)

def get(path, **params):
    while True:
        response = client.get(f"{API}{path}", params=params)
        if response.status_code in (429, 503):
            time.sleep(int(response.headers.get("Retry-After", "5")))
            continue
        response.raise_for_status()
        return response.json()

def account_tweets(account, order="asc"):
    cursor = None
    while True:
        page = get(f"/accounts/{account}/tweets", order=order, limit=200,
                   **({"cursor": cursor} if cursor else {}))
        yield from page["data"]
        cursor = page["next_cursor"]
        if cursor is None:
            return

for tweet in account_tweets("exgenesis"):
    print(tweet["created_at"], tweet["full_text"][:80])
```

```js
const API = 'https://analytics.community-archive.org/v1'
const headers = { Authorization: `Bearer ${process.env.CA_API_KEY}` }

const response = await fetch(`${API}/tweets?ids=1883976555686420844`, {
  headers,
})
const { data } = await response.json()
```

Check a key with `GET /v1/me`, which returns its limits.
