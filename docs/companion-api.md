# Community Archive companion API

The extension and website use the same CA feature services. `GET /api/companion/v1/{feature}` returns a compact, versioned projection. Ranking, archive policy, graph construction, and digest publication remain owned by existing services. These routes perform no writes, generation jobs, or schema changes.

| Feature | Inputs | Service reused |
| --- | --- | --- |
| `bangers` | `username`, or `q` and `period`; `offset` | Public profile resolution and curated profile bangers; portal bangers |
| `digest` | Optional `date`, `q`, `username` | Published digest reader; keyword/author matches move stories first |
| `trends` | Required `q`; `granularity` | Portal series and evidence, with tweet enrichment |
| `search` | Required `q`; optional `username`, `offset` | Analytical text search and quote/media enrichment |
| `graph` | `username` | Social graph snapshot, projected to eight strongest retained neighbors |

`period` accepts `today`, `week` (default), `three-months`, or `all`. Author bangers use the profile's ranking and curation across time. Trend granularity accepts `year`, `month` (default), `week`, or `day`. Search uses phrase matching for multiple words. Tweet pages contain six results; offsets are bounded to 1,000. Queries are bounded to 120 characters (80 for trends), usernames to Twitter handle syntax, and digest dates to valid ISO dates. Graph responses retain snapshot date, time-window semantics, and truncation status.

## Authentication and privacy

Trends requires a signed-in, non-anonymous CA account. The route accepts a website session or an extension `Authorization: Bearer <Supabase access token>`. Supabase Auth verifies bearer tokens with `getUser(token)`; a supplied invalid token never falls back to cookies. Public views do not require a token. The extension fetches from its background context with the existing CA host permission; public cross-origin CORS access is not added.

All responses use `private, no-store` and vary on authorization/cookie headers. Upstream failures return a noncacheable 502 without leaking service errors or logging browsing queries. Strict digest reads propagate database failure instead of reporting an empty edition. Existing middleware gives all companion reads one separate bounded budget, retaining its per-IP limits.

Requests carry a chosen query and/or public author handle. They do not carry private reading records, observation duration, or the reader's identity on public calls. Private history remains a separate owner-scoped path. Graph ties describe recorded interactions, not friendship or agreement.

## Contract and co-evolution

`src/lib/companion/contract.ts` is the browser-safe v1 contract: types, bounded input parsing, request paths, and website continuation links. Server adapters conform to it. The extension keeps a generated copy with a SHA-256 source marker because the projects build independently; no new package registry is required.

From the extension repository:

```sh
node scripts/sync-companion-contract.mjs /path/to/community-archive/src/lib/companion/contract.ts
node scripts/sync-companion-contract.mjs /path/to/community-archive/src/lib/companion/contract.ts --check
```

Use additive v1 changes: installed extensions can lag website releases. Incompatible changes need a new version. The extension validates responses, reports unavailable/unsupported versions, caches bounded results briefly, deduplicates requests, and cools down on 429/5xx. Review the canonical contract and generated consumer together.

Continuation links retain query, author, digest date, or trend granularity. `/social-graph?person=username` initializes the selected/pinned person, keeping the companion's subject in view.

## Release and verification

Release this API before the matching extension. Until then, extension views report that the API is awaiting release. Existing website Supabase and analytical gateway configuration is sufficient. The earlier private-history migration remains a separate prerequisite for Memory/Attention.

```sh
pnpm exec jest --selectProjects server client --runInBand --runTestsByPath \
  src/lib/companion/companion.test.ts src/lib/middlewareRateLimit.test.ts \
  src/app/social-graph/page.test.tsx src/app/social-graph/SocialGraphExplorer.test.tsx
pnpm type-check
```

Before release, use a configured staging extension to verify actual OAuth bearer validation, all five live response shapes, source links, rate limits, and an unavailable upstream. The local preview uses labeled fictional data; its interactions do not establish live-service compatibility.
