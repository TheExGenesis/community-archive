# admin-delete-worker

Long-running worker that consumes `private.admin_jobs` rows with
`job_name = 'admin_delete_with_export'`. Exports the affected
account's data to the `admin-deleted-user-data` storage bucket and
then calls `public.delete_user_archive` to wipe the account. Designed
to run on a Hetzner box (NOT on Vercel — accounts with >10k tweets
exceed Vercel's serverless function ceiling and several phases need
multi-minute headroom).

> **Contract reference:** [`docs/admin-delete-worker.md`](../../docs/admin-delete-worker.md)
> describes what the worker MUST do and explicitly enumerates the
> queue row shape, status transitions, and the steps in order. This
> directory is the implementation of that contract.

## Source-of-truth code paths

| Concern | File |
| --- | --- |
| Polling loop, claim, status transitions | [`src/index.ts`](src/index.ts) |
| Export + delete pipeline (storage copy, table dumps, manifest, `delete_user_archive`) | [`src/exporter.ts`](src/exporter.ts) |
| `private.worker_runs` insert/update | [`src/runRecorder.ts`](src/runRecorder.ts) |
| Structured pino logger setup | [`src/logger.ts`](src/logger.ts) |
| Container image | [`Dockerfile`](Dockerfile) |
| Compose unit | [`docker-compose.yml`](docker-compose.yml) |
| Environment template | [`env.example`](env.example) |
| Worker-runs table | [`supabase/migrations/20260522183832_add_worker_runs.sql`](../../supabase/migrations/20260522183832_add_worker_runs.sql) |

## Deploy

Current placement: **`ca-autorefresh` (95.217.12.23)**, container name
`admin-delete-worker`. See `AGENTS.md` → "Hetzner inventory & worker
placement" for why this box and not `prod-vector-store`.

On the Hetzner box, first time:

```bash
git clone https://github.com/TheExGenesis/community-archive.git
cd community-archive/services/admin-delete-worker
cp env.example .env
# Fill in DATABASE_URL (prod), SUPABASE_URL, SUPABASE_SERVICE_ROLE.
# IMPORTANT: on Hetzner you MUST use the IPv4 pooler URL, not the direct
# `db.<ref>.supabase.co` host (which is IPv6-only and unreachable from
# ca-autorefresh). See env.example for the format.

docker compose up -d --build
```

Subsequent deploys (pull new code, rebuild, restart):

```bash
cd community-archive
git pull
cd services/admin-delete-worker
docker compose up -d --build
# Old container is replaced gracefully (compose sends SIGTERM, worker
# finishes any in-flight job, exits, new container starts).
```

Gotcha: `docker compose restart` does NOT reload `.env`. If you change
environment variables, you need `docker compose down && docker compose up -d`
(or `up -d --force-recreate`).

## Observability

Three places to look, in order from "I want a quick status" to "I want
the full trace":

### 1. Postgres — the canonical record of what ran

```sql
-- 10 most recent jobs, with timing and status.
SELECT
  started_at,
  status,
  duration_ms,
  args->>'username'   AS username,
  args->>'account_id' AS account_id,
  result->'phase_ms'  AS phase_ms,
  error
FROM private.worker_runs
WHERE worker_name = 'admin_delete_with_export'
ORDER BY started_at DESC
LIMIT 10;

-- Jobs that failed.
SELECT started_at, args->>'username' AS username, error
FROM private.worker_runs
WHERE worker_name = 'admin_delete_with_export'
  AND status = 'failed'
ORDER BY started_at DESC;

-- Did we miss a heartbeat? If the worker has been alive but no jobs
-- queued, you won't see new rows here — that's fine. To verify the
-- worker is reachable when idle, restart it and look for the
-- "worker started" log line in journalctl/docker logs (see §2).
SELECT MAX(started_at) FROM private.worker_runs
WHERE worker_name = 'admin_delete_with_export';

-- Pending + processing jobs (queue side).
SELECT key, status, created_at, args
FROM private.admin_jobs
WHERE job_name = 'admin_delete_with_export'
  AND status IN ('QUEUED', 'PROCESSING')
ORDER BY created_at;

-- Manually re-queue a FAILED job (rare; investigate first).
-- UPDATE private.admin_jobs SET status = 'QUEUED', updated_at = now()
--  WHERE key = '<uuid>';
```

Run any of these from Supabase Studio's SQL editor (prod project →
SQL). `private` is not exposed via PostgREST, so the API can't see
it — only direct DB access can.

### 2. Container logs — what the worker said while it was running

The worker emits one-JSON-per-line via [pino](https://github.com/pinojs/pino).
Every log line has stable fields: `worker`, `host`, `level`, `time`,
plus per-event context (`job_key`, `account_id`, `phase`, `ms`,
`err`, etc.).

```bash
# On the Hetzner box:
docker compose logs -f admin-delete-worker

# Filter to a specific job:
docker compose logs admin-delete-worker | jq 'select(.job_key == "<uuid>")'

# Per-phase timings of the most recent job:
docker compose logs --tail=200 admin-delete-worker \
  | jq 'select(.msg | test("phase: ")) | {ms, msg, table}'
```

If you ship logs to Loki / Axiom / Better Stack later, all the
structured fields above are queryable — no parsing needed.

### 3. Manifest in the export bucket — what got dumped

Every successful job writes
`admin-deleted-user-data/<timestamp>-<account_id>/manifest.json` last.
Its presence means the entire export succeeded; its absence means
the export aborted partway. Open the bucket in Supabase Studio →
Storage to browse.

## Local development

```bash
cd services/admin-delete-worker
npm install
cp env.example .env  # point at staging for local dev
npm run dev          # tsx --watch
```

Trigger a test job by clicking "Opt out and delete data" in
`/admin` on staging (signed in as `xiq_dev`). The worker should
claim it within `POLL_INTERVAL_MS` (default 10s) and you should see
the run materialize in `private.worker_runs` and the export folder
appear in the `admin-deleted-user-data` bucket.

## Known limitations / TODO

- **Single replica.** The claim query uses `FOR UPDATE SKIP LOCKED`
  so additional replicas would be safe in principle, but
  `docker-compose.yml` runs exactly one container. Scale only if
  throughput becomes a problem.
- **No retry on failure.** A job marked `FAILED` stays `FAILED`.
  Re-running is manual: `UPDATE private.admin_jobs SET status='QUEUED',
  updated_at = now() WHERE key = '<uuid>'`. Worth adding bounded
  retries if failures become routine.
- **No alerting.** A failed job leaves a row in `private.worker_runs`
  with `status='failed'` and an error message, but nothing pages
  you. Wire whichever alerting you'd add to staging/prod monitoring
  here.
- **No metrics export.** If you want Prometheus/Grafana, add a
  `prom-client` registry that scrapes `private.worker_runs` and a
  small `/metrics` HTTP endpoint. Out of scope for the first cut.
- **Per-account-only tables.** The exporter currently dumps tables
  keyed on `account_id` plus three tweet-keyed tables
  (`tweet_media`, `tweet_urls`, `user_mentions`). If other per-account
  data appears in the schema (e.g. a new `conversations` filter,
  `mentioned_users` for accounts the deleted user mentioned), add it
  to `PER_ACCOUNT_TABLES` in `src/exporter.ts`.
