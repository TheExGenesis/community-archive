# Sidebar follow-up

Digest is the sole top-level view; cluster tabs remain. Best starts at Last 7 days, falls back to weekly Most liked when no eligible Best posts exist, and progressively widens to 30/90/365 days then All time. It keeps earlier posts and deduplicates IDs. An accessible explanation and direct range choices are available. Removed per-card member-quote counts. Single-click selects a community; double-click selects a blue outlined individual hex, including empty cells. Shift+Enter is the keyboard equivalent. Wheel containment is preserved.

Visible story cards preload at most two requests concurrently; details share feeds' 30-second freshness and 60-second memory retention. Selecting a community preloads Best alongside the default digest; an empty successful digest switches to Best, while a manually selected Digest stays selected. Story tweets use canonical live hydration, preserving focal ordering, public quoted context, images, and opt-outs. Top-level posts still require membership.

Validation: nine focused frontend tests, TypeScript and scoped lint passed. Local browser: top tabs absent; preloaded story click ~401ms, Latest ~356ms; TheZvi's formerly missing Marcus Williams quote and image visible; double-click selected one cell and single-click restored community selection. These are preloaded timings, not a cold-network guarantee.

Backend dependency: control-panel PR291. Candidate against read-only production data measured Latest 392ms/288ms first/second page, Best week 377ms/254ms, excluding website/network and cold membership resolution. CI passed; explicitly approved PR291 merged and deployed as f90b28bc62cb. Health and all existing authenticated smoke routes passed; unauthenticated access remained 401. Membership snapshot: 957 members / 19 explicit opt-outs, current and healthy. Independent rollback bundle ce75dbab2d9f remains present. Week fails closed against an old gateway rather than showing all-time results. Quiet selections retain a potentially slower lifetime fallback. Homepage remains local/preview in draft PR1126.

Post-deploy verification: live week responses contain recent publication dates; All time includes historical posts. Gateway HTTP metrics placed all seven sampled requests below one second. Local first checks (7–13s) overlapped development recompilation; after compilation, measured cold end-to-end Latest was 1.424s (gateway round trip 765ms, fresh policy 574ms). Cold sub-second end-to-end is not guaranteed; preloaded interactions remain below 0.5s. Removed redundant membership candidate lookups for quoted authors; global explicit opt-out checks still cover quoted authors by ID/handle.

## Progressive Best rollout — 21 October 2026

Explicitly approved control-panel PR293 merged and deployed as `af0b5cca6707` at approximately 12:55 PDT. The complete previous gateway bundle `f90b28bc62cb` is retained for rollback with `scripts/ca-deploy clickhouse-query-gateway --rollback-to f90b28bc62cb`. No frontend production release, schema change, or heat-precomputation deployment was performed.

The deploy checks passed, including neighboring routes and unauthenticated rejection. Independent inspection matched the live release path and build metric, with active service, zero automatic restarts, and all health dependencies OK. Fresh membership snapshot: 976 directory rows, 957 members, 19 explicit opt-outs.

Authenticated deployed range smokes returned 12 correctly dated cards each for a sampled cell: weekly likes 618ms, monthly quotes 235ms, quarterly quotes 295ms, yearly quotes 382ms. All advertised `timeRangeVersion: 2`. These gateway-only samples are not browser performance guarantees. The local production-data preview confirmed Progress & biotech's empty Best week falls back to weekly Most liked. The frontend remains in draft PR1126; its compact sidebar and progressive feed are available on localhost:3127.

## Most liked range controls and digest spacing

Most liked now defaults to Last 7 days and offers Last month, Last 3 months, Last year, and All time using the deployed gateway's publication-date filters. Best and Most liked remember their choices independently while switching tabs; Most liked now expands from its chosen starting range as scrolling continues, just like Best. Default intent prefetch uses the same weekly query. Digest day boundaries use whitespace without either the edition rule or the preceding story's bottom rule; separators between stories remain.

Validation: seven focused SelectionFeed/useMapFeed tests, TypeScript, and scoped lint passed. Local browser verified monthly Most liked returned real in-range posts (including October 1 and 13), and computed day-boundary borders were both zero. No new backend or frontend production deployment is required or performed for this change.

## Progressive Most liked

Both rankings now share `useRankedFeed`: exhaust the current range, then expand through 7/30/90/365 days and all time. Most liked uses likes throughout; Best retains its quote ranking and empty-week likes fallback. Query caches separate the two rankings while sharing raw prefetched pages. Earlier cards remain, tweet IDs are deduplicated across pages and ranges, and each newly displayed range has a small heading. Range choices remain independent between tabs.

Validation: eight focused feed/selection tests passed, including Most liked overlap, duplicate-only pages, empty ranges, all-time completion, cached range changes, and both rankings' retry behavior. TypeScript and scoped lint passed. Local production-data browser scrolling appended Most liked cards successfully. No backend deployment needed.
