BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(17);

-- delete_user_archive and delete_single_archive are SECURITY DEFINER, so
-- current_role inside them is always their owner. These tests pin the caller
-- guard to the request JWT: only the owning account, service_role, or a
-- direct postgres session without a request JWT may delete an archive.
-- Every test session runs as session_user postgres, so the cross-account
-- tests also prove that a request JWT is never bypassed by the login role.

CREATE FUNCTION pg_temp.seed_archive(p_account_id text, p_archive_upload_id bigint)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.all_account (
    account_id, created_via, username, created_at, account_display_name
  ) VALUES (
    p_account_id, 'test', '__pgtap_delete_' || p_account_id, now(), 'Delete guard test'
  )
  ON CONFLICT (account_id) DO NOTHING;

  -- (account_id, archive_at) is unique, and now() is fixed per transaction.
  INSERT INTO public.archive_upload (id, account_id, archive_at, upload_phase)
  OVERRIDING SYSTEM VALUE
  VALUES (
    p_archive_upload_id, p_account_id,
    now() - make_interval(days => (p_archive_upload_id % 10)::integer),
    'completed'
  );

  INSERT INTO public.tweets (
    tweet_id, account_id, created_at, full_text, favorite_count, retweet_count,
    archive_upload_id
  ) VALUES (
    p_archive_upload_id::text || '1', p_account_id, now(), 'archived tweet', 0, 0,
    p_archive_upload_id
  );

  INSERT INTO public.liked_tweets (tweet_id, full_text)
  VALUES (p_archive_upload_id::text || '2', 'liked tweet')
  ON CONFLICT (tweet_id) DO NOTHING;

  INSERT INTO public.likes (account_id, liked_tweet_id, archive_upload_id)
  VALUES (p_account_id, p_archive_upload_id::text || '2', p_archive_upload_id);

  INSERT INTO public.followers (account_id, follower_account_id, archive_upload_id)
  VALUES (p_account_id, p_archive_upload_id::text || '3', p_archive_upload_id);

  INSERT INTO public.following (account_id, following_account_id, archive_upload_id)
  VALUES (p_account_id, p_archive_upload_id::text || '4', p_archive_upload_id);
$$;

-- Archive uploads plus the tweets, likes, followers and following they carry.
CREATE FUNCTION pg_temp.archive_rows(p_account_id text)
RETURNS integer
LANGUAGE sql
AS $$
  SELECT (
    (SELECT count(*) FROM public.archive_upload WHERE account_id = p_account_id)
    + (SELECT count(*) FROM public.tweets WHERE account_id = p_account_id)
    + (SELECT count(*) FROM public.likes WHERE account_id = p_account_id)
    + (SELECT count(*) FROM public.followers WHERE account_id = p_account_id)
    + (SELECT count(*) FROM public.following WHERE account_id = p_account_id)
  )::integer;
$$;

SELECT pg_temp.seed_archive('990000000000000302', 9900003021);
SELECT pg_temp.seed_archive('990000000000000302', 9900003022);
SELECT pg_temp.seed_archive('990000000000000303', 9900003031);
SELECT pg_temp.seed_archive('990000000000000303', 9900003032);
SELECT pg_temp.seed_archive('990000000000000304', 9900003041);
SELECT pg_temp.seed_archive('990000000000000304', 9900003042);

SELECT ok(
  NOT has_function_privilege('anon', 'public.delete_user_archive(text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.delete_single_archive(text, bigint)', 'EXECUTE'),
  'anonymous callers cannot execute the archive delete functions'
);

-- An authenticated user whose provider_id belongs to a different account.
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000000301","role":"authenticated","app_metadata":{"provider_id":"990000000000000301"}}';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.delete_user_archive('990000000000000302') $$,
  'P0001',
  'Unauthorized: provider_id 990000000000000301 does not match account_id 990000000000000302',
  'an authenticated user cannot delete another account''s archives'
);

SELECT throws_ok(
  $$ SELECT public.delete_single_archive('990000000000000302', 9900003021) $$,
  'P0001',
  'Unauthorized: provider_id 990000000000000301 does not match account_id 990000000000000302',
  'an authenticated user cannot delete another account''s single archive'
);

SELECT throws_ok(
  $$ SELECT public.delete_single_archive(NULL, 9900003021) $$,
  'P0001',
  'Unauthorized: provider_id 990000000000000301 does not match account_id <NULL>',
  'a NULL account_id does not skip the single-archive ownership guard'
);

SELECT throws_ok(
  $$ SELECT public.delete_user_archive(NULL) $$,
  'P0001',
  'Unauthorized: provider_id 990000000000000301 does not match account_id <NULL>',
  'a NULL account_id does not skip the account-archive ownership guard'
);

-- An authenticated user without a trusted provider_id.
RESET ROLE;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000000305","role":"authenticated","app_metadata":{}}';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.delete_user_archive('990000000000000302') $$,
  'P0001',
  'Unauthorized: provider_id <NULL> does not match account_id 990000000000000302',
  'an authenticated user without a provider_id cannot delete archives'
);

RESET ROLE;
SET LOCAL request.jwt.claims TO '';

SELECT is(
  pg_temp.archive_rows('990000000000000302'),
  10,
  'rejected calls leave the target account''s archives intact'
);

-- The owning account.
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-000000000302","role":"authenticated","app_metadata":{"provider_id":"990000000000000302"}}';
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ SELECT public.delete_single_archive('990000000000000302', 9900003021) $$,
  'the owning account can delete one of its archives'
);

RESET ROLE;
SELECT is(
  pg_temp.archive_rows('990000000000000302'),
  5,
  'the owner''s single-archive delete removes only that upload'
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ SELECT public.delete_user_archive('990000000000000302') $$,
  'the owning account can delete all of its archives'
);

RESET ROLE;
SET LOCAL request.jwt.claims TO '';

SELECT is(
  pg_temp.archive_rows('990000000000000302'),
  0,
  'the owner''s account delete removes every archive row'
);

-- service_role through PostgREST: the JWT role claim matches the SET ROLE.
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$ SELECT public.delete_single_archive('990000000000000303', 9900003031) $$,
  'service_role can delete any single archive'
);

SELECT lives_ok(
  $$ SELECT public.delete_user_archive('990000000000000303') $$,
  'service_role can delete any account''s archives'
);

RESET ROLE;
SET LOCAL request.jwt.claims TO '';

SELECT is(
  pg_temp.archive_rows('990000000000000303'),
  0,
  'service_role deletes remove every archive row'
);

-- A direct postgres session with no request JWT (operators, maintenance).
SELECT lives_ok(
  $$ SELECT public.delete_single_archive('990000000000000304', 9900003041) $$,
  'a direct postgres session can delete any single archive'
);

SELECT lives_ok(
  $$ SELECT public.delete_user_archive('990000000000000304') $$,
  'a direct postgres session can delete any account''s archives'
);

SELECT is(
  pg_temp.archive_rows('990000000000000304'),
  0,
  'direct postgres deletes remove every archive row'
);

SELECT * FROM finish();
ROLLBACK;
