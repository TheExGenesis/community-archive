BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(8);

INSERT INTO public.all_account (
  account_id,
  created_via,
  username,
  created_at,
  account_display_name
) VALUES (
  '990000000000000001',
  'twitter_import',
  '__pgtap_tombstone',
  '2026-01-01 00:00:00+00',
  'Policy Test'
);

INSERT INTO public.tweets (
  tweet_id,
  account_id,
  created_at,
  full_text,
  favorite_count,
  retweet_count
) VALUES (
  '990000000000000002',
  '990000000000000001',
  '2026-01-02 00:00:00+00',
  'authorized content',
  4,
  2
);

SELECT public.tombstone_policy_account('990000000000000001');

SELECT is(
  (SELECT is_tombstone FROM public.all_account WHERE account_id = '990000000000000001'),
  true,
  'an account can be reduced to a policy tombstone'
);

SELECT is(
  (SELECT is_tombstone FROM public.tweets WHERE tweet_id = '990000000000000002'),
  true,
  'a tweet can be reduced to a policy tombstone'
);

SELECT throws_ok(
  $$
    UPDATE public.tweets
    SET full_text = 'must not survive'
    WHERE tweet_id = '990000000000000002'
  $$,
  '23514',
  NULL,
  'database constraints reject content-bearing tombstones'
);

UPDATE public.all_account
SET
  created_via = 'twitter_archive',
  username = '__pgtap_tombstone',
  created_at = '2026-01-01 00:00:00+00',
  account_display_name = 'Policy Test',
  is_tombstone = false
WHERE account_id = '990000000000000001';

UPDATE public.tweets
SET
  created_at = '2026-01-02 00:00:00+00',
  full_text = 'authorized content restored',
  favorite_count = 5,
  retweet_count = 3,
  is_tombstone = false
WHERE tweet_id = '990000000000000002';

SELECT is(
  (SELECT full_text FROM public.tweets WHERE tweet_id = '990000000000000002'),
  'authorized content restored',
  'an authorized import can hydrate the same tweet primary key'
);

SELECT is(
  (SELECT is_tombstone FROM public.all_account WHERE account_id = '990000000000000001'),
  false,
  'an authorized import can hydrate the same account primary key'
);

INSERT INTO tes.blocked_scraping_users (account_id, block_source)
VALUES ('990000000000000001', 'admin');

INSERT INTO public.optin (
  username,
  twitter_user_id,
  opted_in,
  explicit_optout
) VALUES (
  '__pgtap_tombstone',
  '990000000000000001',
  false,
  true
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM tes.blocked_scraping_users
    WHERE account_id = '990000000000000001'
  ),
  2,
  'administrator and explicit-optout blocks coexist independently'
);

UPDATE public.optin
SET opted_in = true, explicit_optout = false
WHERE username = '__pgtap_tombstone';

SELECT is(
  (
    SELECT count(*)::integer
    FROM tes.blocked_scraping_users
    WHERE account_id = '990000000000000001'
      AND block_source = 'explicit_optout'
  ),
  0,
  'opting in removes the consent-derived scrape block'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM tes.blocked_scraping_users
    WHERE account_id = '990000000000000001'
      AND block_source = 'admin'
  ),
  1,
  'opting in preserves an independent administrator block'
);

SELECT * FROM finish();

ROLLBACK;
