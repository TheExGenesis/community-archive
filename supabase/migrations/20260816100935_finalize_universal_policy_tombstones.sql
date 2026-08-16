-- Remove the temporary fail-closed read overlay only after the resumable
-- operator has durably completed every phase and recorded a zero-violation
-- verification. A clean database bootstrap has no historical rows to reconcile.

SET lock_timeout TO '5s';
SET statement_timeout TO '2min';

DO $$
DECLARE
  v_job_name constant text := 'universal_policy_tombstones_v1';
  v_required_phases constant text[] := ARRAY[
    'indexes',
    'accounts',
    'tweets_authored',
    'tweets_retweet_payloads',
    'tweets_reply_usernames',
    'mentioned_users',
    'liked_tweets',
    'dependent_rows',
    'json_payloads',
    'archive_metadata',
    'verification'
  ];
  v_missing_phases text[];
  v_is_clean_bootstrap boolean;
  v_current_fingerprint text;
BEGIN
  -- Consent can still change through the web while ingestion writers are
  -- paused. Hold short SHARE locks until this migration commits so no opt-out
  -- can race the checkpoint validation or overlay removal.
  LOCK TABLE public.optin IN SHARE MODE;
  LOCK TABLE tes.blocked_scraping_users IN SHARE MODE;

  v_current_fingerprint := private.policy_authority_fingerprint();

  SELECT
    NOT EXISTS (SELECT 1 FROM public.all_account LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.tweets LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.liked_tweets LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.mentioned_users LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.all_profile LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.archive_upload LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.tweet_media LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.tweet_urls LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.digest_runs LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.digest_editions LIMIT 1)
  INTO v_is_clean_bootstrap;

  IF NOT v_is_clean_bootstrap THEN
    SELECT array_agg(required.phase ORDER BY required.ordinality)
    INTO v_missing_phases
    FROM unnest(v_required_phases) WITH ORDINALITY AS required(phase, ordinality)
    WHERE NOT EXISTS (
      SELECT 1
      FROM private.policy_historical_reconcile_progress AS progress
      WHERE progress.job_name = v_job_name
        AND progress.phase = required.phase
        AND progress.policy_version = v_job_name
        AND progress.policy_fingerprint = v_current_fingerprint
        AND progress.completed_at IS NOT NULL
        AND (
          required.phase <> 'verification'
          OR progress.rows_affected = 0
        )
    );

    IF COALESCE(cardinality(v_missing_phases), 0) > 0 THEN
      RAISE EXCEPTION
        'policy reconciliation is incomplete or nonzero: missing phases %',
        v_missing_phases
        USING ERRCODE = '55000';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM private.policy_backfill_progress AS progress
      WHERE progress.job_name = 'legacy_liked_tweets_v1'
        AND progress.completed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION
        'legacy liked-tweet reconciliation is incomplete'
        USING ERRCODE = '55000';
    END IF;
  ELSE
    -- A reset/new project has no corpus, so it can create the same indexes
    -- transactionally without the production lock/cost that necessitates the
    -- operator's CONCURRENTLY phase.
    CREATE INDEX IF NOT EXISTS liked_tweets_author_account_id_idx
      ON public.liked_tweets (author_account_id)
      WHERE author_account_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS mentioned_users_screen_name_lower_idx
      ON public.mentioned_users (lower(screen_name))
      WHERE screen_name <> '';
    CREATE INDEX IF NOT EXISTS tweets_reply_to_username_lower_idx
      ON public.tweets (lower(reply_to_username))
      WHERE reply_to_username IS NOT NULL;
    CREATE INDEX IF NOT EXISTS tweets_retweeted_username_lower_idx
      ON public.tweets (
        lower(substring(full_text FROM '^RT @([A-Za-z0-9_]{1,15}):'))
      )
      WHERE full_text ~ '^RT @[A-Za-z0-9_]{1,15}:';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_index AS candidate
    WHERE candidate.indexrelid = ANY (ARRAY[
      pg_catalog.to_regclass('public.liked_tweets_author_account_id_idx'),
      pg_catalog.to_regclass('public.mentioned_users_screen_name_lower_idx'),
      pg_catalog.to_regclass('public.tweets_reply_to_username_lower_idx'),
      pg_catalog.to_regclass('public.tweets_retweeted_username_lower_idx')
    ])
      AND candidate.indisvalid
      AND candidate.indisready
  ) <> 4 THEN
    RAISE EXCEPTION
      'policy reconciliation indexes are missing or invalid'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "policy reconciliation overlay" ON public.tweets;
DROP POLICY IF EXISTS "policy reconciliation overlay" ON public.all_account;
DROP POLICY IF EXISTS "policy reconciliation overlay" ON public.all_profile;
DROP POLICY IF EXISTS "policy reconciliation overlay" ON public.archive_upload;
DROP POLICY IF EXISTS "policy reconciliation overlay" ON public.mentioned_users;
DROP POLICY IF EXISTS "policy reconciliation overlay" ON public.liked_tweets;
DROP POLICY IF EXISTS "policy reconciliation overlay" ON public.tweet_media;
DROP POLICY IF EXISTS "policy reconciliation overlay" ON public.tweet_urls;
DROP POLICY IF EXISTS "policy reconciliation overlay" ON public.user_mentions;
DROP POLICY IF EXISTS "policy reconciliation overlay" ON public.profile_settings;
DROP POLICY IF EXISTS "policy reconciliation overlay" ON public.profile_curation;
DROP POLICY IF EXISTS "policy reconciliation overlay" ON public.digest_editions;

REVOKE EXECUTE ON FUNCTION public.policy_account_is_blocked(text, text)
  FROM PUBLIC, anon, authenticated, readclient;
REVOKE EXECUTE ON FUNCTION public.policy_json_contains_blocked_author(jsonb)
  FROM PUBLIC, anon, authenticated, readclient;

-- The two legacy rich-search implementations bypassed RLS as definers. Make
-- every public search overload an invoker before restoring only its established
-- API grants, so the cheap tombstone policies remain a permanent backstop.
ALTER FUNCTION public.search_tweets(
  text, text, text, date, date, integer, integer
) SECURITY INVOKER;
ALTER FUNCTION public.search_tweets(
  text, integer, text, timestamp without time zone,
  timestamp without time zone
) SECURITY INVOKER;
ALTER FUNCTION public.search_tweets_exact_phrase(
  text, text, text, date, date, integer, integer
) SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.search_tweets(
  text, text, text, date, date, integer, integer
) FROM PUBLIC, readclient;
GRANT EXECUTE ON FUNCTION public.search_tweets(
  text, text, text, date, date, integer, integer
) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.search_tweets(
  text, integer, text, timestamp without time zone,
  timestamp without time zone
) FROM PUBLIC, readclient;
GRANT EXECUTE ON FUNCTION public.search_tweets(
  text, integer, text, timestamp without time zone,
  timestamp without time zone
) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.search_tweets_exact_phrase(
  text, text, text, date, date, integer, integer
) FROM PUBLIC, readclient;
GRANT EXECUTE ON FUNCTION public.search_tweets_exact_phrase(
  text, text, text, date, date, integer, integer
) TO anon, authenticated, service_role;

-- Social-graph definers, liked-tweet search, legacy materialized payloads, raw
-- Storage, and Parquet remain closed. They are not made safe by this checkpoint.
DROP FUNCTION public.policy_historical_tweet_id_is_visible(text);
DROP FUNCTION public.policy_historical_tweet_is_visible(
  text, text, text, text, boolean
);

RESET statement_timeout;
RESET lock_timeout;
