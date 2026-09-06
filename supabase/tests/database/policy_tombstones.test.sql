BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(16);

INSERT INTO public.all_account (
  account_id, created_via, username, created_at, account_display_name
) VALUES (
  '990000000000000001', 'test', '__pgtap_policy_boundary', now(), 'Policy test'
);

INSERT INTO public.tweets (
  tweet_id, account_id, created_at, full_text, favorite_count, retweet_count
) VALUES (
  '990000000000000002', '990000000000000001', now(),
  'authorized content', 1, 1
);

SELECT public.tombstone_policy_account('990000000000000001');

SELECT is(
  (SELECT is_tombstone FROM public.all_account
   WHERE account_id = '990000000000000001'),
  true,
  'the explicit policy operation tombstones an account'
);

SELECT is(
  (SELECT is_tombstone FROM public.tweets
   WHERE tweet_id = '990000000000000002'),
  true,
  'the explicit policy operation tombstones authored tweets'
);

SELECT throws_ok(
  $$
    UPDATE public.tweets
    SET full_text = 'content must not enter a tombstone'
    WHERE tweet_id = '990000000000000002'
  $$,
  '23514',
  NULL,
  'content-free tombstone constraints remain enforced'
);

UPDATE public.all_account
SET created_via = 'test', username = '__pgtap_policy_boundary',
    created_at = now(), account_display_name = 'Policy test',
    is_tombstone = false
WHERE account_id = '990000000000000001';

UPDATE public.tweets
SET created_at = now(), full_text = 'authorized content restored',
    favorite_count = 1, retweet_count = 1, is_tombstone = false
WHERE tweet_id = '990000000000000002';

SELECT is(
  (SELECT full_text FROM public.tweets
   WHERE tweet_id = '990000000000000002'),
  'authorized content restored',
  'a trusted writer can hydrate a stable tombstone key'
);

INSERT INTO tes.blocked_scraping_users (account_id, block_source)
VALUES ('990000000000000001', 'admin');

SELECT is(
  (SELECT is_tombstone FROM public.all_account
   WHERE account_id = '990000000000000001'),
  true,
  'recording a block synchronously tombstones existing account content'
);

SELECT is(
  (SELECT is_tombstone FROM public.tweets
   WHERE tweet_id = '990000000000000002'),
  true,
  'recording a block synchronously tombstones existing tweet content'
);

INSERT INTO public.all_account (
  account_id, created_via, username, created_at, account_display_name
) VALUES (
  '990000000000000003', 'test', '__pgtap_explicit_optout', now(), 'Opt out test'
);

INSERT INTO public.optin (
  username, twitter_user_id, opted_in, explicit_optout
) VALUES (
  '__pgtap_explicit_optout', '990000000000000003', false, true
);

SELECT is(
  (SELECT count(*)::integer FROM tes.blocked_scraping_users
   WHERE account_id = '990000000000000003'
     AND block_source = 'explicit_optout'),
  1,
  'an explicit opt-out propagates to the block authority'
);

SELECT is(
  (SELECT is_tombstone FROM public.all_account
   WHERE account_id = '990000000000000003'),
  true,
  'an explicit opt-out synchronously tombstones existing account content'
);

SELECT is(
  public.policy_account_is_blocked(
    '990000000000000003', '__pgtap_explicit_optout'
  ),
  true,
  'trusted ingestion boundaries can resolve authoritative policy'
);

SELECT throws_ok(
  $$
    SELECT public.assert_archive_upload_allowed(
      '990000000000000003', '__pgtap_explicit_optout'
    )
  $$,
  '42501',
  NULL,
  'the archive intake boundary rejects an opted-out owner'
);

SELECT is(
  public.archive_upload_is_allowed(
    '990000000000000099', '__pgtap_allowed_owner'
  ),
  true,
  'the archive intake boundary permits an unblocked owner'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN (
        'enforce_policy_account_tombstone',
        'enforce_policy_tweet_tombstone',
        'protect_policy_tombstone_delete',
        'enforce_policy_mentioned_user_tombstone',
        'enforce_policy_liked_tweet_tombstone',
        'enforce_policy_archive_object',
        'reject_policy_blocked_account_detail',
        'reject_policy_tombstone_tweet_detail',
        'reject_policy_blocked_json_payload'
      )
  ),
  0,
  'corpus writes have no per-row policy triggers'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN (
        'propagate_explicit_optout_scrape_block',
        'capture_policy_block_username',
        'apply_policy_block_tombstone'
      )
  ),
  3,
  'only the three policy-state event triggers remain'
);

SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'archives'),
  false,
  'raw archives remain private'
);

SELECT is(
  has_table_privilege('anon', 'public.account_activity_summary', 'SELECT'),
  false,
  'the legacy content-bearing activity snapshot remains private'
);

SELECT has_table(
  'private',
  'policy_storage_objects',
  'late opt-outs retain a content-free durable-object manifest'
);

SELECT * FROM finish();
ROLLBACK;
