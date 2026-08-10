# Homepage partial-failure hotfix

Date: 2026-08-07 23:07 PDT

## Incident

After the portal and ClickHouse branches landed, a failed authenticated-homepage
request rendered the route-level `src/app/error.tsx` boundary. Members saw a
blank page with “Something went wrong!” even when most homepage data remained
available.

## Root cause

`getPortalData()` put the corpus snapshot, live statistics, and initial stream
requests directly into one `Promise.all`. The optional research and banger
feeds already had local fallbacks, but the three core reads did not. The portal
stream moved to ClickHouse in commit `3e01b5f`, so a `portal-stream` timeout or
5xx rejected the full Server Component render.

The stats and corpus snapshots also grouped unrelated reads. A trends failure
discarded the independently available corpus range, and a live-analytics
failure discarded the independently available member and recent-upload counts.

## Fix

- Split portal loading into nine independently guarded reads: live analytics,
  member count, recent joins, corpus range, trends, initial stream, research,
  recent bangers, and historical bangers.
- Return a small serializable failure map with the successful data.
- Render panel-specific unavailable states while keeping navigation, search,
  tools, research, and healthy metric cards usable.
- Allow the client stream poll to clear or restore the stream failure state as
  the endpoint recovers or fails again.

## Verification

- `pnpm type-check`
- `pnpm test -- --runInBand`: 47 suites, 195 tests passed
- Production `next build`: passed
- Named Playwright session with ClickHouse forced unreachable: `/` returned
  HTTP 200, Supabase-backed member and corpus cards rendered, and each failed
  ClickHouse panel showed its local fallback. The only browser console error
  was the deliberately forced 502 from the live polling endpoint.

## Rollback

Revert the hotfix commit. No schema, cache-storage, environment, or external
service changes are involved.
