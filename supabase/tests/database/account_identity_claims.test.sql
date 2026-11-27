BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(23);

-- Users:
--   ...401 Alice    Twitter account 990000000000000401
--   ...402 Mallory  email sign-up that claims Alice's account in user_metadata
--   ...403 Dev      created by the service role (dev-login), no Twitter identity
--   ...404 Nora     Twitter sign-up whose claims lack user_name
-- Bob (990000000000000402) is an archived account with no auth user.

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'sync_user_meta_data'
      AND tgfoid = 'public.sync_meta_data'::regproc
      AND tgenabled <> 'D'
      AND (tgtype & 1) <> 0   -- FOR EACH ROW
      AND (tgtype & 2) <> 0   -- BEFORE
      AND (tgtype & 4) <> 0   -- INSERT
      AND (tgtype & 16) <> 0  -- UPDATE
  ),
  'sync_user_meta_data runs BEFORE INSERT OR UPDATE on auth.users, as in production'
);

-- GoTrue's OAuth sign-up inserts the user with the provider's claims as
-- user_metadata, then inserts the identity.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  '00000000-0000-4000-8000-000000000401', 'authenticated', 'authenticated', 'alice@example.test',
  '{"provider":"twitter","providers":["twitter"]}',
  '{"provider_id":"990000000000000401","sub":"990000000000000401","user_name":"AliceTw"}',
  now(), now()
);

SELECT is(
  (SELECT raw_app_meta_data->>'provider_id' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000401'),
  '990000000000000401',
  'a Twitter OAuth sign-up receives its provider_id before the identity row exists'
);

SELECT is(
  (SELECT raw_app_meta_data->>'user_name' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000401'),
  'AliceTw',
  'a Twitter OAuth sign-up receives its user_name before the identity row exists'
);

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
VALUES (
  '990000000000000401', '00000000-0000-4000-8000-000000000401',
  '{"provider_id":"990000000000000401","sub":"990000000000000401","user_name":"AliceTw","preferred_username":"AliceTw"}',
  'twitter', now(), now()
);

-- supabase.auth.updateUser({ data: { provider_id, user_name } })
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data
  || '{"provider_id":"990000000000000402","user_name":"BobTw"}'::jsonb
WHERE id = '00000000-0000-4000-8000-000000000401';

SELECT is(
  (SELECT raw_app_meta_data->>'provider_id' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000401'),
  '990000000000000401',
  'rewriting user_metadata.provider_id does not change app_metadata.provider_id'
);

SELECT is(
  (SELECT raw_app_meta_data->>'user_name' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000401'),
  'AliceTw',
  'rewriting user_metadata.user_name does not change app_metadata.user_name'
);

-- The auth callback copies user_metadata into app_metadata with the service role.
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
  || '{"provider_id":"990000000000000402","user_name":"bobtw"}'::jsonb
WHERE id = '00000000-0000-4000-8000-000000000401';

SELECT is(
  (SELECT raw_app_meta_data->>'provider_id' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000401'),
  '990000000000000401',
  'the Twitter identity overrides a direct app_metadata.provider_id write'
);

-- A later login refreshes identity_data, then user_metadata.
UPDATE auth.identities
SET identity_data = identity_data || '{"user_name":"AliceRenamed"}'::jsonb
WHERE user_id = '00000000-0000-4000-8000-000000000401' AND provider = 'twitter';
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"user_name":"AliceRenamed"}'::jsonb
WHERE id = '00000000-0000-4000-8000-000000000401';

SELECT is(
  (SELECT raw_app_meta_data->>'user_name' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000401'),
  'AliceRenamed',
  'a handle change in the Twitter identity reaches app_metadata.user_name'
);

SELECT is(
  (SELECT raw_app_meta_data->'providers' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000401'),
  '["twitter"]'::jsonb,
  'other app_metadata keys are preserved'
);

-- supabase.auth.signUp({ email, password, options: { data: { provider_id } } })
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  '00000000-0000-4000-8000-000000000402', 'authenticated', 'authenticated', 'mallory@example.test',
  '{"provider":"email","providers":["email"]}',
  '{"provider_id":"990000000000000401","user_name":"AliceTw"}',
  now(), now()
);

SELECT ok(
  (SELECT NOT (raw_app_meta_data ?| ARRAY['provider_id', 'user_name'])
   FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000402'),
  'an email sign-up cannot claim an account through user_metadata'
);

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"provider_id":"990000000000000402"}'::jsonb
WHERE id = '00000000-0000-4000-8000-000000000402';

SELECT ok(
  (SELECT NOT (raw_app_meta_data ?| ARRAY['provider_id', 'user_name'])
   FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000402'),
  'a user without a Twitter identity cannot claim an account by updating user_metadata'
);

-- dev-login: auth.admin.createUser({ user_metadata, app_metadata }). GoTrue
-- inserts the user with its own app_metadata, then applies the requested
-- app_metadata with an UPDATE.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  '00000000-0000-4000-8000-000000000403', 'authenticated', 'authenticated', 'alice_dev@example.test',
  '{"provider":"email","providers":["email"]}',
  '{"provider_id":"mock_alice","user_name":"alice_dev"}',
  now(), now()
);

SELECT ok(
  (SELECT NOT (raw_app_meta_data ?| ARRAY['provider_id', 'user_name'])
   FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000403'),
  'a service-role-created user gets no account from user_metadata on INSERT'
);

UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
  || '{"provider":"staging","provider_id":"mock_alice","user_name":"alice_dev"}'::jsonb
WHERE id = '00000000-0000-4000-8000-000000000403';

SELECT is(
  (SELECT raw_app_meta_data FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000403'),
  '{"provider":"staging","providers":["email"],"provider_id":"mock_alice","user_name":"alice_dev"}'::jsonb,
  'an admin app_metadata update on a user without a Twitter identity is kept'
);

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"provider_id":"990000000000000401"}'::jsonb
WHERE id = '00000000-0000-4000-8000-000000000403';
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"birdseye_share":"public"}'::jsonb
WHERE id = '00000000-0000-4000-8000-000000000403';

SELECT is(
  (SELECT raw_app_meta_data->>'provider_id' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000403'),
  'mock_alice',
  'rewriting user_metadata.provider_id does not move a service-role-created user to another account'
);

SELECT is(
  (SELECT raw_app_meta_data->>'birdseye_share' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000403'),
  'public',
  'unrelated app_metadata writes still apply'
);

-- auth.admin.updateUserById(id, { app_metadata: { provider_id, user_name } })
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
  || '{"provider_id":"mock_bob","user_name":"bob_dev"}'::jsonb
WHERE id = '00000000-0000-4000-8000-000000000403';

SELECT is(
  (SELECT raw_app_meta_data->>'provider_id' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000403'),
  'mock_bob',
  'an admin can reassign app_metadata.provider_id on a user without a Twitter identity'
);

-- supabase.auth.updateUser({ data }) writes raw_user_meta_data only.
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data
  || '{"provider_id":"990000000000000401","user_name":"AliceTw"}'::jsonb
WHERE id = '00000000-0000-4000-8000-000000000403';

SELECT is(
  (SELECT raw_app_meta_data->>'user_name' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000403'),
  'bob_dev',
  'rewriting user_metadata after an admin write does not change app_metadata'
);

-- The previous trigger returned NULL app_metadata when a claim was missing.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  '00000000-0000-4000-8000-000000000404', 'authenticated', 'authenticated', 'nora@example.test',
  '{"provider":"twitter","providers":["twitter"]}',
  '{"provider_id":"990000000000000404","sub":"990000000000000404"}',
  now(), now()
);

SELECT is(
  (SELECT raw_app_meta_data FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000404'),
  '{"provider":"twitter","providers":["twitter"],"provider_id":"990000000000000404"}'::jsonb,
  'a Twitter sign-up without user_name keeps its app_metadata'
);

-- Mallory links her own Twitter account.
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
VALUES (
  '990000000000000405', '00000000-0000-4000-8000-000000000402',
  '{"provider_id":"990000000000000405","sub":"990000000000000405","user_name":"MalloryTw"}',
  'twitter', now(), now()
);
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"provider_id":"990000000000000405","user_name":"MalloryTw"}'::jsonb
WHERE id = '00000000-0000-4000-8000-000000000402';

SELECT is(
  (SELECT raw_app_meta_data->>'provider_id' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000402'),
  '990000000000000405',
  'linking a Twitter identity sets app_metadata.provider_id from that identity'
);

-- tes.get_current_account_id() and the follower RPCs that depend on it.
INSERT INTO public.all_account (account_id, created_via, username, created_at, account_display_name)
VALUES
  ('990000000000000401', 'test', '__pgtap_alice_identity', now(), 'Alice'),
  ('990000000000000402', 'test', '__pgtap_bob_identity', now(), 'Bob');

-- public.account lists accounts with a completed upload.
INSERT INTO public.archive_upload (id, account_id, archive_at, upload_phase)
OVERRIDING SYSTEM VALUE
VALUES
  (9900004011, '990000000000000401', now(), 'completed'),
  (9900004021, '990000000000000402', now(), 'completed');

INSERT INTO public.mentioned_users (user_id, name, screen_name)
VALUES
  ('990000000000000491', 'Alice follower', '__pgtap_alice_follower'),
  ('990000000000000492', 'Bob follower', '__pgtap_bob_follower');

INSERT INTO public.followers (account_id, follower_account_id)
VALUES
  ('990000000000000401', '990000000000000491'),
  ('990000000000000402', '990000000000000492');

-- Alice's user_metadata still claims Bob's account from the update above.
SELECT is(
  (SELECT raw_user_meta_data->>'provider_id' FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000401'),
  '990000000000000402',
  'fixture: Alice''s user_metadata claims Bob''s account'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000000401","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  tes.get_current_account_id(),
  '990000000000000401',
  'get_current_account_id resolves the caller''s Twitter identity, not user_metadata'
);

RESET ROLE;

-- get_followers is granted to the service role only; it resolves the
-- account from the request's user claims.
SELECT results_eq(
  $$ SELECT account_id FROM tes.get_followers() $$,
  ARRAY['990000000000000491'],
  'get_followers returns the caller''s followers, not those of the account in user_metadata'
);

-- Dev claims Alice's account in user_metadata and has no Twitter identity.
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000000403","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  tes.get_current_account_id(),
  NULL,
  'get_current_account_id returns NULL for a user without a Twitter identity'
);

RESET ROLE;

SET LOCAL request.jwt.claims TO '{"role":"anon"}';
SET LOCAL ROLE anon;

SELECT is(
  tes.get_current_account_id(),
  NULL,
  'get_current_account_id returns NULL for anonymous callers'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
