-- Consent remains authoritative in PostgreSQL, but active ingestion services
-- now resolve it once per batch immediately before writing the same policy-safe
-- input to PostgreSQL and ClickHouse. Remove the redundant row-level backstop:
-- it performed multiple consent/index lookups for every corpus row and child.

SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS enforce_policy_account_tombstone ON public.all_account;
DROP TRIGGER IF EXISTS enforce_policy_tweet_tombstone ON public.tweets;
DROP TRIGGER IF EXISTS protect_policy_tombstone_delete ON public.all_account;
DROP TRIGGER IF EXISTS protect_policy_tombstone_delete ON public.tweets;
DROP TRIGGER IF EXISTS enforce_policy_mentioned_user_tombstone ON public.mentioned_users;
DROP TRIGGER IF EXISTS enforce_policy_liked_tweet_tombstone ON public.liked_tweets;
DROP TRIGGER IF EXISTS enforce_policy_archive_object ON storage.objects;

DROP TRIGGER IF EXISTS reject_policy_blocked_account_detail ON public.all_profile;
DROP TRIGGER IF EXISTS reject_policy_blocked_account_detail ON public.archive_upload;
DROP TRIGGER IF EXISTS reject_policy_blocked_account_detail ON public.likes;
DROP TRIGGER IF EXISTS reject_policy_blocked_account_detail ON public.followers;
DROP TRIGGER IF EXISTS reject_policy_blocked_account_detail ON public.following;
DROP TRIGGER IF EXISTS reject_policy_blocked_account_detail ON public.profile_settings;
DROP TRIGGER IF EXISTS reject_policy_blocked_account_detail ON public.profile_curation;

DROP TRIGGER IF EXISTS reject_policy_tombstone_tweet_detail ON public.conversations;
DROP TRIGGER IF EXISTS reject_policy_tombstone_tweet_detail ON public.tweet_media;
DROP TRIGGER IF EXISTS reject_policy_tombstone_tweet_detail ON public.user_mentions;
DROP TRIGGER IF EXISTS reject_policy_tombstone_tweet_detail ON public.tweet_urls;
DROP TRIGGER IF EXISTS reject_policy_tombstone_tweet_detail ON public.quote_tweets;
DROP TRIGGER IF EXISTS reject_policy_tombstone_tweet_detail ON public.retweets;
DROP TRIGGER IF EXISTS reject_policy_tombstone_tweet_detail ON private.tweet_user;

DROP TRIGGER IF EXISTS reject_policy_blocked_json_payload ON public.digest_runs;
DROP TRIGGER IF EXISTS reject_policy_blocked_json_payload ON public.digest_editions;

DO $drop_retired_policy_trigger$
BEGIN
  IF to_regclass('private.archived_temporary_data') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS reject_policy_blocked_json_payload '
      'ON private.archived_temporary_data';
  END IF;
END
$drop_retired_policy_trigger$;

-- These rare event triggers intentionally remain:
-- - optin.propagate_explicit_optout_scrape_block
-- - blocked_scraping_users.capture_policy_block_username
-- - blocked_scraping_users.apply_policy_block_tombstone
-- They run only when policy state changes and synchronously scrub existing data.
