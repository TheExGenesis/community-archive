# Admin delete-with-export Hetzner worker

The "Opt out and delete data" action runs **inline from Vercel** today.
That works for small accounts but times out around the 100k-tweet mark
even with the parallelized export. For genuinely large accounts the
right home for the work is a long-running process on the
community-archive Hetzner machine.

This doc is the architectural plan + observability story for that worker.

> **Implementation lives in [`services/admin-delete-worker/`](../services/admin-delete-worker/)**.
> The worker's own README has deploy commands, observability queries,
> and a TODO list. This file is the conceptual + contract spec; the
> service README is the operational manual.

## What the worker does

For each `admin_delete_with_export` job in `private.job_queue`:

1. **Claim** the job (atomic UPDATE from `QUEUED` → `PROCESSING`,
   matching on the old status so two workers can't grab the same row).
2. **Export archive files**: copy every object under
   `archives/{username}/` to
   `admin-deleted-user-data/{enqueued_at_iso}-{account_id}/archives/`
   via the Supabase storage `copy` API (server-side, no
   download/re-upload). Parallelize across files.
3. **Dump per-account DB rows** as newline-delimited JSON files into
   the same destination prefix. One file per table — `tweets.ndjson`,
   `likes.ndjson`, `followers.ndjson`, `following.ndjson`,
   `all_account.json`, `all_profile.json`, `archive_upload.ndjson`,
   `user_action_log.ndjson`, plus per-tweet-id-scoped
   `tweet_media.ndjson`, `tweet_urls.ndjson`, `user_mentions.ndjson`.
   NDJSON instead of JSON so we can stream without buffering huge
   arrays.
4. **Write `manifest.json`** with metadata + row counts + phase
   timings.
5. **Call `public.delete_user_archive(account_id)`** over the
   service-role connection.
6. **Delete the original `archives/{username}/` files** from storage
   (the DB function doesn't touch storage).
7. **Mark `DONE`** with completion timestamp in `args`.

On any error in steps 2–7: set `status='FAILED'`, write
`args.error = '<msg>'`, leave any partial export output in place for
forensics. Do **not** modify `public.optin` — the Vercel action already
set `explicit_optout=true` synchronously, and we want that to stand
even if the worker fails.

## Architecture

```
┌─ Vercel (server action) ───────────────────────┐
│ adminOptOutAccount(delete_data=true)           │
│   1. UPDATE optin SET explicit_optout=true     │
│   2. admin_set_scrape_block(account_id, true)  │
│   3. admin_enqueue_delete_with_export(...)     │  ← inserts QUEUED row
│   ↳ returns "queued" message to admin          │
└─────────────────────┬──────────────────────────┘
                      │
              private.job_queue
                      │
┌─ Hetzner worker (long-running process) ────────┘
│ - polls every N seconds (or LISTEN/NOTIFY)
│ - processes one job at a time (concurrency = 1)
│ - claims atomically
│ - runs export + delete
│ - emits logs to stdout + writes per-job log file
│   to admin-deleted-user-data/<prefix>/worker.log
└─────────────────────────────────────────────────┘
```

### Why polling, not LISTEN/NOTIFY, in v1

LISTEN/NOTIFY is more efficient but requires a persistent connection
that survives Hetzner reboots and Postgres restarts. Polling every
5–10 seconds is simpler, costs ~1 query/s/instance, and lets us write
the worker stateless. If polling load ever matters we can switch
later.

### Why concurrency = 1

The destructive operations are heavy on the DB (cascading deletes
touch every per-account table + indexes). One job at a time keeps the
DB load predictable and means we never delete two accounts in
parallel — easier reasoning about failure modes. Throughput limit:
maybe one large delete per minute. That's fine: admin clicks are
rare.

### Process model

Two reasonable options on Hetzner:

| Option | Pros | Cons |
|--------|------|------|
| **systemd service** that runs `node worker.js` | Auto-restart on crash, simple journald logs, no Docker overhead | Couples to the host's Node version |
| **Docker container** running the worker | Reproducible, isolated, matches existing `services/process_archive` pattern | Need Docker on the host |

Recommendation: follow the existing `services/process_archive`
pattern (Docker container). Same Hetzner host, same operational
muscle memory.

## Code layout

Suggested new location: `services/admin_delete_worker/`. Mirrors
`services/process_archive/`.

```
services/admin_delete_worker/
├── Dockerfile
├── package.json
├── tsconfig.json
├── README.md            ← run instructions, env var list
├── src/
│   ├── index.ts         ← main loop: poll, claim, dispatch
│   ├── claim.ts         ← atomic UPDATE QUEUED → PROCESSING
│   ├── export.ts        ← steps 2–4: archive copy + DB dumps + manifest
│   ├── deleteArchive.ts ← step 5–6: RPC + storage cleanup
│   ├── logger.ts        ← structured logging
│   └── supabase.ts      ← service-role client factory
└── docker-compose.yml   ← for local dev
```

### Required env vars

| Var | Notes |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Same as the app uses. |
| `SUPABASE_SERVICE_ROLE`    | Worker bypasses RLS via this — keep secret. |
| `POLL_INTERVAL_MS`         | Default 5000. Lower for staging if you're impatient. |
| `LOG_LEVEL`                | `info` / `debug`. Default `info`. |
| `SENTRY_DSN`               | Optional, see Observability. |

## Claim semantics (the only tricky concurrency bit)

Use a single UPDATE with `RETURNING`:

```sql
UPDATE private.job_queue
   SET status = 'PROCESSING',
       args   = args || jsonb_build_object('claimed_at', now())
 WHERE key = (
   SELECT key FROM private.job_queue
    WHERE job_name = 'admin_delete_with_export'
      AND status   = 'QUEUED'
    ORDER BY "timestamp"
    LIMIT 1
    FOR UPDATE SKIP LOCKED
 )
 RETURNING *;
```

`FOR UPDATE SKIP LOCKED` means if two workers run simultaneously,
each grabs a different row (or no row) — no race. Without it, both
would try to claim the same head-of-queue row.

If you want to keep concurrency = 1 strictly, you can also rely on
the worker being a single Docker container — but the SKIP LOCKED
pattern is cheap insurance.

## Observability

The whole point: when something goes wrong on a destructive operation,
the admin needs to be able to figure out what happened without SSHing
into the worker host.

### What gets logged where

| Where | What | Retention |
|-------|------|-----------|
| **stdout (Docker logs)** | Structured JSON, one line per event. Goes to journald or Docker log driver on Hetzner. | Whatever the host's log rotation does (~30d default). |
| **`admin-deleted-user-data/<prefix>/worker.log`** | The same structured log, but specific to that job, uploaded at the end of processing (success OR failure). | Forever (until admin manually clears the bucket). |
| **`manifest.json`** | Summary: who/when/what counts, phase timings, final status. Per-job, alongside `worker.log`. | Forever. |
| **`private.job_queue.args`** | Status transitions + final error message (truncated to ~1KB) for `gh / SQL editor` triage. | Until the row is purged. |
| **Sentry (optional)** | Worker crashes + per-job exceptions, with the job's `key` as the tag for grouping. | Whatever Sentry retention is. |

### Per-job log file format

NDJSON, one event per line:

```jsonl
{"t":"2026-05-22T01:23:45.001Z","level":"info","event":"claimed","key":"...","account_id":"123","username":"foo"}
{"t":"2026-05-22T01:23:45.123Z","level":"info","event":"phase_start","phase":"archives_copy"}
{"t":"2026-05-22T01:23:46.789Z","level":"info","event":"phase_end","phase":"archives_copy","files":3,"ms":1666}
{"t":"2026-05-22T01:23:46.790Z","level":"info","event":"phase_start","phase":"dump_tweets"}
{"t":"2026-05-22T01:24:12.345Z","level":"info","event":"phase_end","phase":"dump_tweets","rows":104231,"ms":25555}
{"t":"2026-05-22T01:24:12.346Z","level":"info","event":"phase_start","phase":"delete_user_archive"}
{"t":"2026-05-22T01:24:38.001Z","level":"info","event":"phase_end","phase":"delete_user_archive","ms":25655}
{"t":"2026-05-22T01:24:38.500Z","level":"info","event":"phase_start","phase":"delete_storage"}
{"t":"2026-05-22T01:24:38.812Z","level":"info","event":"phase_end","phase":"delete_storage","files":3,"ms":312}
{"t":"2026-05-22T01:24:38.813Z","level":"info","event":"done","total_ms":53812}
```

Failure example:

```jsonl
{"t":"...","level":"info","event":"claimed","key":"...","account_id":"123"}
{"t":"...","level":"info","event":"phase_start","phase":"dump_tweets"}
{"t":"...","level":"error","event":"phase_failed","phase":"dump_tweets","err":"connection reset","stack":"..."}
{"t":"...","level":"info","event":"marked_failed","key":"..."}
```

The worker uploads this file under
`admin-deleted-user-data/<export_prefix>/worker.log` (best-effort —
if the upload itself fails, the stdout copy is the fallback). The
stdout copy is what shows up in `docker logs` on Hetzner so you can
tail it in real time.

### Manifest fields

```json
{
  "key": "<job uuid>",
  "account_id": "...",
  "username": "...",
  "reason": "...",
  "requested_by_user_id": "...",
  "enqueued_at": "...",
  "claimed_at":  "...",
  "completed_at": "...",
  "final_status": "DONE" | "FAILED",
  "archive_files_copied": 3,
  "row_counts": {
    "tweets": 104231,
    "likes":  98712,
    "followers": 8412,
    "following": 1203,
    "tweet_media": 12455,
    "tweet_urls":  31201,
    "user_mentions": 27812,
    "archive_upload": 4,
    "user_action_log": 18,
    "all_account":  1,
    "all_profile":  1
  },
  "phase_ms": {
    "archives_copy":        1666,
    "dump_tweets":         25555,
    "dump_likes":           4231,
    "dump_followers":        612,
    "dump_following":         92,
    "dump_other_tables":    1841,
    "manifest_upload":      120,
    "delete_user_archive": 25655,
    "delete_storage":        312,
    "worker_log_upload":     180
  },
  "error": null | "<msg>"
}
```

### How an admin debugs a failed job

1. **Admin UI** (future): a "Recent delete jobs" section on `/admin`
   that shows the last N rows from `private.job_queue WHERE job_name
   = 'admin_delete_with_export'`. Each row links to its export
   prefix in the bucket.
2. **Browse `admin-deleted-user-data/<prefix>/`**:
   - `worker.log` — full per-job log
   - `manifest.json` — summary + counts + phase timings
   - `archives/` — what got copied before the failure
   - `*.ndjson` — partial dumps if export got partway through
3. **`gh` or SQL editor**: `SELECT key, status, args FROM
   private.job_queue WHERE job_name='admin_delete_with_export'
   ORDER BY timestamp DESC LIMIT 20`.

### Health endpoint

The worker exposes `GET /healthz` on a configurable port (default
8080). Returns 200 + `{"status":"ok","queue_depth":N,
"last_completed_at":"..."}`. Hetzner-side: hook this into your
monitoring (`watchtower`, uptime checks, whatever).

### Stuck-job detection

If a worker dies mid-job, the row stays `PROCESSING` forever and
nothing else picks it up. Mitigation: on startup, the worker scans
for rows where `status='PROCESSING' AND
args->>'claimed_at' < now() - interval '15 minutes'` and reverts
them to `QUEUED` (with `args.recovered_from_zombie = true` for
audit). 15 min is comfortably longer than any sane single job.

## Error handling and idempotency

The export → delete flow is *not* a single atomic transaction. If
the worker crashes mid-way the next run needs to pick up where it
left off OR safely redo work. Idempotency rules:

- **Archive copy**: each storage `copy` is idempotent if we use
  `upsert: false` on the destination AND skip files that already
  exist in the export prefix. So a crashed export can be re-run
  against the same prefix without duplicating storage cost.
- **NDJSON dumps**: re-running overwrites; that's fine.
- **`delete_user_archive`**: idempotent — re-calling against an
  already-deleted account is a no-op (zero rows match).
- **Storage delete**: `storage.remove` on a non-existent file
  returns success.

So a crashed job, after the zombie-detection reverts it to QUEUED,
gets re-run from the top and completes. Worst case: some duplicated
work, no incorrect state.

## Migration path

This worker plan is the long-term home; PR #350 (the inline-from-
Vercel export) is the short-term scaffold. Migration steps once the
worker is live:

1. **Worker side**: build, deploy, smoke-test against the staging
   `bulky_test` (5k tweets — verifies the happy path) then
   `giant_test` (100k tweets — verifies the path Vercel can't do).
2. **Vercel side**: change `adminOptOutAccount` so the
   `delete_data=true` branch:
   - Still updates `public.optin.explicit_optout` synchronously
   - Still calls `admin_set_scrape_block` synchronously
   - **No longer** runs `exportUserDataInline` inline
   - **No longer** calls `delete_user_archive` inline
   - Instead calls a new `admin_enqueue_delete_with_export(...)`
     RPC (defined in the earlier version of PR #350's migration —
     see the doc that exists in git history under the original
     queue-based design)
3. **UI**: success message changes from "exported + deleted" to
   "queued — worker will complete in a few minutes" (the wording
   the original queue design used).

Both the inline and queue versions can co-exist briefly with a
boolean env var (`USE_DELETE_WORKER=true`) so we can flip back if
the worker has issues. After a week of clean worker runs in prod,
delete the inline path.

## Open questions to resolve before building

1. **Where does the worker run?** A new Docker container on the
   existing Hetzner host, or a new VM? Existing host is fine if it
   has spare resources.
2. **Sentry?** Or just stdout + journald? Stdout is enough for v1.
3. **Worker repo location?** This repo (`services/admin_delete_worker/`)
   or a separate one? Same repo is simpler — types and migrations
   stay in sync.
4. **Retry policy?** v1: no automatic retry, admin re-clicks. v2:
   maybe exponential backoff for transient failures (timeouts,
   network blips) but not for logical errors (account not found).
5. **`admin-deleted-user-data` bucket lifecycle?** Currently no
   auto-deletion. Decide later (audit retention vs storage cost).
