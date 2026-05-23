# Tables the admin-delete-worker touches

This doc is the operational map of the worker's database surface. Every
table the worker reads, writes, or deletes from is listed here with
purpose, schema, indexes, and the canned forensics queries that ops
runs against it.

> Source of truth for the DDL: the migration files in
> `supabase/migrations/` (timestamp-prefixed). The numbered files in
> `supabase/schemas/` are the declarative mirror — they reflect the
> same state but are not what gets applied to the database.

## The two private tables the worker owns

### `private.admin_jobs` — the work queue

The Hetzner worker's input. Vercel writes here (via the
`public.admin_enqueue_delete_with_export(...)` RPC); the worker reads
and transitions rows through `QUEUED → PROCESSING → DONE | FAILED`.

| Column        | Type          | Notes |
| ------------- | ------------- | ----- |
| `key`         | `uuid`        | PK, default `gen_random_uuid()`. The job's identity for the worker's claim SQL and for `worker_runs.job_key`. |
| `job_name`    | `text`        | Today the only value is `'admin_delete_with_export'`. Future admin RPCs (resync, rebuild) would add new names here. |
| `status`      | `text`        | One of `QUEUED`, `PROCESSING`, `DONE`, `FAILED`. Check constraint enforces it. |
| `args`        | `jsonb`       | Job-specific payload. For admin_delete_with_export: `{account_id, username, reason, requested_by_user_id, enqueued_at}` at insert, augmented at DONE with `{completed_at, export_prefix}` (or at FAILED with `{failed_at, error}`). |
| `created_at`  | `timestamptz` | When the row was enqueued. Drives FIFO claim order. |
| `updated_at`  | `timestamptz` | Touched on each status transition. |

**Indexes:**
- `admin_jobs_pkey` — PK on `key`
- `idx_admin_jobs_claim` — partial `(job_name, created_at) WHERE status IN ('QUEUED', 'PROCESSING')` — drives the claim hot path
- `idx_admin_jobs_job_name_status` — `(job_name, status)` — drives forensics

**Grants:** `SELECT, INSERT, UPDATE` to `service_role` only. The worker
connects with the prod/staging `DATABASE_URL` (postgres role), the
Vercel server action calls in via the `public.admin_enqueue_delete_with_export`
SECURITY DEFINER RPC.

**Why a separate table from `private.job_queue`?** Because
`private.process_jobs()` runs every minute via `pg_cron` and would
silently mark any unknown `job_name` `DONE`. See the
[migration comment](../../supabase/migrations/20260523180000_add_admin_jobs.sql)
for the full rationale.

### `private.worker_runs` — the run log

One row per worker job *attempt*. Inserted at claim time with
`status='started'`, updated at completion with `status='succeeded'`
or `status='failed'`, the full `result` jsonb (phase timings, row
counts, export prefix), and `duration_ms`. This is the canonical
"what did the worker do, when, how long did each phase take?" record.

| Column         | Type          | Notes |
| -------------- | ------------- | ----- |
| `id`           | `bigserial`   | PK. |
| `worker_name`  | `text`        | Hardcoded to `'admin_delete_with_export'` today. |
| `job_key`      | `uuid`        | Soft reference to `private.admin_jobs.key`. Not a FK so the admin_jobs row can be archived without dropping run history. |
| `job_name`     | `text`        | Copied from the admin_jobs row at claim time. |
| `status`       | `text`        | `started`, `succeeded`, `failed`, or `skipped`. |
| `started_at`   | `timestamptz` | Set by `default now()` at insert. |
| `completed_at` | `timestamptz` | Set on finish (succeeded/failed). |
| `duration_ms`  | `integer`     | Computed in SQL at finish as `EXTRACT(EPOCH FROM (now() - started_at)) * 1000`. Monotonic with `started_at` even under host clock skew. |
| `args`         | `jsonb`       | Snapshot of `admin_jobs.args` at claim time (for forensics). |
| `result`       | `jsonb`       | Worker's structured return value. For admin_delete_with_export: `{export_prefix, archive_files_copied[], row_counts{}, phase_ms{}}`. |
| `error`        | `text`        | Top-level error message on failure. The stack trace goes to docker logs only. |
| `host`         | `text`        | Hostname of the worker container that ran this job. `os.hostname()` by default; overridden by `WORKER_HOST_LABEL` env. Used to distinguish staging vs prod replicas (`ca-autorefresh-staging` vs `ca-autorefresh-prod`). |

**Indexes:**
- `worker_runs_pkey` — PK
- `worker_runs_worker_name_started_at_idx` — `(worker_name, started_at DESC)` — "what ran in the last hour?"
- `worker_runs_job_key_idx` — `(job_key)` — "find the run for a specific admin_jobs row"
- `worker_runs_status_started_at_idx` — `(status, started_at DESC)` — "which jobs failed?"

**Grants:** owned by `postgres`, no explicit `GRANT`s. The worker writes
via the direct `DATABASE_URL` connection (postgres role); nothing else
should touch this table.

## Tables the worker *exports from and then deletes*

These are public-schema tables. The worker dumps each one's rows
(filtered to the target account) to JSON in the
`admin-deleted-user-data/<prefix>/` bucket *before* the destructive
delete, so there's always a recovery path.

Filter column noted below:

| Table | Filter | Dumped to |
| ----- | ------ | --------- |
| `public.tweets` | `account_id` | `tweets.json` |
| `public.likes` | `account_id` | `likes.json` |
| `public.followers` | `account_id` | `followers.json` |
| `public.following` | `account_id` | `following.json` |
| `public.all_account` | `account_id` | `all_account.json` |
| `public.all_profile` | `account_id` | `all_profile.json` |
| `public.archive_upload` | `account_id` | `archive_upload.json` |
| `public.user_action_log` | `account_id` | `user_action_log.json` |
| `public.tweet_media` | JOIN `tweets` on `tweet_id` | `tweet_media.json` |
| `public.tweet_urls` | JOIN `tweets` on `tweet_id` | `tweet_urls.json` |
| `public.user_mentions` | JOIN `tweets` on `tweet_id` | `user_mentions.json` |

After the exports land, the worker calls
`public.delete_user_archive(account_id)` — a SECURITY DEFINER function
with a 20-minute statement timeout that cascades through every
per-account table in the right FK order.

**`public.optin` is deliberately NOT exported or deleted.** The Vercel
action sets `explicit_optout=true` on the optin row *before* enqueuing
the worker job, and that row stays in place after the delete so the
user remains blocked from re-streaming even if the worker job fails
later.

## Storage buckets

| Bucket | Direction | Notes |
| ------ | --------- | ----- |
| `archives` | **read + delete** | Source of the user's uploaded archive zip(s). Worker copies every object under `archives/<username>/` into the export bucket (step 2), then deletes the source folder at the very end (step 7) once `delete_user_archive` succeeds. |
| `admin-deleted-user-data` | **write** | The forensic dump. One subfolder per job, named `<enqueued_at>-<account_id>/`. Contains the copied archive files under `archives/`, the 11 per-table JSON dumps, and `manifest.json` (written last so its presence means "everything before completed"). Private bucket, service-role only. |

## Tables Vercel still touches (not the worker)

For completeness, since these are part of the admin opt-out path:

| Table | Who writes | When |
| ----- | ---------- | ---- |
| `public.optin` | Vercel `adminOptOutAccount` | Synchronous, BEFORE enqueue. Sets `explicit_optout=true` so the user is blocked immediately. |
| `tes.blocked_scraping_users` | Vercel via `public.admin_set_scrape_block` | Synchronous, BEFORE enqueue. Adds the account to the scrape blocklist so the stream stops pulling new tweets. |

## Pointers for ops

- The canned forensics SQL lives in
  [`services/admin-delete-worker/README.md` → Observability](README.md#observability).
  This doc is the schema *map*; the README is the *queries*.
- For the architecture / contract description (what the worker MUST do
  and why), see [`docs/admin-delete-worker.md`](../../docs/admin-delete-worker.md).
- The job lifecycle (QUEUED → PROCESSING → DONE | FAILED) is implemented
  in [`src/index.ts`](src/index.ts); the export+delete pipeline in
  [`src/exporter.ts`](src/exporter.ts); the worker_runs writes in
  [`src/runRecorder.ts`](src/runRecorder.ts).
