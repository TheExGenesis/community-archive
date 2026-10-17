# Explicit opt-out tombstones and digest_runs declarative drift

_2026-10-17 02:33 PDT_

## Summary

- **Privacy bug.** An explicit opt-out written to `public.optin` recorded the
  scrape block but did not tombstone the account's existing content. The
  self-serve opt-out (`src/app/api/opt-in/route.ts`) writes only `optin`, so
  every self-serve opt-out since at least 2026-08-17 left that user's existing
  content live. Ingestion boundaries still refused new writes. The admin
  opt-out was unaffected because it also inserts an `admin` block directly.
- **Schema drift.** `supabase/schemas/020_tables.sql` and `030_indexes.sql`
  lagged the applied `digest_runs` history, so `supabase db diff` failed while
  seeding `030_indexes.sql` (`parent_run_id` does not exist, 42703).

## Cause of the opt-out bug

`apply_policy_block_tombstone` returned early when `pg_trigger_depth() > 1`.
The opt-out path is:

`optin` INSERT/UPDATE → `propagate_explicit_optout_scrape_block` (depth 1) →
INSERT `tes.blocked_scraping_users` → `apply_policy_block_tombstone` (depth 2)

so the guard skipped the tombstone. The guard existed for the per-row
`enforce_policy_account_tombstone` trigger, which wrote the block row after
scrubbing the account itself. #765 (2026-08-17) dropped that trigger and added
the `policy_tombstones` test for this path, but kept the guard. The test has
failed since then.

## Fix

Migration `20261017163247_tombstone_trigger_originated_policy_blocks.sql` and
the matching body in `075_policy_enforcement.sql` replace the depth guard. The
trigger now sets a transaction-local marker,
`community_archive.policy_tombstone_account_id`, around
`tombstone_policy_account`. It skips only when the marker equals
`NEW.account_id`. That case is the self-recursion caused by
`tombstone_policy_account` backfilling the block row's username. The trigger
restores the marker afterward, so it can re-block the same account later in
the same transaction.

`policy_tombstones.test.sql` gains two tests for the self-serve UPDATE path: an
existing consent row flipped to opted-out, re-blocking an account that was
already tombstoned in the same transaction.

## Digest drift fix

The following come from migrations 20260814165156, 20260814180703 and
20260814182657:

- `020_tables.sql` now declares `digest_runs.workflow_run_id`, `parent_run_id`
  (self-FK) and `revision_instruction`, plus the two revision checks.
- `030_indexes.sql` now declares `digest_runs_workflow_run_id_key`,
  `digest_runs_parent_run_idx` and `digest_editions_source_run_idx`.
- The digest table and column comments were added.
- `digest_editions.view_count` now follows `updated_at`, matching the physical
  column order that the migrations produce.

## Verification

All verification ran on a disposable local stack with its own `project_id` and
ports, never the shared `canonball` stack.

- Before the fix, the updated policy test failed 3/18: the original explicit
  opt-out test and both new UPDATE-path tests. After the fix it passes 18/18.
  The full `supabase test db` suite passes after a clean `db reset`.
- Recursion probe, run as a superuser with `track_functions = 'pl'`, on a block
  whose username `tombstone_policy_account` had to backfill: the trigger fired
  twice and `tombstone_policy_account` ran once. The marker was empty
  afterward.
- `pg_get_functiondef(apply_policy_block_tombstone)` is identical between the
  migration-built database and a replay of the declarative files.
- `pg_dump --schema-only -t 'public.digest*'` is identical between the
  migration-built database and the declarative replay.

## Production follow-up

Production migration is manual. After applying the migration, find the
accounts the bug left live. This query is read-only:

```sql
SELECT b.account_id,
       b.username,
       b.updated_at AS block_updated_at,
       a.is_tombstone AS account_tombstoned,
       (SELECT count(*) FROM public.tweets AS t
        WHERE t.account_id = b.account_id AND t.is_tombstone IS NOT TRUE) AS live_tweets
FROM tes.blocked_scraping_users AS b
LEFT JOIN public.all_account AS a ON a.account_id = b.account_id
WHERE b.block_source = 'explicit_optout'
  AND (a.is_tombstone IS FALSE
       OR EXISTS (SELECT 1 FROM public.tweets AS t
                  WHERE t.account_id = b.account_id AND t.is_tombstone IS NOT TRUE))
ORDER BY b.updated_at;
```

For each returned account, run `SELECT public.tombstone_policy_account('<id>')`
as `service_role` or `postgres`. Alternatively, use the operator in
`docs/policy-tombstone-rollout.md` (`pnpm policy:reconcile-history
--verify-only`, then an execute run). Since #1104, `tombstone_policy_account`
also enqueues the ClickHouse likes/follows purge. Check whether the ClickHouse
tweet and account projections for those accounts also need a rebuild.

## Interaction with #1110

#1110 (`claude/eloquent-payne-e407bb`) also aligns the declarative files to
the migration history. Its `digest_*` hunks in `020_tables.sql` and
`030_indexes.sql` are byte-identical to this change, so either side resolves
them. In `075_policy_enforcement.sql`, #1110 restores the old
`pg_trigger_depth()` body of `apply_policy_block_tombstone` to match the
migration history at that time. This change's side must win there, because
migration 20261017163247 replaces that body.
