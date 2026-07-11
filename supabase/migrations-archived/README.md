# Archived Migrations

These SQL files were originally parked in `supabase/migrations-pending-review/`
(March–May 2025) and never applied via the normal `supabase db push` flow. After
cross-referencing each one against `supabase/migrations/` (the canonical applied
history) and `supabase/schemas/` (the declarative source of truth), they were
determined to be either:

- **duplicates** of objects already created by `20250910105058_remote_schema.sql`
  (which captured the remote DB state and is the baseline for everything since), or
- **obsolete drafts** that target a database state which no longer matches reality
  (e.g. policies for tables that have since been refactored, or function bodies
  that have been superseded by newer versions in `supabase/schemas/070_functions.sql`).

In neither case is there anything safe to apply today, so they have been moved
out of the migrations pipeline to keep `supabase db push` clean while preserving
the historical record in git.

## Per-file disposition

| File | Disposition | Evidence |
|---|---|---|
| `20250307130643_stats.sql` | duplicate | `private.daily_pg_stat_statements` table + `private.snapshot_pg_stat_statements()` already created in `supabase/migrations/20250910105058_remote_schema.sql` (lines 1908, 6727). Function was later dropped intentionally in `20250912132817_verify_noop.sql:64`. |
| `20250307144041_views.sql` | obsolete | The `enriched_tweets` view it defines joins `profile`, but the current view in `supabase/schemas/040_views.sql:6` joins `all_profile` via lateral subquery — schema has diverged. Bundled `idx_conversations_tweet_id` index is trivial and would belong in a focused migration if still wanted. |
| `20250317220509_rls.sql` | duplicate | `public.apply_public_rls_policies(...)` already exists in `supabase/migrations/20250910105058_remote_schema.sql:3766` and is re-created in `20250912132817_verify_noop.sql:468`. The DO block applying it to tweets/likes/followers/following is a one-shot effect already in place. |
| `20250317225419_circle_quarantine.sql` | obsolete | Quarantine policies ("Quarantine tweets from Aug 2022 to Nov 2023") do not exist anywhere in the current schema or applied migrations — they were reverted in production. Re-applying would re-quarantine historical data. |
| `20250417150124_revert_circle_quarantine.sql` | obsolete | Revert of the above. With nothing to revert, this is a no-op at best, harmful at worst (it would `DROP POLICY IF EXISTS` and recreate "Allow archive access generally" which also doesn't exist in current state). |
| `20250523064434_update_delete_user.sql` | obsolete | The current `public.delete_user_archive` in `supabase/schemas/070_functions.sql` is strictly newer and more complete: it also deletes `ca_autorefresh.account_refresh_log` and handles orphan `tweet_media` rows. Applying the pending version would regress those fixes (see `supabase/migrations/20260318014031_fix_delete_archive_tweet_media_fk.sql`, `20260318160000_fix_delete_user_archive_account_refresh_log_fk.sql`, `20260318182000_fix_delete_user_archive_orphan_data.sql`). |

## Why keep them in git?

For audit. If anyone asks "what happened to those migrations?" the answer
lives here. Do not move them back into `supabase/migrations/` — they would
break a fresh database rebuild.
