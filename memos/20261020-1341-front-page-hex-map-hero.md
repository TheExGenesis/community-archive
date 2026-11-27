# Community Archive front page: hex-map hero (spec v1)

_2026-10-20 13:41_

Status: draft, to be revised together. Scope: the hero only (header, search,
map, stories, sidebar). Everything currently below the fold (digest card,
portal panels, upload section, community apps, testimonials) is untouched for
now and gets folded in after the hero is right.

This revision fills in the "CA to fill in" sections of spec v0 with what the
repository actually has, records the answers to the open questions, and adds
the CA-side constraints (consent policy, data authority, hosting) that the v0
spec did not know about. The STLM/spread-explorer asset list from v0 is
repeated at the end so this memo stays self-contained.

## Why

The current front page is a title, a stats line, a search bar and eight
avatars (`src/components/home/ClassicHomepage.tsx`,
`src/components/home/HomepagePeople.tsx`). It says nothing about what the
archive contains. The TPOT hex map from the spread explorer is the most
evocative artefact we have: it shows the community as a place. The hero makes
the map the thing you look at and makes every other element on the page
(stories, search, people, coverage) a lens on it. Rule: hover or click
anything, the map answers.

## What it reuses

- The TPOT map from the spread explorer: 1,730 hexes, 70,577 accounts placed
  (CA members plus their mutual 1-hop ties; 87,449 accounts in the lookup
  table), 24 named "countries". 672 archived accounts sit in 349 of the hexes.
- The explorer's data files (`meta.json`, `regions.json`) and geometry code.
- The explorer's ClickHouse tables (`xyra.spread_tweets`,
  `xyra.spread_hex_dict`) for the live endpoints, served through the CA
  analytics gateway (see "Hosting").
- CA's existing digest and strands data for the story column.
- CA's existing `TweetCard` for every tweet rendered in the sidebar.
- The atlas palette, re-tuned for CA's light theme.

## CA repository facts the hero depends on

### Homepage today

- Route: `src/app/page.tsx` (`force-dynamic`, `maxDuration = 60`). It starts
  `startHomepageData()` from `src/lib/portal/data.ts` and renders
  `ClassicHomepage` with `HomepagePeople` as a slot.
- Hero today: serif h1, `HomepageStats` line ("We preserve N public tweets
  from M community members", from the ClickHouse `corpus-count` gateway
  endpoint via `HomepageData.globalStats`), then either `HeroCTAButtons`
  (guests and members with a pending opt-in action) or `HomepageSearch`
  (members), then the avatar row and the "Backed by" line.
- Search: `src/components/HomepageSearch.tsx` wraps `UserSearchInput`,
  builds params with `buildSearchParams` / `parseSearchExpression` from
  `src/lib/searchParams.ts`, fires the `archive_search_submitted` PostHog
  event, and pushes to `/search?…`. The three chips are the constant
  `exampleSearches = ['open source', 'AI alignment', 'from:vitalikbuterin']`.
  Keep all of that; the map only adds a debounced side effect while typing.
- Avatar row: `sampleFeaturedArchives()` in `src/lib/featuredArchives.ts`
  samples one account from each of 8 editorial buckets
  (`FEATURED_ARCHIVE_GROUPS`, 28 handles with `account_id`, `username`,
  `avatar_media_url`, `num_tweets`).
- Below the fold: `HomepagePortal` (digest card `DigestHero`, live stream,
  bangers, trends, research panels in `src/components/portal/Portal.tsx`),
  `HomepageUpload` (section id `#upload-archive`), `FeaturedCommunityApps`,
  `Testimonials`.
- Theme: `src/app/globals.css`. Light `--background` is pure white
  (`0 0% 100%`), `--muted` is `240 4.8% 95.9%`, brand is `#1E9BCD`
  (`--brand`), `--brand-deep` `#10516B`, border `240 5.9% 90%`. Dark mode
  exists and must keep working. Fonts: Petrona (serif, `--font-petrona`) is
  reserved for h1/h2; Manrope (`--font-manrope`) is the body sans. Inside the
  map use Manrope.
- Analytics: homepage sections report readiness with `SectionReady` from
  `src/components/PagePerformance.tsx`; server reads are wrapped in
  `measureServerRead`. New hero regions should do the same.

### Stories, tab 1: Digest

- Source of truth: Supabase table `digest_editions` (status `published` only;
  drafts never cross the public RLS policy). Read through
  `getPublishedDigest()` / `getLatestDigestPreview()` in
  `src/lib/digest/data.ts`. The homepage already calls
  `getLatestDigestPreview()` in `HomepageDigest`
  (`src/components/home/HomepageDataSections.tsx`).
- Shape: `DigestEdition.content: DigestEditionContent` (`src/lib/digest/types.ts`)
  with `stories: DigestStory[]`. Each story has `slug`, `category`
  (loose label such as `AI news`, `Meme`), `keyword`, `title`, `subtitle`,
  `bullets`, `bangers: PortalTweet[]`, `commentary: PortalTweet[]`.
- Stable story id: `${digestDate}/${story.slug}`; the public story URL is
  `/digest/YYYY-MM-DD/story-slug`.
- Tweet ids and authors are already in the payload: every `PortalTweet` in
  `bangers` and `commentary` carries `id` and (for anything saved since the
  marker was added) `accountId`, plus `username`. So the hex lookup needs no
  tweet-id join at all for digest stories: resolve `accountId → hex` with
  `dictGet('xyra.spread_hex_dict','hex', toUInt64(accountId))`. Fall back to
  the tweet-id join only for old editions whose snapshots lack `accountId`.
- Weighting: bangers count more than commentary (suggest 1.0 vs 0.4). Origin
  hex = hex of the earliest `createdAt` banger.
- `DigestStoryCategory` becomes the badge next to the country name.
- There is one edition per day with 3–5 stories. The tab shows the latest
  published edition; the headline (`executiveSummary[0]`) stays as the tab
  intro, linking to `/digest/<date>`.
- Preview/dev: `DIGEST_MOCK_DATA=true` gives a fixture edition
  (`src/lib/digest/mock.ts`) with hydrated tweets, so the hero can be built
  without production digest data.

### Stories, tab 2: Strands

- Source of truth: the private Supabase Storage bucket `community-app-data`,
  `manifest.json` → `v1/<import-id>/strands.json`, read with the service-role
  client by `getStrands()` in `src/lib/community-apps/data.ts` (request-cached,
  5-minute snapshot cache, consent re-checked every request). Display data
  (`totalPosts`, `mapLabel`, monthly `activity`) and 2-D `position` come from
  the checked-in `strand-display.json` and `strand-positions.json`.
- Shape (`src/lib/community-apps/types.ts`): `Strand { id, title, summary,
  rating, username, text, createdAt, participants: string[],
  essentialTweets: { id, annotation }[], totalPosts?, mapLabel?, activity?,
  position? }`.
- Stable story id: `strand.id`, which is the seed tweet id. Public URL
  `/strands/<seed>`; list API `GET /api/strands?q=&offset=` returns
  `StrandPageData` with the hydrated seed `tweet` per card.
- Tweet ids per strand: `[strand.id, ...strand.essentialTweets.map(t => t.id)]`.
  Strands carry author handles (`username`, `participants`) but not account
  ids, so the hex resolution for strands does use the tweet-id join from v0:
  `SELECT tweet_id, author_id, dictGet('xyra.spread_hex_dict','hex',author_id)
  FROM xyra.spread_tweets WHERE tweet_id IN (…)`. Handles can be resolved
  via `xyra.spread_handle_dict` as a fallback for essential tweets that are
  not in `spread_tweets`.
- Ordering: `filterStrands()` in `strand-list.ts` sorts by `rating` desc; the
  tab shows the top N by that order (N ≈ 6) with the `activity` sparkline
  as a secondary cue.

### Consent and data authority (applies to every hero endpoint)

AGENTS.md rules that the v0 spec did not account for:

- Supabase is authoritative for membership and opt-out. ClickHouse `is_ca`
  is a projection and can lag. Every list of tweets or accounts shown in the
  sidebar must pass through `getAppPolicy()` (`src/lib/community-apps/data.ts`):
  the author must be in `user_directory` with `has_archive || is_opted_in`,
  and must not be in `optin.explicit_optout`, by username and by
  `twitter_user_id`. This is exactly what `/api/strands/[seed]/context` does
  today; copy that pattern.
- Per the answer to open question 4, the Street View feed shows only archived
  members' tweets (`is_ca = 1` in ClickHouse, then the Supabase policy check).
  Non-archived accounts are counted in the hex totals and may appear as
  handle-only representatives, never as tweet text.
- Stories already filter: digest editions are published artefacts that were
  consent-checked at publication; `getStrands()` drops strands whose seed
  author is not a member or that name an opted-out participant.
- `meta.json` `hex.reps[]` lists handles for non-archived accounts too.
  Showing those handles on a public page is new exposure. Proposal: show
  reps with `ca = true` by handle and avatar; show non-archived reps only as
  a count ("and 5 more") until we decide otherwise. Flagged as an open
  question below.
- Rendering: use `src/components/TweetCard.tsx` with `PortalTweet` data, and
  hydrate tweets through `getStrandTweets()` / `fetchClickHouseTweetPageData`
  rather than rendering raw ClickHouse `text`. That keeps media, quoted
  tweets and text normalization (`src/lib/tweetText.ts`) consistent.

### Hosting: how CA reaches the explorer data

Answer to open question 2. The explorer's ClickHouse (`xyra` database,
`127.0.0.1:18123`) and server (`127.0.0.1:8770`) run on one Mac under launchd.
CA production runs on Vercel (`vercel.json`, fluid compute, 15 s default
function limit, 60 s where routes raise it) and cannot reach that loopback. A
tunnel from Vercel to a laptop is not acceptable for a public page that serves
real people's posts.

CA's only ClickHouse path is the analytics gateway in the control-panel repo:
`CLICKHOUSE_ANALYTICS_API_URL` (`https://analytics.community-archive.org/analytics`)
with `CLICKHOUSE_ANALYTICS_API_TOKEN`, behind `ENABLE_CLICKHOUSE_READS=true`,
called through `src/lib/clickhouseGateway.ts` whose `ALLOWED_ENDPOINTS`
allow-list must name every endpoint and query parameter. AGENTS.md: new
gateway routes are gateway-first; verify and release the gateway before the
frontend that needs them. So:

- Phase 1 (static hero) needs no ClickHouse at all. Ship `meta.json`
  (1.8 MB) and `regions.json` (148 KB) as versioned assets. Preferred home:
  the same `community-app-data` bucket pattern as strands
  (`v1/<import-id>/spread/meta.json`, pointer in `manifest.json`) so a map
  rebuild is an upload, not a deploy. Strip `meta.json` to what the hero
  needs (`hex.x/y/size`, `accounts`, `ca`, `reps` filtered per consent,
  `tweets_week`, `months`, `weeks`, `caveats`) in a build step; target under
  600 KB gzipped. Serve to the client from one CA route (`/api/hex-map/meta`)
  with a long `Cache-Control` and an ETag keyed on the import id.
- Phases 2–4 need the `xyra.spread_*` tables loaded into the production
  ClickHouse behind the gateway (one-off load of `spread_hex`,
  `spread_handle`, and the dictionaries; `spread_tweets` is a Merge over the
  existing corpus, so the gateway's existing tweet tables should serve as the
  base rather than copying 68.6M rows). Then port the four explorer queries
  (`/api/real`, `/api/posts`, `/api/accounts`, `/api/anchors`) to gateway
  endpoints: proposed names `hex-word-heat`, `hex-posts`, `hex-accounts`,
  `hex-anchors`, plus `hex-activity` for the weekly brightness. Add each to
  `ALLOWED_ENDPOINTS` with its parameters. CA route handlers under
  `src/app/api/hex-map/*` wrap them and apply the consent policy.
- Stories resolution (`/api/stories` in v0) is a CA route, not a gateway one:
  it reads digest/strands from Supabase, then calls one gateway endpoint
  (`hex-lookup?ids=…` for account ids, `hex-lookup?tweet_ids=…` for tweet
  ids). Cache per story id in the Next Data Cache for 24 h; digest editions
  and strand snapshots are immutable once published.
- Per AGENTS.md, a cacheable analytical API must return a non-cacheable
  non-2xx on upstream failure, never an empty 200. The hero must render the
  static map when every live endpoint fails (the existing `failed` pattern in
  `HomepageData`).

### Upload link for the coverage overlay

"Invite someone from here" links to `/#upload-archive` (the `HomepageUpload`
section on the same page), and for a specific unarchived handle to
`/user/<handle>` where the existing missing-account prompt lives
(`src/app/missing-accounts`, `src/lib/missingAccounts.ts` for the data).

## Layout (desktop, ≥1200px)

```
┌───────────────────────────────────────────────────────────────────┐
│ header: logo · nav · search field (unchanged, src/app/layout.tsx)  │
├───────────────────────────────────────────────────────────────────┤
│ Community Archive                                                  │
│ We preserve 20.2M tweets from 945 members. [search bar, wide]      │
│ Try: open source · AI alignment · from:vitalikbuterin              │
├────────────────┬────────────────────────────────┬─────────────────┤
│ STORIES        │                                │ SIDEBAR         │
│ [Digest|Strands│          HEX MAP               │ (empty state:   │
│  tabs]         │   country labels, hover glow,  │  map legend +   │
│ • story 1      │   anchor pins, coverage/word   │  coverage       │
│ • story 2      │   overlays, time scrubber      │  summary)       │
│ • story 3      │                                │                 │
│ • …            │                                │                 │
│ 24% | 52% | 24%│                                │                 │
└────────────────┴────────────────────────────────┴─────────────────┘
```

Map height ~70vh, never taller than its aspect allows; country labels as in
the explorer, hidden below a width threshold. The stats line keeps
`HomepageStats` so the numbers stay live. The hero search is shown to guests
too (today guests see `HeroCTAButtons`); the CTA buttons move into the sidebar
empty state for guests and into the existing `#upload-archive` section.

Tablet: stories above the map, sidebar becomes a bottom sheet. Mobile: map
first (pinch/zoom), stories as a horizontal card strip, sidebar as a bottom
sheet. Hover interactions become tap.

## Interactions

### 1. Stories light up the map

Left column has two tabs: Digest (latest published edition's stories) and
Strands (top strands by rating). Each story resolves to `[(hex, weight)]`, an
origin hex and a home country via `/api/hex-map/stories?tab=digest|strands`
(see "Stories" above for sources and ids).

Hover a story: its hexes glow, origin brightest, weight fading outward; all
other hexes desaturate. A badge on the story shows its category and home
country ("AI news · Rationalists & EA"). Click a story: pins the highlight,
sidebar shows the story's tweets grouped by hex, each with its country name,
rendered with `TweetCard`, and a link to the story page. Click again or Esc to
unpin. Stories whose authors are all off-map (hex = -1) show a grey "off the
map" badge.

### 2. Street View (click a hex)

Click a hex: sidebar shows country name and hex number, account count, CA
share ("38 of 112 archived"), distinctive words (`regions.json`
`hex_terms[hex]`), representative accounts (`meta.json` `hex.reps[hex]`,
filtered per consent, avatars from `user_directory` where CA has them), and a
feed of recent tweets from archived members in that hex
(`hex-posts`, `sort=time`, `is_ca=1`, consent-filtered, infinite scroll via
`offset`) with a "7 days / 30 days / all" switch.

Shift-click adds hexes to the selection; the feed merges them. Click a
country label to select every hex with that `hex_region`. Hover a hex (no
click): tooltip with country, count, top 3 archived reps.

### 3. Coverage overlay

Toggle "Archived" in the map toolbar. On: hex fill opacity = `ca / accounts`
(unarchived hexes go near-white with a faint outline); country colours stay
so the geography still reads. Sidebar empty state always shows the coverage
summary: "672 archived accounts in 349 of 1,730 cells; biggest gaps: …" (top
3 countries by unarchived accounts, computed client-side from `hex.ca`,
`hex.accounts`, `hex_region`). Clicking an unarchived hex adds "k of n
accounts here are archived" and the "Invite someone from here" link.

### 4. Search drives the map

The existing `HomepageSearch` keeps its Enter behaviour and PostHog event.
While typing (debounced ~300 ms, ≥3 chars), the map shows a live heat map of
where the term is used (`hex-word-heat?q=<term>&bucket=month`; cell
intensity = uses / tweets in cell, log-scaled, as in the explorer README).
The time scrubber appears, defaulting to the latest month. `from:handle`
queries (parsed by `parseSearchExpression`) drop a pin on that account's hex
(`hex-anchors`). The three "Try:" chips become preset heat maps: hover
shows, click searches.

### 5. Time

A slim scrubber under the map: 31 months (2024-01 … 2026-07) or 135 weeks, as
in the explorer. Visible only when a word heat map or a story is active. Play
animates month by month.

Default (answer to open question 5): weekly activity. With no word and no
story, the map shows this week's activity as subtle brightness per hex
(`tweets_week[hex][-1]` over the hex's weekly mean), so the page moves on
arrival without being noisy. Until the map is rebuilt on a schedule, the
"latest week" is the last week in `meta.json`; the `hex-activity` gateway
endpoint (cached hourly) replaces it in phase 4.

### 6. People pins

The avatar row leaves the hero. Answer to open question 3: the pins are a
sample of the handles already used on the page. Reuse
`sampleFeaturedArchives()`: it already yields 8 per visit, one per editorial
bucket; take the first 6 after the shuffle, so pins rotate per visit exactly
as the avatar row does today, and the bucket design keeps them representative.
Resolve to hexes with `hex-anchors?handles=…` (or `account_id` via the dict,
which is more robust to renames). Hover shows handle and country; click
opens that account's Street View (its hex, its tweets only, `handle=` on
`hex-posts`).

### 7. Shareable state

URL hash, same scheme as the explorer: `#w=<word>&t=<month index>&c=<hex,hex>
&a=<handles>&s=<story id>&o=ca`. Story ids are `digest:<date>/<slug>` and
`strand:<seed>`. Loading a shared URL restores the view. Later: a server-side
OG image of the current map state alongside the existing
`src/app/opengraph-image.tsx`.

## Theme

CA's light background is pure white, not `#fafaf9`; use `--card` / `--muted`
(`240 4.8% 95.9%`) as the map's own surface so hexes have something to sit
on. Hex fills from the atlas palette lightened ~20% with darker strokes
between countries; labels in `--foreground`. Highlight: saturate plus
`--brand` stroke; dimmed: 25% opacity. Heat map: one sequential ramp (light
sand → deep orange) layered over the country colour so orientation survives.
Coverage overlay uses opacity, not colour. Dark mode: invert lightness of the
palette the same way `--brand` flips (`#1E9BCD` → `#75C9EB`). Serif title
(Petrona) stays; inside the map use Manrope. Per `docs/design`, keep
`SectionReady` and the `home-fade-in` settle animation for streamed regions.

## New CA code (proposed shape)

- `src/lib/hexMap/` : types (`HexMeta`, `HexRegions`, `StoryHexes`), loaders
  for the static assets, consent filter for reps, story-to-hex resolution,
  coverage summary math. Server-only; no client component imports.
- `src/app/api/hex-map/{meta,stories,posts,heat,anchors,activity}/route.ts`:
  thin wrappers that validate params, call the gateway through
  `clickhouseGateway.ts`, apply `getAppPolicy()`, and set cache headers.
- `src/components/home/hero/`: `HexMap` (client; SVG geometry ported from
  `static/app.js`), `StoryColumn`, `MapSidebar`, `TimeScrubber`, `MapToolbar`,
  `useHexMapState` (URL hash). `ClassicHomepage` composes them in place of
  the current hero block.
- Gateway (control-panel repo): `hex-lookup`, `hex-word-heat`, `hex-posts`,
  `hex-accounts`, `hex-anchors`, `hex-activity`, plus the `xyra.spread_*`
  tables and dictionaries.
- Tests at the feature boundary (`ClassicHomepage.test.tsx` pattern), plus
  unit tests for the hex resolution and coverage math.

## Caveats to carry onto the page (from `meta.json` `caveats`)

- Xyra rows are English tweets with at least 1 like, no retweets; archive
  rows are complete for the 672 archived accounts on the map.
- Accounts: Community Archive members and their mutual 1-hop ties.
- Map: graph embedding of all 2022–2026 mutual interactions.
- Most archived accounts (945 listed on the site) are not on this map yet;
  the map has 672 of them. Expect that number to move when the map is
  rebuilt.

## Numbers for copy

| thing                    | value                            |
| ------------------------ | -------------------------------- |
| hexes                    | 1,730                            |
| countries                | 24                               |
| accounts placed          | 70,577                           |
| archived accounts on map | 672 (in 349 hexes)               |
| tweets in spread_tweets  | 68.6M                            |
| time range               | 2024-01 to 2026-07 (31 months)   |
| homepage featured pool   | 28 handles in 8 buckets, 6 pinned |

## Open questions

Answered:

1. Where digest stories and strands live and their stable ids: see
   "Stories" above.
2. Hosting: no tunnel. Static assets in `community-app-data` for phase 1;
   `xyra.spread_*` loaded into the gateway ClickHouse and new control-panel
   endpoints for phases 2–4.
3. Pins: a per-visit sample of 6 from the existing featured-archive buckets;
   they rotate as the avatar row does today.
4. Street View feed: archived members' tweets only; everyone else is a
   count.
5. Default state: weekly activity.

Still open:

- Non-archived representative handles in `hex.reps`: show by handle, or
  count only? (Proposal above: count only.)
- Map rebuild cadence, and who owns it. Weekly activity needs either a weekly
  rebuild of `meta.json` or the `hex-activity` endpoint from day one.
- Does the gateway ClickHouse already hold the author ids and `is_ca` needed
  to rebuild `spread_tweets` there, or do we load the Mac's `tweets` and
  `ca_extra` tables as well?
- Guests currently see `HeroCTAButtons` instead of the search bar. The hero
  shows search to everyone; confirm where the three CTAs land.

## Phases

1. Static hero: map in the light theme with countries and labels, coverage
   overlay, hover tooltips, sidebar empty state, people pins resolved at
   build time from `meta.json`. Needs only the two JSON assets in
   `community-app-data`. Shippable on its own.
2. Street View: hex click, multi-select, feed with time switch. Needs
   `hex-posts` in the gateway and the consent filter.
3. Stories: `/api/hex-map/stories`, tabs, hover glow, pinned view. Needs
   `hex-lookup` in the gateway; digest side can start on the mock edition.
4. Search + time: live heat map from the search bar, scrubber, chips, live
   pins, weekly activity endpoint. Needs `hex-word-heat`, `hex-anchors`,
   `hex-activity`.
5. Polish: URL state, mobile, OG image, performance pass against
   `docs/website-performance.md`.

## Out of scope (v1)

Whole-network (97.8M) map, 3D terrain, star map, model predictions. Anything
below the fold; search results page; account pages.

## Spread explorer assets (for an outside session)

Everything below is on this Mac. Paths are absolute. The worktree is a Git
checkout of stlm-1, branch `feat/spread-explorer` (PR
TheExGenesis/stlm-1#70); another session edits it, so copy what you need
rather than editing in place.

Code and service:

- Code: `/Users/frsc/Documents/ChatGPT/STLM/.worktrees/spread-explorer/spread-explorer/`
  - `server.py`: the HTTP API (stdlib, loopback only), ~230 lines.
  - `static/app.js`, `static/index.html`: the current hex renderer (SVG hexes
    from `meta.json`, country labels, hover, click, URL hash). Reuse the
    geometry code.
  - `build_data.py`, `build_regions.py`: how the map and countries were built.
  - `README.md`: colour recipe and ClickHouse notes.
- Running service: launchd `com.stlm.spread-explorer`, `http://127.0.0.1:8770`,
  started as `uv run --no-project python server.py --port 8770 --tweets
  xyra.spread_tweets`. Log:
  `/Users/frsc/Documents/ChatGPT/STLM/output/spread-explorer-20261010/logs/explorer.log`.
  Hosting notes:
  `/Users/frsc/Documents/ChatGPT/STLM/memos/20261014-spread-explorer-persistent-hosting.md`.
- ClickHouse: launchd `com.stlm.xyra-clickhouse`, HTTP on
  `http://127.0.0.1:18123`, no auth, database `xyra`. Query with
  `curl 'http://127.0.0.1:18123/' --data-binary "<sql>"`.

ClickHouse tables (database `xyra`):

- `spread_hex (author_id UInt64, hex Int32, x Float32, y Float32)`, 87,449
  rows, plus dictionary `spread_hex_dict` (hashed, hex default -1 for unknown
  accounts). Use `dictGet('xyra.spread_hex_dict', 'hex', author_id)`.
- `spread_handle (author_id UInt64, handle String)` plus `spread_handle_dict`.
- `tweets`: Xyra corpus, English, ≥1 like, no retweets. Columns `tweet_id
  UInt64, author_id UInt64, created_at DateTime('UTC'), observed_at, text
  String, like_count UInt32, source_id LowCardinality(String), graph_group
  UInt16, is_ca UInt8, n_ca_ties UInt32, max_tie_weight UInt32`. Ordered by
  `(graph_group, author_id, created_at)`, token text index on `text`.
- `ca_extra`: 3,562,202 archive tweets since 2022 not already in `tweets`,
  same columns, `source_id = 'community-archive'`, `is_ca = 1`. Includes
  zero-like tweets.
- `spread_tweets`: Merge over `tweets` and `ca_extra`, 68,628,335 rows. Use
  this one for everything on the page.

Data files (`…/spread-explorer/data/`):

- `meta.json` (1.8 MB): `months` (31 labels YYYY-MM), `weeks` (135 Monday
  dates), `tweets[hex][month]` and `tweets_week[hex][week]` (denominators),
  `tweets_off_map`, `tweets_week_off_map`, `hex = {x[], y[], size, accounts[],
  ca[], reps[]}` indexed by hex number 0…1729 (`size` is the hex radius in
  layout units; `reps[hex]` is up to 8 of `{id, handle, ca, ties}`),
  `accounts = {listed, placed, on_map, with_handle}`, `caveats`.
- `regions.json` (148 KB): `hex_region[hex]` → region id, `hex_terms[hex]` →
  distinctive words, `regions[] = {id, name, short, note, accounts, hexes, x,
  y, reps[], terms[]}` (24 regions; x, y is the label position).
- `regions_evidence.json`, `region_names.json` (code dir), `days.json`
  (4.4 MB, only for `bucket=day`), `stars.json`, `stars_xyz.npy`, `model*/`:
  not needed on the page.

Existing explorer endpoints (GET, JSON, `127.0.0.1:8770`), to be ported to the
gateway:

- `/api/meta` → `meta.json` plus `words` and `models` lists.
- `/api/real?w=<term>&bucket=month|week|day` → `{word, bucket, uses[hex][t],
  total[t]}` (day returns sparse `cells:[[hex,t,n]]`). Whole-token,
  case-insensitive match via the text index; multi-word terms are phrase-ish.
- `/api/posts?hex=1,2&from=YYYY-MM-DD&to=YYYY-MM-DD&w=<term>&sort=time|likes&offset=0`
  → `{total, accounts, offset, page, posts:[{id, author, handle, ca, at,
  likes, text}]}`. Page size fixed in `server.py` (`PAGE`). Needs `handle=`
  and `since=7d|30d` added, and an `is_ca=1` filter for the CA page.
- `/api/accounts?hex=1,2&w=<term>` → top 200 accounts by uses in those hexes.
- `/api/anchors?handles=a,b,c` → `{anchors:[{handle, id, hex, x, y} |
  {handle, missing}]}`.
- `/api/days`, `/api/model`, `/api/stars`: not needed.
