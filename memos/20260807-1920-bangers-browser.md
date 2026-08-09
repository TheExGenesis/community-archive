# Bangers archive browser

_Friday, August 7, 2026 at 7:20 PM PDT_

_Updated Friday, August 7, 2026 at 9:18 PM PDT_

## Outcome

The authenticated `/bangers` page is now a paginated all-time collection
explorer rather than a rolling 48-hour feed. It pages through a corrected
ranking snapshot instead of grouping a global top 100, and keeps the
dashboard's separate recent and historical banger modules unchanged.

## Interaction model

- Search matches tweet text, display names, and usernames across the server-side
  ranking snapshot, including results that were not on the initial page.
- Year filtering is populated from per-year totals for the full snapshot.
- Ranking supports only banger-relevant choices: most quoted and most recent.
- Author scope switches between any tweet quoted by Community Archive members
  and member-authored tweets quoted by Community Archive members.
- List view keeps the existing focused reading layout.
- By-year view places every represented year in a horizontally scrollable
  column, ordered newest year first, and labels partial columns as “loaded of
  total.”
- Additional 60-tweet pages load automatically near the end of the current
  results, with an accessible manual load button and retry state.
- Search, sort, year, and view state are mirrored into query parameters, so a
  configured view can be bookmarked or shared.
- Empty results include one-action filter recovery.
- Stored avatar URLs are rendered when available. Missing or failed avatars use
  the existing syndication API before falling back to initials.

The control surface is full-width and dense on desktop. Native select styling
was replaced with a flat Radix year picker and flat segmented controls; the
controls wrap into a compact two-column footer at mobile widths.

## Data and caching

The query gateway computes and caches one corrected ranking snapshot per target
scope for 10 minutes. Pagination, year filtering, text search, and recent
sorting operate in memory over that snapshot, avoiding another multi-billion-
byte ClickHouse ranking query for every page. The current candidate window is
1,600 rows and the response exposes whether that boundary may have truncated
the corrected ranking.

The website loads and enriches 60 rows at a time. The gateway response carries
the next offset, filtered total, snapshot size, per-year totals, and truncation
status. The member-target scope is prefiltered inside the ClickHouse candidate
query so it is not starved by higher-ranked non-member targets.

This requires the companion `community-archive-control-panel` gateway change
to be deployed before the website PR is merged.

## Verification

- Focused website tests: 25 passed across component, route, analytics, gateway
  allowlist, and avatar-row coverage.
- The broader website run passed 40 suites and 166 tests; its remaining three
  suites require local database credentials or the existing `server-only` Jest
  shim and are unrelated to this change.
- TypeScript: passed.
- Next.js lint: passed with one pre-existing warning in
  `UnifiedTweetList.test.tsx`.
- Production build: passed. Existing dynamic-route diagnostic messages were
  emitted for unrelated API routes during static analysis.
- Browser QA: list, by-year, author-scope, recent ranking, server-side search,
  pagination labels, stored avatars, and 390px mobile layout were verified in
  dark mode against a local paginated fixture. Expected 404s came only from
  attempting syndication fallback for synthetic tweet IDs.
- Query gateway TypeScript and Bun bundle checks passed. Its new pagination,
  cache-reuse, search, avatar, and member-target assertions pass; the repository
  full test command still has a pre-existing incompatibility with the locally
  installed Bun 1.0.1 (`rejects.toThrow` and `node:test` support).
