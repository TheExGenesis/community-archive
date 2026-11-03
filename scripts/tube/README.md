# CA Tube data

`/tube` reads static files from `public/tube/`:

- `videos.json`: the catalogue. Every YouTube video linked from archived tweets
  by at least two distinct accounts, with titles from YouTube oEmbed, the 12
  most similar videos by overlap of sharing accounts, and LLM categories once
  `enrich.py` has run.
- `c/<shard>.json`: per-video summary and the archived tweets that shared it,
  loaded on the watch page. The shard function is mirrored in `src/lib/tube.ts`.
- `playlists.json`: curated playlists (when present) plus lists derived from
  the numbers.

Regenerate in a scratch directory (these are read-only production reads):

1. `rows.sql` → `rows.json`: one row per (tweet, video id) with account, time,
   likes and reply flag. Run it read-only, e.g. through the Supabase Management
   API query endpoint with `read_only: true` (~2 minutes, ~110k rows).
2. `select account_id a, username u, account_display_name n from public.all_account;` → `accts.json`.
3. `select account_id a, avatar_media_url p from public.all_profile where avatar_media_url is not null;` → `av.json`.
4. `select tweet_id t, full_text x, reply_to_username ru, is_tombstone z from public.tweets where tweet_id = any(array[...])`
   for the tweet ids in `rows.json`, in chunks of ~8,000 → `texts0.json`, `texts1.json`, ...
5. Parents of reply comments: `select tweet_id t, reply_to_tweet_id rt` for the
   comment tweet ids → `replyids.json`; then for those, join
   `public.tweets c` to `public.tweets p on p.tweet_id = c.reply_to_tweet_id`
   (skipping tombstones) → `parents.json` with `t, pt, pa, px, pf, pc`.
6. `python3 -I fetch-oembed.py` (run from the scratch directory) → `meta.json`.
   Deleted and private videos come back empty and are dropped.
7. Optional: `python3 -I scripts/tube/enrich.py <scratch dir> public/tube/videos.json`
   runs batched `claude -p` calls (needs a logged-in Claude Code CLI) and writes
   `enrich/*.json`. It is resumable.
8. `python3 -I scripts/tube/build-tube-data.py <scratch dir> public/tube`.
9. Optional, after an enriched build: `python3 -I scripts/tube/curate.py <scratch dir> public/tube`
   merges subcategories (`submap.json`) and has Claude curate playlists
   (`playlists.json`); then run step 8 again.
