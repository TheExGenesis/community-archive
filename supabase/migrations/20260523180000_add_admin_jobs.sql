-- Dedicated job table for admin-initiated work that is processed by
-- out-of-process workers (today: services/admin-delete-worker).
--
-- Why a separate table from private.job_queue?
--
-- private.job_queue is consumed every minute by private.process_jobs()
-- (pg_cron job 186). That function does:
--
--   SELECT * FROM private.job_queue WHERE status = 'QUEUED'
--     ORDER BY timestamp LIMIT 1 FOR UPDATE SKIP LOCKED;
--   ... switch on job_name ...
--   UPDATE private.job_queue SET status = 'DONE' WHERE key = ...;
--
-- The SELECT has no job_name filter, and the final UPDATE always
-- marks the row DONE — so any job_name that doesn't match one of the
-- IF branches is silently dropped. If the worker were behind by even
-- one poll cycle, process_jobs() would eat our admin_delete_with_export
-- rows and the actual delete would never happen.
--
-- Separating tables is the safest fix: no possible interaction with
-- pg_cron, and we get an obvious home for future admin RPCs
-- (resync-account, rebuild-search-index, etc.) without re-litigating
-- the job_name filter.

CREATE TABLE IF NOT EXISTS private.admin_jobs (
  key         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name    text NOT NULL,
  status      text NOT NULL DEFAULT 'QUEUED'
              CHECK (status IN ('QUEUED', 'PROCESSING', 'DONE', 'FAILED')),
  args        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Named created_at instead of `timestamp` (a SQL reserved word the
  -- old table painfully required quoting around). The worker's claim
  -- SQL orders by created_at.
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Partial index targeted at the worker's hot path: claim the oldest
-- QUEUED row for a given job_name. PROCESSING rows are also included
-- so the "is anything stuck?" observability queries are fast without
-- a separate index.
CREATE INDEX IF NOT EXISTS idx_admin_jobs_claim
  ON private.admin_jobs (job_name, created_at)
  WHERE status IN ('QUEUED', 'PROCESSING');

-- For the by-job-name forensics queries (status distribution, etc.).
CREATE INDEX IF NOT EXISTS idx_admin_jobs_job_name_status
  ON private.admin_jobs (job_name, status);

COMMENT ON TABLE private.admin_jobs IS
  'Admin-initiated jobs consumed by out-of-process workers (e.g. '
  'services/admin-delete-worker). Deliberately separate from '
  'private.job_queue, which is consumed by private.process_jobs() '
  'via pg_cron and would silently mark unknown job_names DONE.';

-- Lock the table down to the service role + the postgres owner.
-- private schema is already not exposed via PostgREST, but be
-- explicit about who can read/write.
REVOKE ALL ON TABLE private.admin_jobs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE private.admin_jobs TO service_role;
