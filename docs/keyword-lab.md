# Dynamic keywords and the admin lab

The homepage automatically discovers two terms per category from the latest
complete UTC week: breaking out, big and rising, and cooling off. These are
live ClickHouse aggregates with a daily cache, not a checked-in keyword list.

Admins can open **Admin → Keyword lab** (`/admin/keywords`) to inspect 20
candidates per category, select seven recent end dates and daily/weekly windows,
and compare tweets, unique authors, or the sum of square roots of each author's
posts. The page and `/api/admin/keywords` both use the existing trusted admin
identity checks. Gateway credentials remain server-side. Failures return
non-cacheable errors; the UI includes retry and never substitutes empty data.

## Shipped defaults

- Activity: sum of square roots of posts per author, calculated over each whole
  window. Normalize by the same measure across all member posts in that period.
- Weekly support: 20 tweets / 5 authors. Daily: 5 tweets / 3 authors.
- Big baseline: 150 per 100,000; big movers ≥15%; breakouts ≥50%.
- Size/surprise exponent 0.7; smoothing 10 units weekly / 3 daily.
- Phrase boost 200%; personal downweight 90% with an **empty term list**.
- Collapse plurals and group whole-word components under phrases covering ≥50%
  of their activity. Keep the phrase's counts, rank by the strongest member score.
- Cooling off: previously in an earlier snapshot's top-20 breakout/rising list,
  now declining with at least 20 prior tweets / 5 prior authors (5 / 3 daily).

Controls affect the admin's current preview only. Export saves the settings and
ranked candidates to JSON; it does not publish changes. Editing public defaults
is a code change. The same `keyword-ranking.ts` source is mirrored in the gateway
and website; keep them identical. No editorial database or LLM dependency is
introduced.

## Limits and release order

The lab reconstructs seven daily end-date snapshots; earlier windows overlap.
Cooling history describes reconstructed candidates, not previously published
homepage entries. Extracted candidates need at least 10 tweets / 3 authors in
either weekly period, or 3 / 2 in daily periods. Missing chart values mean below
that floor, not zero. Existing tokenizer stopwords still apply; general-English
frequency filters, proper-name detection and semantic clustering are separate
follow-ups.

Deploy control-panel PR #210 before this website change. Both endpoints retain
current-member / opt-out / tombstone filtering and membership-version cache
invalidation. The gateway does up to seven bounded queries per cold comparison
bundle and caches counts and public rankings for 24 hours; browser control
changes do not query again. A cold request can take up to one minute. The
homepage retains the legacy watchlist only on a 404 while the gateway route is
absent. It surfaces other upstream failures.

No database migration or new environment variable is required. The existing
analytics URL and bearer token are used. Before release, smoke-test the gateway
and the website with a real admin session; the local PR checks use mocked auth
and the saved September 3–9 aggregate snapshot, not production deployment.
