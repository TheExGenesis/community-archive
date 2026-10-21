# Front-page map: static first iteration

The homepage uses the real spread-explorer layout and atlas palette, with a
bundled, aggregate-only snapshot. No laptop service, new storage upload, gateway
route, or production data change is required. `/api/hex-map/meta` serves the
snapshot separately from the client bundle with an ETag and public cache headers.

Implemented: 1,730 cells and 24 country labels, snapshot activity brightness,
default coverage view and counts (a visible jump from zero to one archive, then a saturating count scale; uploader cells use vivid country colours with saturation from 50% for one uploader toward 95% for more at fixed lightness, while selection preserves other cells’ brightness), largest coverage gaps, cell/country selection,
shift-click multi-selection, keyboard selection and Escape, drag-to-pan, pointer-anchored scroll-to-zoom (1–6×), reset,
searchable neighbourhood terms, Digest/Strands tabs (top six consent-checked strands by rating), and compact
existing audience actions. Homepage search now appears to guests too. The
below-fold portal, upload section, community apps and testimonials are preserved.
Mobile shows the map before the stories and details; labels hide on small screens.

The source snapshot ends with the week of July 27, 2026. That date is visible;
activity and coverage are historical observations, not current membership.
Representative accounts and rotating people pins are deliberately deferred until
there is a current consent-checked serving path. No account IDs, representative
handles, avatar URLs or tweet payloads are copied into the snapshot. Digest
previews reuse the existing published-edition loader and do not expose drafts.
`DIGEST_MOCK_DATA=true` uses the existing explicitly marked preview fixture locally.

Still pending from the proposal: consent-checked people pins and Street View
feeds, story/strand map resolution and hover highlights, search heat maps, time
playback, shareable map state, and mobile bottom sheets. Story cards are real
links; this iteration does not imply that they have been located on the map.

## Rebuilding

Copy inputs from the spread explorer; do not edit its concurrent worktree.
The source is `TheExGenesis/stlm-1`, branch `feat/spread-explorer`,
`spread-explorer/data/{meta,regions}.json` (the original proposal records the
local paths). Geometry and adjacency-based colour assignment follow its
`static/app.js`. Build with a **new version** whenever the inputs change:

```sh
python3 scripts/build-hex-map-snapshot.py /path/to/spread-explorer/data --version spread-YYYY-MM-vN
```

The builder uses field allow-lists and reduces weekly history to one relative
activity value per cell. The resulting `src/lib/hexMap/snapshot.json` is ~73 KB
gzipped. Review the diff before committing. Snapshot refreshes remain manual;
versioned object storage and the gateway endpoints are later phases.

## Focused verification

```sh
pnpm type-check
pnpm exec next lint --file src/components/home/hero/HexMap.tsx --file src/components/home/hero/StoryColumn.tsx --file src/components/home/ClassicHomepage.tsx --file src/components/HeroCTAButtons.tsx --file src/app/api/hex-map/meta/route.ts --file src/app/page.tsx
pnpm test -- --runInBand --runTestsByPath src/components/home/hero/HexMap.test.tsx src/components/home/ClassicHomepage.test.tsx src/lib/hexMap/types.test.ts
```
