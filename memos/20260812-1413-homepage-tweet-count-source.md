# Homepage tweet-count source diagnosis

Date: 2026-08-12 14:13 PDT

Issue: [#604](https://github.com/TheExGenesis/community-archive/issues/604)

## Outcome

The homepage corpus total was reading ClickHouse's `canonical_corpus` summary,
but that projection does not yet receive tweets inserted by the archive-upload
processor. The homepage now reads the existing Supabase
`global_activity_summary` for the corpus total and snapshot timestamp. It still
uses ClickHouse `stream-stats` for the rolling browser-firehose rate.

No schema or production-data mutation was required.

## Production evidence

Read-only checks on 2026-08-12 found:

| Source                                   |                   Tweets | Archive coverage                                                      |
| ---------------------------------------- | -----------------------: | --------------------------------------------------------------------- |
| Supabase exact `public.tweets` count     |               15,131,587 | 7,055,522 archived tweets; latest archive upload ID 691               |
| Supabase daily `global_activity_summary` |               15,100,732 | Refreshed at 05:15 UTC                                                |
| ClickHouse current projection            | approximately 14,850,618 | approximately 6,719,954 archived tweets; latest archive upload ID 651 |
| ClickHouse homepage gateway snapshot     |               14,833,838 | Collected at 04:31 UTC                                                |

The current projection trailed the exact Supabase corpus by approximately
280,969 tweets. Its archive provenance also stopped 40 upload IDs behind
Supabase. This matches the documented topology: archive uploads write to
PostgreSQL today, while the browser extension and autorefresh write directly to
both stores.

## Code routing

- `fetchPortalCorpusStats()` reads `total_tweets,last_updated` from Supabase and
  caches the result for five minutes.
- `fetchPortalLiveAnalytics()` no longer requests the ClickHouse global
  summary; it requests only the rolling `stream-stats` data it owns.
- The combined portal failure state still degrades the tweet metric safely if
  either the corpus snapshot or live-rate request fails.

Do not move the homepage total back to ClickHouse until archive-upload replay,
ongoing emission, source-count parity, and freshness have all been verified.

## Validation

- `pnpm test:ci`: 68 suites, 296 tests passed.
- `pnpm type-check`: passed.
- `pnpm lint`: passed with one pre-existing `<img>` warning in
  `UnifiedTweetList.test.tsx`.
- Focused portal tests and Prettier checks passed.
