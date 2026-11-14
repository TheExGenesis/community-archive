# Spread explorer

`/spread-explorer` shows how any word spreads over the TPOT hex map:
1,730 hexes of socially close accounts (Community Archive members and their
mutual 1-hop ties), coloured by how much more or less a word is used in each
hex than on average, month by month from 2022 to mid-2026. It is the
real-usage half of the STLM spread explorer; the model map, posts and account
lists of that local tool are not part of this page.

It is unlisted: anyone with the link can open it, signed in or not, but the
Tools menu lists it only for admins (`requiresAdmin` in
`src/lib/navigation.ts`) and it is `noindex`. `/admin/spread-explorer`, its
first address, redirects to it. The page is dark only:
`src/providers/ThemeProvider.tsx` forces the dark theme on this path, so the
site header and footer follow, and the theme toggle is hidden there.

The data names real accounts (central accounts per hex, handles for "Find
accounts"), most of them not members, and it is a fixed export: an opt-out
made after the export date is not reflected until a new export is uploaded.
The files stay in a private bucket and are never placed under `public/` or
committed.

Before anything is typed, the word box suggests the local explorer's curated
words by group (`src/lib/spreadExplorer/suggestions.ts`, from its
`word_groups.json`: single tokens that are in the vocabulary, without slurs).
Typing filters the whole vocabulary.

## Data

The page reads a static export, not a database:

| File                 | Content                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta.json`          | hex positions and sizes, accounts and archived accounts per hex, central accounts, months, tweets per hex per month, the 38 regions with labels and colours, caveats |
| `vocab.json`         | the 30,000 most used tokens since 2024, for suggestions                                                                                                              |
| `handles.json.gz`    | handle -> hex and position, for the anchors box                                                                                                                      |
| `words/NNNN.json.gz` | uses per token per hex per month, 4,096 shards by `CRC32(token) % 4096`                                                                                              |

`scripts/build-spread-explorer-data.py` writes it from the STLM workspace's
local ClickHouse (`xyra.tpothex_word` and friends) and the explorer's data
files. Any typed word costs one shard read (about 180 KB gzipped); shards are
cached in memory per server instance. Tokens are whole words after removing
URLs and @mentions; one word at a time. The whole export is about 750 MB.

Where the server reads it from:

- `SPREAD_EXPLORER_DATA_DIR`: a local copy, for development.
- Otherwise the private Supabase Storage bucket `SPREAD_EXPLORER_BUCKET`
  (default `spread-explorer`), read with the service role.
  `scripts/upload-spread-explorer-data.ts` uploads an export there.

## API

`GET /api/spread-explorer/{meta|vocab|word?w=|anchors?handles=}`, no session
needed. Successful answers carry
`Cache-Control: public, max-age=300, s-maxage=86400, stale-while-revalidate=604800`,
so the edge serves repeats without invoking the function or reading Storage.
After uploading a new export, expect up to a day before every cached answer
is replaced (or purge the CDN cache for `/api/spread-explorer/*`).

## Local development

```sh
SPREAD_EXPLORER_DATA_DIR=/path/to/export pnpm dev
```

Open `http://localhost:3000/spread-explorer#w=vibecoding`.
