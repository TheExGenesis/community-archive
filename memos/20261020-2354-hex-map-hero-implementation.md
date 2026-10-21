# Hex-map homepage implementation and production-data preview

The design handoff is implemented on `codex/hex-map-hero-design` ([PR #1126](https://github.com/TheExGenesis/community-archive/pull/1126)). The approved map backend is live at gateway release `ce75dbab2d9f` (pagination speedup PR #290), following control-panel PRs [#286](https://github.com/TheExGenesis/community-archive-control-panel/pull/286) and [#287](https://github.com/TheExGenesis/community-archive-control-panel/pull/287). The frontend remains a separate preview: merging/promoting the live homepage is not authorized. Existing homepage sections and social proof styling are preserved.

## Current behavior

- Ordinary wheel scrolling zooms the map, including over community labels. Wheel steps are gentler than pinch gestures. Shift-wheel always scrolls the page; scrolling outward at minimum zoom also continues down the page. Single-finger mobile scrolling, pinch, keyboard controls and the “Continue to the daily digest” link remain available.
- Cell words appear only at zoom ≥2.7 and projected cell diameter ≥32px. Selecting a community hides other communities’ cell words and topic labels; country names remain for orientation.
- Hovering/opening stories highlights mapped participant cells and communities, with collision-managed participant handles. Location metadata travels with the story response, so hovering does not fetch anything.
- Published digest editions paginate two days at a time. Detail reads show current-policy member posts with media and quotes. Strands, selected-community stories, bangers, most-liked/latest feeds and member avatars read production sources.
- Selected-community avatar headers policy-check at most 24 candidate identities, rather than 300. Full aggregate counts remain intact.

## Preview configuration

Only the `codex/hex-map-hero-design` Vercel branch overrides were changed:

- Production Supabase URL, public key and server-only service-role credential, obtained at runtime from the existing Vercel source.
- `DIGEST_MOCK_DATA=false`; explicit false now overrides the repository’s automatic development/preview fixture selection.
- Production analytics URLs, enabled reads, and the current gateway bearer credential obtained at runtime from the gateway’s root-only environment.
- Staging login and its production-DB exception are explicitly disabled for this branch.

No credentials were printed or saved into repository files. Other previews and production environment values were not changed. The stored shared Vercel analytics credential did not match the live gateway; investigating production environment drift is an optional separate follow-up.

## Backend rollout and performance

The private mapping contains 70,577 unique accounts across 1,730 cells. Every cell count and coordinate was validated before an atomic activation in the separate `community_archive_hex` database. Current policy projection parity: 970 directory rows, 952 members, 18 explicit opt-outs; 800 members are mapped. No corpus backfill, writer change, policy-source change, new service or timer was introduced.

Gateway reads retain their authentication, heavy-query admission, membership/version caches and 12-second / 1 GB / 100M-row / 8 GB per-query caps. Heat aggregates compact flags in account/tweet order using small read blocks. Likes/latest rank numeric columns before bounded text hydration and repost filtering; candidate offsets advance over filtered items, so pages can have fewer than 12 cards.

Observed production timings:

- Single-cell posts: likes 0.64s, latest 0.60s, bangers 0.15s.
- Full 36-month heat: 6.94s cold, 0.043s cached, 15.2M rows / 3.15 GB.
- 300-member TPOT community: likes 5.34s, latest 6.09s including hydration; ranking reads 1.34 GB versus 3.44 GB before the fix. Cached rankings avoid repeating that scan for 60 seconds.

The complete gateway was deployed through `scripts/ca-deploy`, with main containing the previous release. Independent health, build metric, zero restarts, authenticated routes, missing-token rejection, wrong-version failure and established neighboring routes passed. Previous complete releases remain available; `e4545c3cd492` is the immediate rollback, and `2114587df21d` predates this feature. Disable `HEX_MAP_ENABLED` before rolling the feature back. The prior map table is retained for atomic exchange rollback.

## Focused validation

- Initial implementation: geometry/data/route/homepage tests, canonical TweetCard tests, TypeScript, lint, build/CI, desktop/mobile scroll and canvas frame checks.
- Feedback revision: digest override tests; story participant location and policy tests; route tests; TypeScript/lint; isolated ClickHouse SQL integration tests; required gateway deployment checks.
- Real production data through local browser: Oct 21/20 editions and Oct 19/18 pagination; a real story with two member posts and two mapped participant cells; hover changed canvas paint and displayed a participant handle; selected TPOT digest and strand stories; loaded member avatars.
- Word trial: zero cell words immediately after community selection; cell words appeared after further zoom, all at focused opacity. Ordinary outward wheel at minimum zoom scrolled the page 600px.

## Data limits

The aggregate activity snapshot ends in the week of **2026-07-27**, explicitly labeled in the UI. Membership, digest editions, users and post feeds are current; this change does not recompute map geometry or the historical activity layer. Accounts absent from the private map receive no invented location. Country/cluster naming uses the supplied aggregate algorithm. Social proof redesign is deferred at the user’s request.

## Feed speedup — 2026-10-21

Approved backend PR [#290](https://github.com/TheExGenesis/community-archive-control-panel/pull/290) is merged and deployed as `ce75dbab2d9f`. It caches a bounded window of 2,013 ranked IDs per selection/sort/membership version for 60 seconds, avoiding another full ranking scan for every page. Tweet hydration, tombstones and eligibility are still checked on each request. No schema or ingestion changes. Independent post-deploy health passed, membership projection was healthy (957 members / 19 explicit opt-outs), and restart count was zero. Rollback: `scripts/ca-deploy clickhouse-query-gateway --rollback-to 492691e88172`.

Frontend feeds buffer one next page, consume that same request when scrolling, begin loading 800px before the end, prefetch tabs on hover/focus, and retain visited feeds briefly (30s freshness / 60s retention). This includes digest and strand pagination. Current consent and membership queries overlap with bounded concurrency, but results remain withheld until both succeed; no policy cache was added.

Measured TPOT candidate gateway page-two reads were 245ms likes, 303ms latest and 194ms bangers. After deployment, the local website with production data served likes pages two/three in 1.12s each versus 6.25s before; bangers page two took 0.91s. These website times include network and current-policy checks. Browser verification showed old digest days loading on scroll and a return to a loaded tweet tab in 297ms. Cold first-page likes/latest rankings still take roughly five seconds at the gateway (about seven seconds through the local website); this remains a separate optimization opportunity.

Focused validation: 13 frontend tests across the feed hook, policy, map data and routes; TypeScript and targeted lint; required gateway deployment suite (227 passed, one integration skip); live browser feed/pagination checks. The hook test checks one-page buffering, request deduplication and retained tabs; the policy test checks that concurrent reads never publish a blocked renamed account.
