-- private.worker_runs: one row per Hetzner-worker job attempt. Lets us
-- query "what did the worker do, when, and how long did each phase take?"
-- from Supabase Studio without needing to SSH into the box.
--
-- Schema is intentionally simple — workers append rows; nothing else
-- writes here. Indexes are tuned for the most common queries:
--   - "what ran in the last hour?"              → (worker_name, started_at DESC)
--   - "find the run for a specific admin_jobs row" → (job_key)
--   - "which jobs failed?"                      → (status, started_at DESC)
--
-- See services/admin-delete-worker/ for the writer and
-- docs/admin-delete-worker.md for the operational contract.

CREATE TABLE IF NOT EXISTS private.worker_runs (
  id              bigserial PRIMARY KEY,
  worker_name     text        NOT NULL,
  -- private.admin_jobs.key (UUID). Not a hard FK because old admin_jobs
  -- rows may get archived/pruned without us wanting to drop the run
  -- history.
  job_key         uuid,
  job_name        text,
  status          text        NOT NULL CHECK (status IN (
                    'started',
                    'succeeded',
                    'failed',
                    'skipped'
                  )),
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  duration_ms     integer,
  -- Copy of the job's args jsonb at claim time, for forensics on which
  -- account_id / username / requester was involved.
  args            jsonb,
  -- Worker-specific phase timings, counts, output paths, etc.
  result          jsonb,
  error           text,
  -- Hostname of the box that ran the job. Helpful when more than one
  -- worker replica exists.
  host            text
);

CREATE INDEX IF NOT EXISTS worker_runs_worker_name_started_at_idx
  ON private.worker_runs (worker_name, started_at DESC);
CREATE INDEX IF NOT EXISTS worker_runs_job_key_idx
  ON private.worker_runs (job_key);
CREATE INDEX IF NOT EXISTS worker_runs_status_started_at_idx
  ON private.worker_runs (status, started_at DESC);

-- Worker connects as service_role (or via direct DB URL); private schema
-- is not exposed via PostgREST so no further grants are needed.
ALTER TABLE private.worker_runs OWNER TO postgres;
