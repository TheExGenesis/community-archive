-- Make the archive_upload phase machine explicit.
--
--   uploading -> ready_for_commit -> committing -> completed
--        \              |    ^            |
--         `-> failed <--'    `- reclaim --'-> failed (after repeated reclaims)
--
-- Browser clients may only create an upload and hand it to the worker
-- (uploading <-> ready_for_commit, either -> failed). Only trusted callers
-- (the archive worker and other direct database logins) may enter committing
-- or completed. This replaces guard_archive_upload_phase from
-- 20261106210000_guard_owner_writes, which enforced the owner rule alone; the
-- one behaviour change is that an owner can no longer resubmit a failed upload
-- (the browser starts a new row instead).
--
-- A row in committing now carries a lease: commit_claim_id identifies the
-- worker run and commit_heartbeat_at is refreshed while it processes. A worker
-- that crashes leaves an expired lease, which the next run returns to
-- ready_for_commit (commit_attempts counts these reclaims) instead of the row
-- staying stuck until an operator repairs it.
--
-- Compatible with the previous worker: entering committing without a claim
-- gets one from the trigger, and leaving committing always clears it.

ALTER TABLE public.archive_upload
  ADD COLUMN IF NOT EXISTS commit_claim_id uuid,
  ADD COLUMN IF NOT EXISTS commit_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS commit_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.archive_upload.commit_claim_id IS
  'Archive-worker claim for a row in the committing phase; NULL in every other phase.';
COMMENT ON COLUMN public.archive_upload.commit_heartbeat_at IS
  'Last archive-worker heartbeat for the committing claim; an expired heartbeat lets the next run reclaim the row.';
COMMENT ON COLUMN public.archive_upload.commit_attempts IS
  'Number of times an expired committing claim was reclaimed; the worker fails the upload once it reaches its limit.';

-- Rows already in committing get a fresh lease, so a run in progress during
-- the migration is not reclaimed before its lease could expire.
UPDATE public.archive_upload
SET commit_claim_id = gen_random_uuid(),
    commit_heartbeat_at = now()
WHERE upload_phase = 'committing'
  AND (commit_claim_id IS NULL OR commit_heartbeat_at IS NULL);

ALTER TABLE public.archive_upload
  DROP CONSTRAINT IF EXISTS archive_upload_commit_lease;
ALTER TABLE public.archive_upload
  ADD CONSTRAINT archive_upload_commit_lease CHECK (
    commit_attempts >= 0 AND (
      upload_phase IS DISTINCT FROM 'committing'
      OR (commit_claim_id IS NOT NULL AND commit_heartbeat_at IS NOT NULL)
    )
  );

CREATE OR REPLACE FUNCTION private.enforce_archive_upload_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_role text := auth.jwt()->>'role';
  v_trusted boolean := COALESCE(v_role = 'service_role', false)
    OR (v_role IS NULL AND session_user <> 'authenticator');
BEGIN
  IF NOT v_trusted THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.upload_phase IS DISTINCT FROM 'uploading'
         OR NEW.commit_claim_id IS NOT NULL
         OR NEW.commit_heartbeat_at IS NOT NULL
         OR NEW.commit_attempts <> 0 THEN
        RAISE EXCEPTION 'archive upload must start in the uploading phase'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NEW.commit_claim_id IS DISTINCT FROM OLD.commit_claim_id
         OR NEW.commit_heartbeat_at IS DISTINCT FROM OLD.commit_heartbeat_at
         OR NEW.commit_attempts IS DISTINCT FROM OLD.commit_attempts THEN
        RAISE EXCEPTION 'archive upload commit lease is managed by the archive worker'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.upload_phase IS DISTINCT FROM OLD.upload_phase AND NOT (
        (OLD.upload_phase = 'uploading'
          AND NEW.upload_phase IN ('ready_for_commit', 'failed'))
        OR (OLD.upload_phase = 'ready_for_commit'
          AND NEW.upload_phase IN ('uploading', 'failed'))
      ) THEN
        RAISE EXCEPTION 'archive upload cannot move from % to %',
          OLD.upload_phase, NEW.upload_phase
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF NEW.upload_phase = 'committing' THEN
    IF TG_OP = 'INSERT' OR OLD.upload_phase IS DISTINCT FROM 'committing' THEN
      NEW.commit_claim_id := COALESCE(NEW.commit_claim_id, pg_catalog.gen_random_uuid());
      NEW.commit_heartbeat_at := COALESCE(NEW.commit_heartbeat_at, pg_catalog.now());
    END IF;
  ELSE
    NEW.commit_claim_id := NULL;
    NEW.commit_heartbeat_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION private.enforce_archive_upload_transition() OWNER TO postgres;

DROP TRIGGER IF EXISTS guard_archive_upload_phase ON public.archive_upload;
DROP FUNCTION IF EXISTS private.guard_archive_upload_phase();

DROP TRIGGER IF EXISTS enforce_archive_upload_transition ON public.archive_upload;
CREATE TRIGGER enforce_archive_upload_transition
BEFORE INSERT OR UPDATE ON public.archive_upload
FOR EACH ROW EXECUTE FUNCTION private.enforce_archive_upload_transition();
