# Homepage ClickHouse tweet count

Date: 2026-08-13 11:40 PDT

Issue: [#621](https://github.com/TheExGenesis/community-archive/issues/621)

## Outcome

The public homepage now requests a dedicated ClickHouse corpus-count endpoint
and revalidates the result every five minutes. If the gateway or projection is
unavailable, the page falls back to the existing Supabase
`global_activity_summary` snapshot rather than dropping the statistic.

The control-plane change must be deployed before the website change. The new
gateway endpoint scans `tweet_content_versions` for exact unique tweet IDs,
caches the result for five minutes, and serves the last successful value for up
to one hour while refreshing in the background. This avoids rerunning the
heavier daily summary and ranking computation on homepage cadence.

## Why ClickHouse is safe again

The homepage was intentionally returned to Supabase in #607 because ClickHouse
did not yet receive archive-upload tweets. That blocker has since been removed
by the independent ten-minute archive reconciler.

Read-only production checks immediately before this change found:

- completed archive upload watermark `692` in both PostgreSQL and ClickHouse;
- exact archive-derived tweet parity of `7,112,809 / 7,112,809`;
- an active ten-minute archive-sync timer with a successful run less than one
  minute old;
- `15,324,337` exact unique tweets in ClickHouse at 18:37 UTC, computed in
  about 2.5 seconds under the production resource limits.

## Failure and rollout behavior

- The website keeps the Supabase daily summary as its last-known-good fallback.
- The existing server-only bearer token remains the only way to reach the
  predefined ClickHouse route; no ClickHouse credentials enter the browser.
- Deploy the query-gateway change first and verify `/analytics/corpus-count`,
  then deploy the website. Either side can be rolled back independently.

## Validation

- Query gateway: 62 tests, TypeScript, and Bun production bundle passed.
- Website: 73 suites and 317 tests passed, along with TypeScript, lint, focused
  formatting, and the production build. The build retained only the existing
  dynamic-route diagnostics, missing local environment warnings, and image
  lint warning.
