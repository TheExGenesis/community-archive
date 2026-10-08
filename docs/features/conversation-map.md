# Conversation Map

`/conversation-map` is a first-party experiment listed in the Community Gallery.
The page contains only the map and its navigation; source posts open in the
shared `TweetCard` hover card and link to `/tweets/:id`.

## Data and privacy

`GET /api/conversation-map?year=YYYY` reads at most two 100-item pages from the
existing Bangers serving path, using `scope: members` and `sort: quotes`.
It inherits that path's membership/opt-out enforcement and complete tweet,
media and quoted-tweet enrichment. It does not ship the prototype's frozen
source export or call a new database/gateway service. Success has the same
60-second shared-cache / 300-second stale-while-revalidate policy as the Bangers
API; errors return non-cacheable non-2xx responses.

Height represents current community quote counts for posts authored in the
chosen year, not daily tweet volume or a contemporaneous historical ranking.
Historical labels are whitespace-normalized prefixes of actual tweet text.
The 2026 editorial drafts are server-only; an override/group is returned only
when all its sources occur in the current member-filtered result. Other posts
use snippets. Full source payloads are never truncated by the adapter.

## Interaction

Scrolling zooms around the pointer. Dragging pans, and the overview supports
panning and resizing. At full-year zoom, arrows select adjacent available
years. Global label layout depends on zoom and chart width, not viewport dates,
and includes avatar space in collision checks. The plot clips that same layout
while panning. Hover cards dismiss after 120 ms away and also support click,
Enter/Space and Escape. Media uses the shared tweet card/lightbox.

## Focused checks

- `src/lib/conversation-map/data.test.ts`: member-only bounded reads, source
  fidelity, absent editorial sources, bad input and failure caching.
- `src/lib/conversation-map/layout.test.ts`: label/portrait space, disclosure,
  hit targets, range and leap-year boundaries.
- Gallery catalog and component tests cover the explicit first-party entry,
  internal navigation and absence of a fabricated launch/source post.

No database migrations or new gateway routes are required. Reverting the
feature commit removes its page, API and gallery entry together; the existing
Bangers path and data remain unchanged.

## AI discourse strand proof of concept (local)

The introductory copy explains the overview and progressive zoom. Selecting
**AI discourse** makes one bounded semantic query (`k=200`, similarity threshold
`0.45`) for the selected year through the existing `/embeddings/search` API.
Set server-only `CONVERSATION_MAP_VECTOR_URL` to the vector service origin (or
a local SSH forward). An absent URL or failed query returns a non-cacheable
502; the ordinary map remains available by deselecting the theme.

Only IDs are requested from vector search. Explicit AI terms in source text
provide an additional retrieval signal (AI, AGI, LLM, GPT, ChatGPT, OpenAI,
Anthropic, Claude, DeepSeek, artificial intelligence, language model). These
heuristics can include false positives, including ambiguous names. A match
is highlighted only if its source is already in the map's current member-filtered ClickHouse sample.
Grouped annotations require every source to match. Purple outlined dots mark
matches, **Strand only** focuses the map, and a date-ordered source list offers
a reading path. Height remains current community quote counts.

This is retrieval-assisted exploration, not a curated history or a claim of
completeness. It can miss low-engagement milestones, posts outside the 200-post
sample, and posts absent from the vector index. The single query and threshold
are experimental. A full 2015–present AI timeline would need independently
approved wider retrieval, temporal coverage, grouping, and sourced editorial
summaries. No production rollout, new gateway route, or corpus backfill is
part of this local proof of concept.

Local verification on 2026-09-09: the live 2026 vector query returned 12 IDs,
none overlapping the current ranked sample. Explicit terms highlighted 47
annotations (out of 196 annotations representing up to 200 source posts).
The combined integration is exercised, but this sample does not demonstrate
added semantic recall. Focused tests, TypeScript, and lint passed. Desktop
and 390px mobile rendering, strand filtering, and date-ordered source links
were checked; mobile had no horizontal overflow. Optional media/quote
enrichment could not reach the locally configured Supabase instance, so
that existing enrichment path was not verified.
