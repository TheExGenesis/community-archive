# Website loading and performance

The homepage starts shared, cached reads together but renders each section as
soon as its own data is ready. Profiles require current public eligibility and
identity before rendering; optional enrichment streams afterward. Background
work follows user intent or viewport proximity.

## Vercel compute

`vercel.json` enables Fluid Compute so external-service waits incur provisioned
memory charges without active CPU charges. It keeps a 15-second default for
`src/app/**`; route-level `maxDuration` exports retain their explicit limits.
This prevents enabling Fluid from silently increasing ordinary requests to its
300-second default. The digest email cron schedule is unchanged.

The setting takes effect on deployment. Before production rollout, verify the
generated function configuration and exercise a public profile and signed-in
session on a preview. Compare active CPU plus provisioned memory cost against
legacy duration cost; legacy GB-hours alone are no longer comparable. Fluid
does not fix slow queries or make waiting free. Roll back with the previous
deployment, or revert this configuration and redeploy.

## Loading boundaries

- `startHomepageData()` returns an object of independent promises, not one
  promise for the dashboard. Hero totals, stream, each Banger, weekly trends,
  research, and digest have separate loading boundaries. The overview's four
  metrics remain one coherent block; they cannot delay the hero totals.
- Weekly homepage trends omit the historical series used by the dedicated
  explorer. Existing bounded query concurrency and caches remain in use.
- Recent Bangers refresh on their existing 30-minute interval without a new
  midnight cache key. Historical ranked candidates have a stable daily cache;
  daily selection and its enrichment happen separately. A day's first selection
  can still need enrichment, but does not force another historical ranking scan.
- The homepage stream selects from cached stream candidates independently of
  recent Bangers. Previously it mixed Bangers into that candidate pool, creating
  a loading dependency. Bangers keep their own cards; stream ranking is unchanged.
- A profile's fresh PostgreSQL `user_directory` eligibility lookup remains
  uncached. Cached header content does not bypass it. Metadata and page share
  request-local identity resolution. Missing avatar/banner enrichment shares
  one optional analytical read (one top tweet instead of twenty). Link expansion,
  archive date, and owner controls have separate boundaries. Owner settings are
  read only after authenticated ownership is established.

Authentication and policy checks are required work. These changes do not enable
public page caching, change consent authority, or change API authorization.

## Browser work

Featured profile links disable viewport prefetch and prefetch on hover or
keyboard focus. Profile chapters make at most one speculative feed request at a
time, on hover/focus. Selecting a chapter always loads it; the active feed keeps
its automatic fill and scroll pagination. Visiting a profile no longer loads
every year in the background.

Tweet link previews start within 200px of the viewport and share concurrent reads
for the same tweet. Only pending promises are retained, not a cross-visit result
cache. The homepage uploader mounts within 400px of the viewport; ZIP parsing is
imported only when a file is selected. No archive processing behavior changes.

Directory dates use explicit UTC on both server and browser. A timestamp such as
`2026-08-01T00:00:00Z` must render as August 1 in a Los Angeles browser too;
otherwise React has to recover from mismatched server/client text.

## Measurement

The existing PostHog integration already captures Web Vitals. The additional
`website_section_ready` event reports `page`, `section`, `navigation_type`, and,
when the start was observed, `elapsed_ms`. It emits after two animation frames;
this is a readiness proxy, not LCP or a guarantee that images have painted.

Page categories include home, directory, profile, tweet, search, and the navbar
routes listed below. Every category has a `navigation_shell` marker. Data markers are homepage stats, digest,
stream, profile header/feed, and directory rows. Shell and usable data must be
analyzed separately. Document time starts at navigation start; client-link time
starts at click capture; history time starts at `popstate`. Unobserved programmatic
navigation is labeled `unknown` with no duration. Query-only tab changes are not
measured as new page loads. Section markers emit once per mounted route/section.
No new event property includes usernames, account IDs, URLs, or search text.

Server logs record `Website read timing`, fixed stage name, duration, and outcome
for reads taking at least 500ms. Set `CA_PERFORMANCE_LOGS=true` locally to include
fast reads. Timing includes cache access and upstream waits; it does not by itself
separate database execution from network time. No new monitoring service is used.

Production receipt and population percentiles still need checking in the existing
PostHog workspace after rollout. Compare mobile/desktop and signed-in/signed-out
cohorts using existing session context. Targets: p75 LCP <=2.5s, INP <=200ms,
CLS <=0.1; a product goal is sub-second common warm data views. Local fixture
measurements prove dependency isolation, not production speed targets.

## Why earlier fixes did not guarantee independent loading

[PR #849](https://github.com/TheExGenesis/community-archive/pull/849), commit
`d6352e7` (August 29, 2026), freed the homepage hero from dashboard data. Its
boundaries still awaited the same combined `getPortalData()` promise. The change
remains in history; inspection did not establish a later revert. Commit
`f63d39a` (August 7) isolated component failures while continuing to await all
components. Failure isolation and loading isolation solve different problems.

There are reasonable reasons to group data: consistent snapshots, simpler props,
shared ranking inputs, and fewer loading states. Prefetch also speeds later
clicks when there is spare capacity. But those benefits trade against tail latency
and unnecessary work. Earlier tests checked the shell and resolved output; one
profile test explicitly required all chapters to preload. An implementer following
those tests could preserve the costly behavior without realizing it conflicts
with the desired first-view performance.

Regression coverage now leaves optional promises pending while checking ready
panels, requires no unopened chapter requests, checks hover/focus prefetch,
checks viewport/deduplicated previews, and verifies the timezone boundary. Keep
these behavioral assertions when changing data composition; a `Suspense` wrapper
alone is not evidence of independent loading.

## Other navbar routes

- Published Digest pages wait only for the edition. Likes, admin controls,
  calendars, recent editions, and discussion have independent Suspense slots.
  Metadata and page share a request-local edition read; there is no shared cache
  of viewer state. Preview/editor props still work without streamed slots.
- Gallery renders its published catalog before session/liked-project state.
  Searching and opening cards work immediately; account actions are disabled
  until the streamed session arrives. The session update preserves filters and
  local like overrides. The submission form downloads when first opened.
- Live Stream starts its feed and optional corpus total independently. Its client
  entry imports the shared polling/pagination hook without the homepage panels.
- Users renders its first page before the optional corpus count. Searching and
  pagination retain their current behavior.
- Trends retains its sign-in gate and loads historical chart series without the
  twelve weekly queries needed only by homepage panels. The explorer has its own
  daily cache key, keeping full-snapshot consumers unchanged.
- Graph starts its public snapshot and identity reads together. Its loading
  boundary downloads the graph engine while the snapshot is in flight.
- Bangers renders its heading before rankings arrive. Search imports tweet
  results only when they are needed. Missing route loading boundaries now cover
  Digest, Gallery, Graph, Trends, and Research, enabling partial route prefetch.
- Docs and Research already render from static/hourly cached content; there is
  no reason to introduce another data or caching layer for their landing pages.

The additional readiness categories are Digest, Gallery, Graph, Stream, Trends,
Research, and Docs. Usable-data markers include `digest_article`,
`gallery_catalog`, `stream_feed`, and `bangers_results`. A shell marker alone is
never evidence that a graph or chart is usable.

## Search request path

Search gives its five-result preview at most 250 ms before starting the canonical
page. A fast, definitively empty preview still avoids the second query. A slow
preview can overlap one canonical request; canonical results take precedence and
cancel any remaining preview. This bounds the preview's added latency without
changing query terms, phrase matching, filters, ordering, or page size.

Canonical tweet text, authors, media, and engagement render before optional
quoted-tweet bodies finish. Quotes are attached afterward; CSV export waits for
the complete enrichment. Load-more retains the established page ordering.
Equivalent parent rerenders do not restart searches. Changing filters, retrying,
or unmounting cancels obsolete browser requests and prevents their late results
or enrichment callbacks from replacing the active search. Cancellation also
reaches Supabase reads and the Vercel proxy's upstream fetch; database-side query
termination remains the gateway's responsibility.

When ClickHouse text search is enabled, its failures return an actionable error
and retry control instead of starting another corpus scan against PostgreSQL.
The existing PostgreSQL path remains available for unsupported/filter-only reads
and environments with ClickHouse search disabled. Search responses remain
private and uncached, and this change introduces no database or policy changes.

`search_results_received` measures from the start of each list request to its
preview/canonical response, with only `phase`, `result_count`, `elapsed_ms`, and
`page`. It measures data availability, not paint or navigation time, and includes
no query text, account names, filters, or URLs.
