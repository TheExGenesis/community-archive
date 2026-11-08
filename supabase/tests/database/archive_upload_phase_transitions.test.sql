BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(20);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.archive_upload'::regclass
      AND tgname = 'enforce_archive_upload_transition'
      AND tgfoid = 'private.enforce_archive_upload_transition'::regproc
      AND tgenabled <> 'D'
      AND (tgtype & 1) <> 0   -- FOR EACH ROW
      AND (tgtype & 2) <> 0   -- BEFORE
      AND (tgtype & 4) <> 0   -- INSERT
      AND (tgtype & 16) <> 0  -- UPDATE
  ),
  'enforce_archive_upload_transition runs BEFORE INSERT OR UPDATE on archive_upload'
);

INSERT INTO public.all_account (account_id, created_via, username, created_at, account_display_name)
VALUES ('990000000000000601', 'twitter_archive', 'PhaseOwner', now(), 'Phase Owner');

SELECT setval(
  pg_get_serial_sequence('public.archive_upload', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.archive_upload), 1)
);

-- Trusted setup rows, one per phase the client must not leave.
CREATE TEMP TABLE phase_rows (label text PRIMARY KEY, id bigint) ON COMMIT DROP;
GRANT SELECT ON phase_rows TO authenticated, service_role;
WITH inserted AS (
  INSERT INTO public.archive_upload (account_id, username, archive_at, upload_phase)
  VALUES
    ('990000000000000601', 'PhaseOwner', '2020-01-01T00:00:00Z', 'committing'),
    ('990000000000000601', 'PhaseOwner', '2020-01-02T00:00:00Z', 'completed'),
    ('990000000000000601', 'PhaseOwner', '2020-01-03T00:00:00Z', 'failed')
  RETURNING id, upload_phase
)
INSERT INTO phase_rows SELECT upload_phase::text, id FROM inserted;

SELECT ok(
  (SELECT commit_claim_id IS NOT NULL AND commit_heartbeat_at IS NOT NULL
   FROM public.archive_upload WHERE id = (SELECT id FROM phase_rows WHERE label = 'committing')),
  'entering committing without a claim gets one from the trigger'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated","app_metadata":{"provider":"twitter","provider_id":"990000000000000601","user_name":"PhaseOwner"}}';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at, upload_phase)
     VALUES ('990000000000000601', 'PhaseOwner', '2021-01-01T00:00:00Z', 'completed') $$,
  '42501',
  'archive upload must start in the uploading phase',
  'a user cannot insert an already completed upload'
);

SELECT throws_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at, commit_attempts)
     VALUES ('990000000000000601', 'PhaseOwner', '2021-01-01T00:00:00Z', 1) $$,
  '42501',
  'archive upload must start in the uploading phase',
  'a user cannot insert lease bookkeeping'
);

SELECT lives_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at, upload_phase)
     VALUES ('990000000000000601', 'PhaseOwner', '2021-01-01T00:00:00Z', 'uploading') $$,
  'a user can start an upload'
);

RESET ROLE;
INSERT INTO phase_rows
SELECT 'client', MAX(id) FROM public.archive_upload WHERE account_id = '990000000000000601';
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'ready_for_commit'
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'client') $$,
  'a user can hand an upload to the worker'
);

SELECT throws_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'committing'
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'client') $$,
  '42501',
  'archive upload cannot move from ready_for_commit to committing',
  'a user cannot claim an upload'
);

SELECT throws_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'completed'
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'client') $$,
  '42501',
  'archive upload cannot move from ready_for_commit to completed',
  'a user cannot mark their own upload completed'
);

SELECT lives_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'uploading'
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'client') $$,
  'a user can reuse an unclaimed upload for a new attempt'
);

SELECT throws_ok(
  $$ UPDATE public.archive_upload SET commit_attempts = 0, commit_heartbeat_at = now()
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'client') $$,
  '42501',
  'archive upload commit lease is managed by the archive worker',
  'a user cannot write lease bookkeeping'
);

SELECT lives_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'failed'
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'client') $$,
  'a user can mark their own unfinished upload failed'
);

SELECT throws_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'ready_for_commit'
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'failed') $$,
  '42501',
  'archive upload cannot move from failed to ready_for_commit',
  'a user cannot resubmit a failed upload'
);

SELECT throws_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'failed'
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'committing') $$,
  '42501',
  'archive upload cannot move from committing to failed',
  'a user cannot interrupt a commit in progress'
);

SELECT throws_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'ready_for_commit'
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'completed') $$,
  '42501',
  'archive upload cannot move from completed to ready_for_commit',
  'a user cannot send a completed upload back for reprocessing'
);

SELECT lives_ok(
  $$ UPDATE public.archive_upload SET keep_private = false
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'completed') $$,
  'other owner edits on a completed upload are unaffected'
);

RESET ROLE;
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'ready_for_commit'
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'failed') $$,
  'service_role may requeue a failed upload'
);

RESET ROLE;
SET LOCAL request.jwt.claims TO '';

SELECT throws_ok(
  $$ UPDATE public.archive_upload SET commit_claim_id = NULL
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'committing') $$,
  '23514',
  NULL,
  'a committing row must keep its lease'
);

SELECT lives_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'completed'
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'committing') $$,
  'the worker can complete a committing upload'
);

SELECT ok(
  (SELECT commit_claim_id IS NULL AND commit_heartbeat_at IS NULL
   FROM public.archive_upload WHERE id = (SELECT id FROM phase_rows WHERE label = 'committing')),
  'leaving committing clears the lease'
);

SELECT throws_ok(
  $$ UPDATE public.archive_upload SET commit_attempts = -1
     WHERE id = (SELECT id FROM phase_rows WHERE label = 'completed') $$,
  '23514',
  NULL,
  'commit_attempts cannot go negative'
);

SELECT * FROM finish();
ROLLBACK;
