# Portal stream and bangers implementation

_7 August 2026, 16:29 PDT_

## Outcome

PR #461 now uses production-backed ClickHouse analytics for the portal while
keeping Supabase authoritative for authentication, writes, and the canonical
uploader-plus-opt-in member count (633 at verification time).

## Trending terms

- The displayed terms are a curated watchlist, not automatically discovered.
- Counts and week-over-week percentages are real ClickHouse results.
- Each comparison is the last seven days versus the preceding seven days.
- Percent change is `round((last7 - previous7) / previous7 * 100)`.
- Single words use exact token matching; multiword terms such as `ai agents`
  require all tokens.

## Stream

- `/stream` is ordered by tweet-authored time descending, with tweet ID as the
  stable tie-breaker.
- The first page contains 30 tweets. An intersection observer fetches older
  cursor pages as the reader scrolls.
- New observations continue to poll separately and are merged back into
  authored-time order.
- Both `/stream` and `/bangers` include a dashboard back link.

Local production-data QA verified two 30-item pages were descending, strictly
older across the cursor boundary, and contained no duplicate IDs. Browser QA
loaded 112 tweets through infinite scrolling.

## Bangers

The canonical score matches the existing Bangers pipeline: the number of
distinct quote tweets made by Community Archive uploaders or opted-in members,
excluding quotes by the target tweet's own author. The target tweet itself may
be authored by anyone. Likes are displayed as tweet metadata but do not affect
ranking.

- Recent bangers: tweets authored within the rolling 48-hour window, refreshed
  from ClickHouse every 30 minutes.
- Historical banger: selected from the canonical all-time quote ranking based
  on calendar-date proximity, refreshed daily.
- `More bangers` now links to the internal `/bangers` page.

The authenticated ClickHouse gateway route is implemented and deployed from
[control-panel PR #15](https://github.com/TheExGenesis/community-archive-control-panel/pull/15).

## Verification

- `pnpm type-check`: passed
- `pnpm lint`: passed
- Focused server tests: 4 suites, 26 tests passed
- Broader server run: 27 of 29 suites passed; the two database-integration
  suites require service-role test credentials unavailable in this worktree
- `pnpm build`: passed
- Local Playwright QA: homepage, `/stream`, and `/bangers` passed against
  production public data
