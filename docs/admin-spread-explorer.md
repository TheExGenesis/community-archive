# Admin spread explorer

`/admin/spread-explorer` shows how any word spreads over the TPOT hex map:
1,730 hexes of socially close accounts (Community Archive members and their
mutual 1-hop ties), coloured by how much more or less a word is used in each
hex than on average, month by month from 2022 to mid-2026. It is the
real-usage half of the STLM spread explorer; the model map, posts and account
lists of that local tool are not part of this page.

It is private: the page and its API use the same identity gate as `/admin`
(`requireAdmin` / `checkIsAdmin` in `src/app/admin/data.ts`). Anyone else gets
the same 404 as for a page that does not exist. The data names real accounts
(central accounts per hex, handles for anchors), so it is never placed under
`public/` or committed.

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

`GET /api/admin/spread-explorer/{meta|vocab|word?w=|anchors?handles=}`,
admin session required, `Cache-Control: private, no-store`.

## Local development

```sh
supabase start
SPREAD_EXPLORER_DATA_DIR=/path/to/export ENABLE_STAGING_DEV_LOGIN=true pnpm dev
```

Sign in through `/login` with the staging dev login as `xiq_dev` (the staging
admin allowlist in `src/app/admin/data.ts`), then open
`http://localhost:3000/admin/spread-explorer#w=vibecoding`.
