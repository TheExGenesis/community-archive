# Website architecture

The website keeps route composition, feature state, source adapters, and rendering
separate. Start with the feature entry point; follow its explicit imports to the
part that owns the behavior you want to change.

## Where changes belong

| Responsibility                                         | Location                                                                             | Example                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Route loading, authentication, metadata, API responses | `src/app/`                                                                           | Profile eligibility and initial data stay on the server        |
| Shared tweet contracts and normalization               | `src/lib/tweets/`                                                                    | Convert nested search accounts before rendering                |
| Source-specific queries and server adapters            | `src/lib/queries/`, `src/lib/clickhouse*`, `src/lib/portal/`, `src/lib/metaTwitter/` | Fetch and enrich data without importing client component types |
| Trends composition and controls                        | `src/components/portal/TrendsExplorer.tsx`                                           | Connect the chart and evidence feed                            |
| Trends client state, requests, and chart               | `src/components/portal/trends/`                                                      | Series and URL state, evidence pagination, pointer selection   |
| Profile composition and chapter navigation             | `src/components/metaTwitter/ProfileArchive.tsx`                                      | Select a year or subsection and coordinate active loading      |
| Profile cached reads and editing                       | `src/components/metaTwitter/profile/`                                                | Resource cache, reload operations, curation commands           |
| Shared presentation                                    | `src/components/`, `src/components/ui/`                                              | Tweet cards and UI primitives                                  |

`portal` and `metaTwitter` remain existing product namespaces: the former owns
dashboard/exploration features, the latter owns the profile archive experience.
Feature internals live beside their entry components. The module map provides
ownership without renaming every caller or adding a generic application framework.

## Tweet boundaries

`src/lib/tweets/types.ts` defines `TweetData`, the normalized archive display
contract. `TweetInput` accepts the flat and nested shapes used by search and
thread data. `normalizeTweet` resolves identity and defaults at the list/thread
boundary, retaining full text, URLs, media dimensions, quotes, external-source
markers, and retweet attribution. `UnifiedTweetList` normalizes once for its
render/export pass; `TweetComponent` only reads the normalized fields.

`ArchiveTweetResponse` explicitly retains the nested account alias emitted by
existing API producers. Moving UI normalization does not remove that public
compatibility field. Normalization is not authorization or network validation:
source adapters still own those responsibilities.

`TweetCard` remains the full-fidelity renderer for `PortalTweet` data, used by
Trends, Bangers, and other portal surfaces. `TweetComponent` still serves existing
archive search and thread layouts. These are intentional display contracts;
convert at a named adapter instead of teaching either renderer additional source
formats. New server code imports types from data modules, never client components.

## Trends

- `useTrendExplorer` owns configured terms, chart series, scale/granularity,
  telemetry, and serialized URL state.
- `useTrendEvidence` owns evidence requests, cache keys, pagination, refresh,
  range debounce, cancellation, and its scroll observer. It receives the selected
  terms/range and whether a pointer selection is in progress.
- `TrendChart` owns SVG geometry and pointer interaction. It reports range changes
  and selection activity; it does not fetch data.
- `requests.ts` handles the two existing API requests and response checks;
  `model.ts` contains snapshot/range conversions and labels.

Changing the evidence order or cache policy should not require editing chart SVG.
Changing chart geometry should not require editing request coordination. Keep the
existing delayed range fetch, immediate cached results, and chart/feed failure
isolation when extending these modules.

## Profile

`useProfileResources` owns feed/media/people caches, in-flight deduplication,
loading/failure flags, and reload operations. It exposes read accessors and cache
update methods, keeping mutable refs and invalidation bookkeeping private.
`ensureFeed` fills the selected feed under the existing preload budget.

`useProfileCuration` owns edit commands and their feedback/undo state. It calls the
existing authenticated server action and uses resource methods to reconcile or
reload cached results after success. It does not duplicate fetch or invalidation
logic. The server action remains the authorization boundary.

`ProfileArchive` composes these hooks with chapter/section history, active loading,
intent-based prefetch, and the existing `Workspace`. Server eligibility checks,
public versus owner state, and source-of-truth policy remain at their current
boundaries. See [website performance](./website-performance.md) for loading and
prefetch contracts.

## Focused verification

The existing `TrendsExplorerResilience` and `ProfileArchive` suites exercise the
features through their public components: failures, retry, pagination, browser
history, pointer selection, prefetch, and owner editing. Keep those tests at the
feature boundary so internal files can move without rewriting mocks.

`src/lib/tweets/normalize.test.ts` covers source-shape compatibility and payload
fidelity; `UnifiedTweetList`, `TweetComponent`, and `ThreadView` cover rendering and
interaction. Run the relevant suites plus TypeScript and lint when changing these
boundaries. No database setup is needed for these mocked feature checks.
