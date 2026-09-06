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
