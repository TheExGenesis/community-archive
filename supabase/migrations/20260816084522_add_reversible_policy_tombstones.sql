-- Preserve structural tweet/account IDs for explicitly opted-out authors while
-- guaranteeing that content-bearing fields are absent. A later authorized
-- archive import can hydrate the same primary keys in place.

ALTER TABLE public.all_account
  ADD COLUMN IF NOT EXISTS is_tombstone boolean NOT NULL DEFAULT false;

ALTER TABLE public.tweets
  ADD COLUMN IF NOT EXISTS is_tombstone boolean NOT NULL DEFAULT false;

ALTER TABLE public.all_account
  DROP CONSTRAINT IF EXISTS all_account_policy_tombstone_is_minimal;
ALTER TABLE public.all_account
  ADD CONSTRAINT all_account_policy_tombstone_is_minimal CHECK (
    is_tombstone IS NOT TRUE
    OR (
      created_via = 'policy_tombstone'
      AND username = ''
      AND account_display_name = ''
      AND COALESCE(num_tweets, 0) = 0
      AND COALESCE(num_following, 0) = 0
      AND COALESCE(num_followers, 0) = 0
      AND COALESCE(num_likes, 0) = 0
    )
  );

ALTER TABLE public.tweets
  DROP CONSTRAINT IF EXISTS tweets_policy_tombstone_is_minimal;
ALTER TABLE public.tweets
  ADD CONSTRAINT tweets_policy_tombstone_is_minimal CHECK (
    is_tombstone IS NOT TRUE
    OR (
      full_text = ''
      AND favorite_count = 0
      AND COALESCE(retweet_count, 0) = 0
      AND reply_to_tweet_id IS NULL
      AND reply_to_user_id IS NULL
      AND reply_to_username IS NULL
      AND archive_upload_id IS NULL
    )
  );

COMMENT ON COLUMN public.all_account.is_tombstone IS
  'True for a policy-minimal account placeholder; authorized imports hydrate it in place.';
COMMENT ON COLUMN public.tweets.is_tombstone IS
  'True for a policy-minimal tweet placeholder containing stable IDs but no authored content.';

-- Tombstones are internal relationship anchors. Public readers continue to
-- see the existing missing-tweet placeholder rather than an empty database row.
DROP POLICY IF EXISTS "Data is publicly visible" ON public.all_account;
CREATE POLICY "Data is publicly visible"
  ON public.all_account FOR SELECT
  USING (is_tombstone IS NOT TRUE);

DROP POLICY IF EXISTS "anyone can read tweets" ON public.tweets;
CREATE POLICY "anyone can read tweets"
  ON public.tweets FOR SELECT
  USING (is_tombstone IS NOT TRUE);

CREATE OR REPLACE FUNCTION public.tombstone_policy_account(p_account_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '20min'
SET search_path = ''
AS $$
DECLARE
  v_provider_id text;
  v_archive_upload_ids bigint[];
  v_tweet_ids text[];
BEGIN
  IF p_account_id IS NULL OR BTRIM(p_account_id) = '' THEN
    RAISE EXCEPTION 'p_account_id is required';
  END IF;

  SELECT auth.jwt()->'app_metadata'->>'provider_id'
  INTO v_provider_id;

  IF current_role NOT IN ('postgres', 'service_role')
     AND (v_provider_id IS NULL OR v_provider_id <> p_account_id) THEN
    RAISE EXCEPTION
      'Unauthorized: provider_id % does not match account_id %',
      v_provider_id,
      p_account_id;
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::bigint[])
  INTO v_archive_upload_ids
  FROM public.archive_upload
  WHERE account_id = p_account_id;

  SELECT COALESCE(array_agg(tweet_id), ARRAY[]::text[])
  INTO v_tweet_ids
  FROM public.tweets
  WHERE account_id = p_account_id;

  DELETE FROM public.conversations
  WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.tweet_media
  WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.user_mentions
  WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.tweet_urls
  WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.quote_tweets
  WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.retweets
  WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM private.tweet_user
  WHERE tweet_id = ANY(v_tweet_ids);

  DELETE FROM public.likes
  WHERE account_id = p_account_id
     OR archive_upload_id = ANY(v_archive_upload_ids);
  DELETE FROM public.followers
  WHERE account_id = p_account_id
     OR archive_upload_id = ANY(v_archive_upload_ids);
  DELETE FROM public.following
  WHERE account_id = p_account_id
     OR archive_upload_id = ANY(v_archive_upload_ids);
  DELETE FROM public.all_profile
  WHERE account_id = p_account_id;

  UPDATE public.tweet_media
  SET archive_upload_id = NULL
  WHERE archive_upload_id = ANY(v_archive_upload_ids);
  UPDATE public.all_profile
  SET archive_upload_id = NULL
  WHERE archive_upload_id = ANY(v_archive_upload_ids);
  UPDATE public.tweets
  SET archive_upload_id = NULL
  WHERE archive_upload_id = ANY(v_archive_upload_ids);

  DELETE FROM public.archive_upload
  WHERE id = ANY(v_archive_upload_ids);
  DELETE FROM ca_autorefresh.account_refresh_log
  WHERE account_id = p_account_id;

  UPDATE public.tweets
  SET
    created_at = '1970-01-01 00:00:00+00',
    full_text = '',
    favorite_count = 0,
    retweet_count = 0,
    reply_to_tweet_id = NULL,
    reply_to_user_id = NULL,
    reply_to_username = NULL,
    archive_upload_id = NULL,
    is_tombstone = true
  WHERE account_id = p_account_id;

  UPDATE public.all_account
  SET
    created_via = 'policy_tombstone',
    username = '',
    created_at = '1970-01-01 00:00:00+00',
    account_display_name = '',
    num_tweets = 0,
    num_following = 0,
    num_followers = 0,
    num_likes = 0,
    is_tombstone = true
  WHERE account_id = p_account_id;
END;
$$;

ALTER FUNCTION public.tombstone_policy_account(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tombstone_policy_account(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tombstone_policy_account(text)
  TO service_role;

-- Track why an account is scrape-blocked. Consent-derived blocks can then be
-- removed on opt-in without weakening an independent administrator block.
ALTER TABLE tes.blocked_scraping_users
  ADD COLUMN IF NOT EXISTS block_source text;

UPDATE tes.blocked_scraping_users AS blocked
SET block_source = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.optin AS consent
    LEFT JOIN public.all_account AS account
      ON lower(account.username) = lower(consent.username)
    WHERE consent.explicit_optout IS TRUE
      AND COALESCE(
        NULLIF(BTRIM(consent.twitter_user_id), ''),
        account.account_id
      ) = blocked.account_id
  ) THEN 'explicit_optout'
  ELSE 'admin'
END
WHERE blocked.block_source IS NULL;

ALTER TABLE tes.blocked_scraping_users
  ALTER COLUMN block_source SET DEFAULT 'admin',
  ALTER COLUMN block_source SET NOT NULL;

ALTER TABLE tes.blocked_scraping_users
  DROP CONSTRAINT IF EXISTS blocked_scraping_users_block_source_check;
ALTER TABLE tes.blocked_scraping_users
  ADD CONSTRAINT blocked_scraping_users_block_source_check
  CHECK (block_source IN ('admin', 'explicit_optout'));

ALTER TABLE tes.blocked_scraping_users
  DROP CONSTRAINT IF EXISTS blocked_scraping_users_pkey;
ALTER TABLE tes.blocked_scraping_users
  ADD CONSTRAINT blocked_scraping_users_pkey
  PRIMARY KEY (account_id, block_source);

CREATE OR REPLACE FUNCTION public.propagate_explicit_optout_scrape_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_account_id text;
  v_old_account_id text;
BEGIN
  v_new_account_id := NULLIF(BTRIM(NEW.twitter_user_id), '');
  IF v_new_account_id IS NULL AND NULLIF(BTRIM(NEW.username), '') IS NOT NULL THEN
    SELECT account.account_id
    INTO v_new_account_id
    FROM public.all_account AS account
    WHERE lower(account.username) = lower(BTRIM(NEW.username))
    ORDER BY account.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_account_id := NULLIF(BTRIM(OLD.twitter_user_id), '');
    IF v_old_account_id IS NULL AND NULLIF(BTRIM(OLD.username), '') IS NOT NULL THEN
      SELECT account.account_id
      INTO v_old_account_id
      FROM public.all_account AS account
      WHERE lower(account.username) = lower(BTRIM(OLD.username))
      ORDER BY account.updated_at DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF v_old_account_id IS NOT NULL
       AND (
         NEW.explicit_optout IS NOT TRUE
         OR v_old_account_id IS DISTINCT FROM v_new_account_id
       ) THEN
      DELETE FROM tes.blocked_scraping_users
      WHERE account_id = v_old_account_id
        AND block_source = 'explicit_optout';
    END IF;
  END IF;

  IF NEW.explicit_optout IS TRUE AND v_new_account_id IS NOT NULL THEN
    INSERT INTO tes.blocked_scraping_users (account_id, block_source)
    VALUES (v_new_account_id, 'explicit_optout')
    ON CONFLICT (account_id, block_source) DO NOTHING;
  ELSIF v_new_account_id IS NOT NULL THEN
    DELETE FROM tes.blocked_scraping_users
    WHERE account_id = v_new_account_id
      AND block_source = 'explicit_optout';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.propagate_explicit_optout_scrape_block() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.propagate_explicit_optout_scrape_block()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_blocked_scraping_users(
  p_account_ids text[]
) RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    array_agg(DISTINCT blocked.account_id),
    ARRAY[]::text[]
  )
  FROM tes.blocked_scraping_users AS blocked
  WHERE p_account_ids IS NULL
     OR blocked.account_id = ANY(p_account_ids);
$$;

ALTER FUNCTION public.admin_list_blocked_scraping_users(text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_list_blocked_scraping_users(text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_blocked_scraping_users(text[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_scrape_block(
  p_account_id text,
  p_blocked boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_account_id IS NULL OR p_account_id = '' THEN
    RAISE EXCEPTION 'p_account_id is required';
  END IF;

  IF p_blocked THEN
    INSERT INTO tes.blocked_scraping_users (account_id, block_source)
    VALUES (p_account_id, 'admin')
    ON CONFLICT (account_id, block_source) DO NOTHING;
  ELSE
    DELETE FROM tes.blocked_scraping_users
    WHERE account_id = p_account_id
      AND block_source = 'admin';
  END IF;
END;
$$;

ALTER FUNCTION public.admin_set_scrape_block(text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_set_scrape_block(text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_scrape_block(text, boolean)
  TO service_role;
