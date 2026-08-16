BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(41);

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

UPDATE public.all_account
SET username = 'must_not_return',
    account_display_name = 'must not return',
    is_tombstone = false
WHERE account_id = '990000000000000001';

SELECT is(
  (SELECT is_tombstone FROM public.all_account WHERE account_id = '990000000000000001'),
  true,
  'a privileged direct account update cannot hydrate an active policy block'
);

INSERT INTO public.tweets (
  tweet_id, account_id, created_at, full_text, favorite_count, retweet_count
) VALUES (
  '990000000000000003', '990000000000000001', now(),
  'direct privileged write', 1, 1
);

SELECT is(
  (SELECT is_tombstone FROM public.tweets WHERE tweet_id = '990000000000000003'),
  true,
  'a privileged direct tweet insert becomes a stable tombstone'
);

SELECT is(
  (SELECT full_text FROM public.tweets WHERE tweet_id = '990000000000000003'),
  '',
  'a privileged direct tweet insert cannot retain blocked content'
);

-- A consent row may predate discovery of the stable Twitter account ID. The
-- first later account write must bind that username policy to the ID so every
-- subsequent writer remains fail closed after the username is blanked.
INSERT INTO public.optin (username, opted_in, explicit_optout)
VALUES ('__pgtap_username_only', false, true);
INSERT INTO public.all_account (
  account_id, created_via, username, created_at, account_display_name
) VALUES (
  '990000000000000004', 'manual_import', '__pgtap_username_only', now(),
  'must be scrubbed'
);
INSERT INTO public.tweets (
  tweet_id, account_id, created_at, full_text, favorite_count, retweet_count
) VALUES (
  '990000000000000005', '990000000000000004', now(),
  'must also be scrubbed', 0, 0
);

SELECT is(
  (SELECT is_tombstone FROM public.all_account WHERE account_id = '990000000000000004'),
  true,
  'a username-only opt-out tombstones the first later account write'
);

SELECT is(
  (SELECT is_tombstone FROM public.tweets WHERE tweet_id = '990000000000000005'),
  true,
  'the derived stable-ID block protects subsequent direct tweet writes'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM tes.blocked_scraping_users
    WHERE account_id = '990000000000000004'
      AND block_source = 'explicit_optout'
  ),
  1,
  'a username-only consent block is associated with the discovered stable ID'
);

INSERT INTO public.all_profile (account_id, bio)
VALUES ('990000000000000001', 'blocked profile content');
SELECT is(
  (SELECT count(*)::integer FROM public.all_profile WHERE account_id = '990000000000000001'),
  0,
  'dependent content writes for blocked accounts are discarded'
);

SELECT throws_ok(
  $$ DELETE FROM public.tweets WHERE tweet_id = '990000000000000003' $$,
  '42501',
  NULL,
  'stable tweet tombstones cannot be deleted'
);

-- Allowed outer tweet quoting and retweeting a blocked author. The allowed
-- interaction and inbound relationships survive; the blocked target is blank.
INSERT INTO public.all_account (
  account_id, created_via, username, created_at, account_display_name
) VALUES
  ('990000000000000010', 'twitter_import', '__pgtap_allowed_outer', now(), 'Allowed'),
  ('990000000000000011', 'twitter_import', '__pgtap_blocked_target', now(), 'Blocked');

INSERT INTO public.tweets (
  tweet_id, account_id, created_at, full_text, favorite_count, retweet_count,
  reply_to_user_id, reply_to_username
) VALUES
  ('990000000000000012', '990000000000000010', now(), 'allowed outer commentary', 0, 0, '990000000000000011', '__pgtap_blocked_target'),
  ('990000000000000014', '990000000000000010', now(), 'RT @__pgtap_blocked_target: blocked target payload', 0, 0, NULL, NULL),
  ('990000000000000013', '990000000000000011', now(), 'blocked target payload', 0, 0, NULL, NULL);

INSERT INTO public.quote_tweets (tweet_id, quoted_tweet_id)
VALUES ('990000000000000012', '990000000000000013');
INSERT INTO public.retweets (tweet_id, retweeted_tweet_id)
VALUES ('990000000000000014', '990000000000000013');

INSERT INTO tes.blocked_scraping_users (account_id, block_source)
VALUES ('990000000000000011', 'admin');

SELECT is(
  public.policy_json_contains_blocked_author(
    '{"nested":{"username":"__pgtap_blocked_target"}}'::jsonb
  ),
  true,
  'durable JSON sinks detect a nested blocked author'
);

SELECT is(
  (SELECT full_text FROM public.tweets WHERE tweet_id = '990000000000000012'),
  'allowed outer commentary',
  'allowed outer content survives a nested-author block'
);

SELECT is(
  (SELECT is_tombstone FROM public.tweets WHERE tweet_id = '990000000000000013'),
  true,
  'blocked quoted/retweeted target becomes a tombstone'
);

SELECT is(
  (SELECT full_text FROM public.tweets WHERE tweet_id = '990000000000000014'),
  '',
  'historical copied retweet payload is scrubbed while the allowed row survives'
);

SELECT is(
  (SELECT reply_to_user_id FROM public.tweets WHERE tweet_id = '990000000000000012'),
  '990000000000000011',
  'an allowed reply retains the blocked target stable account ID'
);

SELECT is(
  (SELECT reply_to_username FROM public.tweets WHERE tweet_id = '990000000000000012'),
  NULL::text,
  'an allowed reply drops blocked target username metadata'
);

SELECT is(
  (SELECT count(*)::integer FROM public.quote_tweets WHERE tweet_id = '990000000000000012'),
  1,
  'allowed quote relationship to a blocked tombstone is retained'
);

SELECT is(
  (SELECT count(*)::integer FROM public.retweets WHERE tweet_id = '990000000000000014'),
  1,
  'allowed retweet relationship to a blocked tombstone is retained'
);

-- Blocking the outer author removes only its outgoing relationship rows. An
-- independently allowed embedded tweet remains hydrated.
INSERT INTO public.all_account (
  account_id, created_via, username, created_at, account_display_name
) VALUES
  ('990000000000000020', 'twitter_import', '__pgtap_blocked_outer', now(), 'Blocked outer'),
  ('990000000000000021', 'twitter_import', '__pgtap_allowed_child', now(), 'Allowed child');

INSERT INTO public.tweets (
  tweet_id, account_id, created_at, full_text, favorite_count, retweet_count
) VALUES
  ('990000000000000022', '990000000000000020', now(), 'blocked outer payload', 0, 0),
  ('990000000000000023', '990000000000000021', now(), 'allowed embedded payload', 0, 0);

INSERT INTO public.quote_tweets (tweet_id, quoted_tweet_id)
VALUES ('990000000000000022', '990000000000000023');
INSERT INTO public.retweets (tweet_id, retweeted_tweet_id)
VALUES ('990000000000000022', '990000000000000023');

INSERT INTO tes.blocked_scraping_users (account_id, block_source)
VALUES ('990000000000000020', 'admin');

SELECT is(
  (SELECT is_tombstone FROM public.tweets WHERE tweet_id = '990000000000000022'),
  true,
  'a blocked outer tweet becomes a tombstone'
);

SELECT is(
  (SELECT full_text FROM public.tweets WHERE tweet_id = '990000000000000023'),
  'allowed embedded payload',
  'an allowed embedded tweet is retained when the outer author is blocked'
);

SELECT is(
  (SELECT count(*)::integer FROM public.quote_tweets WHERE tweet_id = '990000000000000022'),
  0,
  'a blocked outer quote relationship is detached'
);

SELECT is(
  (SELECT count(*)::integer FROM public.retweets WHERE tweet_id = '990000000000000022'),
  0,
  'a blocked outer retweet relationship is detached'
);

INSERT INTO public.all_account (
  account_id, created_via, username, created_at, account_display_name
) VALUES ('990000000000000030', 'twitter_import', '__pgtap_late_optout', now(), 'Late optout');
INSERT INTO public.tweets (
  tweet_id, account_id, created_at, full_text, favorite_count, retweet_count
) VALUES ('990000000000000031', '990000000000000030', now(), 'intake before optout', 0, 0);
INSERT INTO public.optin (
  username, twitter_user_id, opted_in, explicit_optout
) VALUES ('__pgtap_late_optout', '990000000000000030', false, true);

SELECT is(
  (SELECT is_tombstone FROM public.tweets WHERE tweet_id = '990000000000000031'),
  true,
  'an opt-out after intake synchronously tombstones PostgreSQL content'
);

INSERT INTO public.archive_upload (
  account_id, archive_at, username, upload_phase
) VALUES (
  '990000000000000030', now(), '__pgtap_late_optout', 'ready_for_commit'
);
SELECT is(
  (SELECT count(*)::integer FROM public.archive_upload WHERE account_id = '990000000000000030'),
  0,
  'archive metadata writes are discarded while the owner is blocked'
);

SELECT throws_ok(
  $$
    SELECT public.assert_archive_upload_allowed(
      '990000000000000030',
      '__pgtap_late_optout'
    )
  $$,
  '42501',
  NULL,
  'the canonical upload assertion rejects a blocked archive owner'
);

SELECT throws_ok(
  $$
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('archives', '__pgtap_late_optout/archive.json')
  $$,
  '42501',
  NULL,
  'a privileged raw Storage object write is rejected while blocked'
);

SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'archives'),
  false,
  'raw archives are not publicly addressable'
);

SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'enriched_tweets'),
  false,
  'the historical non-policy-aware Parquet bucket is private'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.account_activity_summary
    WHERE COALESCE(top_engaged_tweets::text, '') LIKE '%blocked target payload%'
       OR COALESCE(top_engaged_tweets::text, '') LIKE '%intake before optout%'
  ),
  0,
  'the refreshed historical materialized view contains no blocked tweet text'
);

SELECT is(
  has_table_privilege('anon', 'public.account_activity_summary', 'SELECT'),
  false,
  'the legacy content-bearing activity snapshot is not publicly readable'
);

INSERT INTO public.liked_tweets (tweet_id, full_text)
VALUES ('990000000000000040', 'unattributed liked payload');

SELECT ok(
  (
    SELECT is_tombstone IS TRUE AND full_text = ''
    FROM public.liked_tweets
    WHERE tweet_id = '990000000000000040'
  ),
  'unattributed liked tweets retain only a stable ID'
);

INSERT INTO public.mentioned_users (user_id, name, screen_name)
VALUES ('990000000000000011', 'Blocked name', '__pgtap_blocked_target')
ON CONFLICT (user_id) DO UPDATE
SET name = EXCLUDED.name, screen_name = EXCLUDED.screen_name;

SELECT ok(
  (
    SELECT is_tombstone IS TRUE AND name = '' AND screen_name = ''
    FROM public.mentioned_users
    WHERE user_id = '990000000000000011'
  ),
  'nested metadata for a blocked mentioned author is content-free'
);

SELECT has_table(
  'private',
  'policy_storage_objects',
  'durable Firehose objects have a content-free late-opt-out manifest'
);

SELECT hasnt_column(
  'private',
  'policy_storage_objects',
  'payload',
  'Storage reconciliation manifest cannot retain a payload'
);

SELECT hasnt_column(
  'private',
  'policy_storage_objects',
  'username',
  'Storage reconciliation manifest retains stable IDs rather than profile data'
);

SELECT * FROM finish();

ROLLBACK;
