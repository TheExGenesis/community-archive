# Bangers archive browser

_Friday, August 7, 2026 at 7:20 PM PDT_

## Outcome

The authenticated `/bangers` page is now an all-time collection explorer rather
than a rolling 48-hour feed. It loads the canonical top 100 tweets by distinct
Community Archive quote tweets and keeps the dashboard's separate recent and
historical banger modules unchanged.

## Interaction model

- Search matches tweet text, display names, and usernames.
- Year filtering is populated from the years represented in the ranking.
- Sorting supports archive quotes, likes, reposts, and authored date.
- List view keeps the existing focused reading layout.
- By-year view places every represented year in a horizontally scrollable
  column, ordered newest year first.
- Search, sort, year, and view state are mirrored into query parameters, so a
  configured view can be bookmarked or shared.
- Empty results include one-action filter recovery.

The control surface is full-width and dense on desktop. At mobile widths, year
and sort remain side by side and the view switch becomes a full-width segmented
control.

## Data and caching

The page calls the existing `top-quotes` analytics endpoint with the canonical
ranking flags: exclude self-quotes, accept target authors from anywhere, and
count quotes only from Community Archive members. Its enriched top-100 result
is cached for one day. The dashboard's 48-hour recent feed retains its
30-minute cache.

## Verification

- Focused client tests: 3 passed.
- TypeScript: passed.
- Next.js lint: passed with one pre-existing warning in
  `UnifiedTweetList.test.tsx`.
- Production build: passed. Existing dynamic-route diagnostic messages were
  emitted for unrelated API routes during static analysis.
- Browser QA: list and by-year views verified at 1200px desktop and 390px
  mobile widths in dark mode; no application console errors.
