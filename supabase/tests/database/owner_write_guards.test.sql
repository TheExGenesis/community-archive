BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(14);

-- Owner: Twitter account 990000000000000601, trusted handle OwnerSix.
INSERT INTO public.all_account (account_id, created_via, username, created_at, account_display_name)
VALUES ('990000000000000601', 'twitter_archive', 'OwnerSix', now(), 'Owner Six');

SELECT setval(
  pg_get_serial_sequence('public.archive_upload', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.archive_upload), 1)
);

-- Rows the service-role worker would have written.
INSERT INTO public.archive_upload (account_id, username, archive_at, upload_phase)
VALUES ('990000000000000601', 'OwnerSix', '2020-01-01T00:00:00Z', 'completed'),
       ('990000000000000601', 'OwnerSix', '2020-02-01T00:00:00Z', 'uploading');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated","app_metadata":{"provider":"twitter","provider_id":"990000000000000601","user_name":"OwnerSix"}}';
SET LOCAL ROLE authenticated;

-- archive_upload.upload_phase

SELECT throws_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at, upload_phase)
     VALUES ('990000000000000601', 'OwnerSix', '2021-01-01T00:00:00Z', 'completed') $$,
  '42501',
  'archive uploads must start in the uploading phase',
  'an owner cannot insert a completed upload'
);

SELECT throws_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'completed'
     WHERE account_id = '990000000000000601' AND archive_at = '2020-02-01T00:00:00Z' $$,
  '42501',
  'archive upload phase can only be set to uploading, ready_for_commit or failed by its owner',
  'an owner cannot mark their own upload completed'
);

SELECT throws_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'committing'
     WHERE account_id = '990000000000000601' AND archive_at = '2020-02-01T00:00:00Z' $$,
  '42501',
  'archive upload phase can only be set to uploading, ready_for_commit or failed by its owner',
  'an owner cannot mark their own upload committing'
);

SELECT throws_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'ready_for_commit'
     WHERE account_id = '990000000000000601' AND archive_at = '2020-01-01T00:00:00Z' $$,
  '42501',
  'archive upload phase can only be set to uploading, ready_for_commit or failed by its owner',
  'an owner cannot reopen a completed upload for reprocessing'
);

SELECT lives_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at)
     VALUES ('990000000000000601', 'OwnerSix', '2021-02-01T00:00:00Z') $$,
  'an owner can start an upload'
);

SELECT lives_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'ready_for_commit'
     WHERE account_id = '990000000000000601' AND archive_at = '2020-02-01T00:00:00Z' $$,
  'an owner can hand an upload to the worker'
);

SELECT lives_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'failed'
     WHERE account_id = '990000000000000601' AND archive_at = '2021-02-01T00:00:00Z' $$,
  'an owner can mark their own upload failed'
);

-- all_account.username and is_tombstone

SELECT lives_ok(
  $$ UPDATE public.all_account SET username = 'someone_else', num_tweets = 5
     WHERE account_id = '990000000000000601' $$,
  'an owner update still succeeds'
);

RESET ROLE;

SELECT is(
  (SELECT username FROM public.all_account WHERE account_id = '990000000000000601'),
  'OwnerSix',
  'the username is pinned to the trusted handle'
);

SELECT is(
  (SELECT num_tweets FROM public.all_account WHERE account_id = '990000000000000601'),
  5,
  'other owner-written columns are kept'
);

SELECT is(
  (SELECT count(*)::integer FROM public.archive_upload
   WHERE account_id = '990000000000000601' AND upload_phase = 'completed'),
  1,
  'only the worker-written completed row exists'
);


-- Service-role writes are not restricted.
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
SELECT lives_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'completed'
     WHERE account_id = '990000000000000601' AND archive_at = '2020-02-01T00:00:00Z' $$,
  'the service-role worker can complete an upload'
);

-- A blocked account's tombstone cannot be cleared by its owner. Set it up as a
-- trusted direct login (no request JWT).
RESET request.jwt.claims;
UPDATE public.all_account
SET is_tombstone = true, username = '', account_display_name = '', num_tweets = 0,
    num_following = 0, num_followers = 0, num_likes = 0, created_via = 'policy_tombstone'
WHERE account_id = '990000000000000601';
INSERT INTO tes.blocked_scraping_users (account_id, block_source)
VALUES ('990000000000000601', 'admin')
ON CONFLICT DO NOTHING;

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated","app_metadata":{"provider":"twitter","provider_id":"990000000000000601","user_name":"OwnerSix"}}';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ UPDATE public.all_account SET is_tombstone = false, num_tweets = 9
     WHERE account_id = '990000000000000601' $$,
  '23514',
  NULL,
  'a blocked owner cannot clear their tombstone'
);

RESET ROLE;

SELECT is(
  (SELECT is_tombstone FROM public.all_account WHERE account_id = '990000000000000601'),
  true,
  'the tombstone is still set'
);

SELECT * FROM finish();
ROLLBACK;
