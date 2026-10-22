BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(16);

-- Owner: Twitter account 990000000000000501, handle OwnerTw.
-- Victim: handle victim_tw, whose folder the owner must not name.

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.archive_upload'::regclass
      AND tgname = 'enforce_archive_upload_owner'
      AND tgfoid = 'private.enforce_archive_upload_owner'::regproc
      AND tgenabled <> 'D'
      AND (tgtype & 1) <> 0   -- FOR EACH ROW
      AND (tgtype & 2) <> 0   -- BEFORE
      AND (tgtype & 4) <> 0   -- INSERT
      AND (tgtype & 16) <> 0  -- UPDATE
  ),
  'enforce_archive_upload_owner runs BEFORE INSERT OR UPDATE on archive_upload'
);

INSERT INTO public.all_account (account_id, created_via, username, created_at, account_display_name)
VALUES ('990000000000000501', 'twitter_archive', 'OwnerTw', now(), 'Owner');

SELECT setval(
  pg_get_serial_sequence('public.archive_upload', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.archive_upload), 1)
);

-- A row written before the owner renamed their handle. Existing data is never
-- re-validated.
INSERT INTO public.archive_upload (account_id, username, archive_at, upload_phase)
VALUES ('990000000000000501', 'OldHandle', '2020-01-01T00:00:00Z', 'completed');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated","app_metadata":{"provider":"twitter","provider_id":"990000000000000501","user_name":"OwnerTw"}}';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at)
     VALUES ('990000000000000501', 'victim_tw', '2021-01-01T00:00:00Z') $$,
  '42501',
  'archive upload username does not match the authenticated account',
  'a user cannot insert a legacy row naming another handle'
);

SELECT throws_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at, storage_path, storage_sha256)
     VALUES ('990000000000000501', 'victim_tw', '2021-01-02T00:00:00Z',
             'victim_tw/12345678-1234-1234-1234-123456789abc/archive.json', repeat('a', 64)) $$,
  '42501',
  'archive upload username does not match the authenticated account',
  'a user cannot insert a pinned row naming another handle and its folder'
);

SELECT throws_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at, storage_path, storage_sha256)
     VALUES ('990000000000000501', 'OwnerTw', '2021-01-03T00:00:00Z',
             'victim_tw/12345678-1234-1234-1234-123456789abc/archive.json', repeat('a', 64)) $$,
  '42501',
  'archive storage path is outside the authenticated account folder',
  'a user cannot pair their own handle with another user''s folder'
);

SELECT throws_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at)
     VALUES ('990000000000000501', NULL, '2021-01-04T00:00:00Z') $$,
  '42501',
  'archive upload username does not match the authenticated account',
  'a user cannot insert a row without a username'
);

SELECT lives_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at, storage_path, storage_sha256)
     VALUES ('990000000000000501', 'ownertw', '2021-02-01T00:00:00Z',
             'ownertw/12345678-1234-1234-1234-123456789abc/archive.json', repeat('a', 64)) $$,
  'a pinned upload in the caller''s lowercase folder succeeds'
);

SELECT lives_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at)
     VALUES ('990000000000000501', 'OwnerTw', '2021-02-02T00:00:00Z') $$,
  'a legacy row naming the caller''s handle in any case succeeds'
);

SELECT lives_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'ready_for_commit'
     WHERE account_id = '990000000000000501' AND archive_at = '2021-02-01T00:00:00Z' $$,
  'the owner can still advance their upload''s phase'
);

SELECT lives_ok(
  $$ UPDATE public.archive_upload SET upload_phase = 'failed'
     WHERE account_id = '990000000000000501' AND username = 'OldHandle' $$,
  'an update that keeps a pre-rename username is not re-validated'
);

SELECT throws_ok(
  $$ UPDATE public.archive_upload SET username = 'victim_tw'
     WHERE account_id = '990000000000000501' AND archive_at = '2021-02-02T00:00:00Z' $$,
  '42501',
  'archive upload username does not match the authenticated account',
  'a user cannot repoint an existing row to another handle'
);

RESET ROLE;

SELECT is(
  (SELECT count(*)::integer FROM public.archive_upload
   WHERE account_id = '990000000000000501' AND lower(username) = 'victim_tw'),
  0,
  'no row naming the victim was written'
);

-- A stale or forged session without a trusted user_name cannot write rows.
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated","app_metadata":{"provider_id":"990000000000000501"},"user_metadata":{"user_name":"OwnerTw"}}';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at)
     VALUES ('990000000000000501', 'OwnerTw', '2021-03-01T00:00:00Z') $$,
  '42501',
  'archive upload username does not match the authenticated account',
  'user_metadata.user_name is not accepted in place of app_metadata.user_name'
);

RESET ROLE;

-- The service role (worker and admin tooling) is exempt.
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at)
     VALUES ('990000000000000501', 'AnyHandle', '2021-04-01T00:00:00Z') $$,
  'the service role may write any username'
);

RESET ROLE;

-- A SECURITY DEFINER caller keeps the user's JWT, so current_role is not trusted.
CREATE FUNCTION public.test_definer_insert_archive_upload(p_username text)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.archive_upload (account_id, username, archive_at)
  VALUES ('990000000000000501', p_username, '2021-05-01T00:00:00Z');
$$;
GRANT EXECUTE ON FUNCTION public.test_definer_insert_archive_upload(text) TO authenticated;

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated","app_metadata":{"provider_id":"990000000000000501","user_name":"OwnerTw"}}';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.test_definer_insert_archive_upload('victim_tw') $$,
  '42501',
  'archive upload username does not match the authenticated account',
  'a user calling a SECURITY DEFINER writer is still checked'
);

RESET ROLE;

-- A direct database session without a request JWT is exempt.
SELECT set_config('request.jwt.claims', '', true);

SELECT lives_ok(
  $$ INSERT INTO public.archive_upload (account_id, username, archive_at)
     VALUES ('990000000000000501', 'DirectHandle', '2021-06-01T00:00:00Z') $$,
  'a direct postgres session may write any username'
);

SELECT is(
  (SELECT count(*)::integer FROM public.archive_upload WHERE account_id = '990000000000000501'),
  5,
  'only the permitted rows were written'
);

SELECT * FROM finish();
ROLLBACK;
