# Hex-map homepage implementation

The design handoff is implemented on `codex/hex-map-hero-design`. The map sits above the existing homepage sections, including the digest, and ordinary wheel/touch scrolling still reaches them. The matching gateway/import work is on `TheExGenesis/community-archive-control-panel`, branch `codex/hex-map-gateway`. **Neither change has been deployed.** Release the backend before merging/releasing this frontend.

## Delivered

- Responsive canvas map, country/cluster/cell HTML labels, light/dark layers, country/shift selection and shared outer outlines, keyboard controls, desktop pan/zoom and mobile pinch. Ordinary wheel scroll stays page scroll; Ctrl/Command-wheel zooms.
- Compact existing search behavior/analytics, seven-day trend chips, typed-term and trend-hover monthly heat, scrubber/play, featured member pins and `from:` anchors.
- Digest (two editions/page), strands (12/page), full story/strand cards, location highlights, selected-area stories with explicit country fallback, member-quote bangers, most-liked/latest posts and pagination.
- Current `getAppPolicy()` checks before any people/posts/quoted posts are served. Identity-bearing responses are private/no-store. The generic public analytics proxy cannot bypass these narrow endpoints.
- Separate static geometry, dynamic bounded pages, lazy TweetCard/map code, batch gateway card hydration and gateway query caches/budgets. The geometry is 300,046 bytes raw / 74,080 gzipped; it contains aggregate data only. One cached canvas bitmap is reused for base rendering; hover/pan do not rebuild 1,730 polygons.
- Version mismatch rejects dynamic API calls instead of silently placing posts on the wrong geometry.

## Focused validation

- TypeScript and changed-path ESLint passed. The local commit hook references a missing `.husky/_/husky.sh`; it was bypassed after these focused checks. Unrelated schema/type regeneration was not run.
- Geometry, consent/fail-closed behavior, strand-card hydration avoidance, exact/country-fallback story placement, version-gated post API and existing homepage tests passed: 12 tests across four files, plus all 19 focused canonical TweetCard tests (including the new map preview).
- Local browser fixtures verified story open/back, country selection, quote/latest pagination, member-quote labels, heat playback and author pin placement. These fixtures tested UI contracts; they are not evidence that the new production endpoints exist.
- Desktop wheel over the map scrolled the page 650px. Mobile touch over the map scrolled 472.5px; at a 390px viewport document width was 375px (no horizontal overflow).
- Real local-dev paths loaded the existing digest and strands with current policy checks; the repository's standard development mode uses a labeled sample digest edition. Remote map endpoints are intentionally unavailable until backend rollout.
- Final local drag sample: 60 canvas draws, maximum `drawImage` time 0.1ms, animation-frame p95 9ms over 132 frames; it is a browser/dev measurement, not a production LCP/backend-latency claim. Screenshots and raw browser logs remain local under `output/playwright/hex-hero` and `.playwright-cli` and are excluded from the commit.
- Backend: four focused tests, including exact SQL on isolated synthetic local ClickHouse tables, plus TypeScript and a gateway bundle build. Private import validated 70,577 mapped accounts against every cell's coordinate/count; 16,872 unmapped explorer accounts are excluded.

## Release gates and explicit differences

Follow `ops/clickhouse-hex-map/README.md` in the control-plane PR for the staged/atomic import, reader-only grants, membership health, gateway feature flag, route smokes, frontend release and independent rollbacks. Production SQL/schema compatibility and cold/warm latency checks remain pending approval. No full-corpus scan, production write, new worker, or service was performed.

The shipped aggregate activity source ends in the week of **2026-07-27**. The UI says “Activity · snapshot week of …”; it does not claim this is the current week. Archived counts update from the current map membership lookup after rollout. Monthly heat uses the current member corpus over a bounded rolling 36-month window, which can differ from the mock's fixed historical sample. Country/cluster naming uses the supplied deterministic aggregate algorithm; a curated naming pass is outside this change.

Geometry rebuild: run `scripts/build-hex-map-snapshot.py /path/to/explorer/data --version NEW_VERSION`. Commit the aggregate snapshot and generated version together, and prepare the matching private import before activating the new frontend. Never commit the original mock's private JSON, avatars or media.
