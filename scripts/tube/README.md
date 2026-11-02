# CA Tube data

`/tube` reads one static file, `public/tube/videos.json`: every YouTube video
linked from archived tweets by at least two distinct accounts, with titles from
YouTube oEmbed and the 12 most similar videos by overlap of sharing accounts.

Regenerate it in a scratch directory (these are read-only production reads):

1. `rows.sql` → `rows.json`: one row per (tweet, video id) with account, time,
   likes and reply flag. Run it read-only, e.g. through the Supabase Management
   API query endpoint with `read_only: true` (~2 minutes, ~110k rows).
2. `select account_id a, username u, account_display_name n from public.all_account;` → `accts.json`.
3. `python3 -I fetch-oembed.py` (run from the scratch directory) → `meta.json`.
   Deleted and private videos come back empty and are dropped.
4. `python3 -I scripts/tube/build-tube-data.py <scratch dir> public/tube/videos.json`.
