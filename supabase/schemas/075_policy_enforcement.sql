CREATE OR REPLACE FUNCTION public.policy_account_is_blocked(
  p_account_id text DEFAULT NULL,
  p_username text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tes.blocked_scraping_users AS blocked
    WHERE (
      NULLIF(BTRIM(p_account_id), '') IS NOT NULL
      AND blocked.account_id = BTRIM(p_account_id)
    ) OR (
      NULLIF(BTRIM(p_username), '') IS NOT NULL
      AND lower(blocked.username) = lower(BTRIM(p_username))
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.optin AS consent
    WHERE consent.explicit_optout IS TRUE
      AND (
        (
          NULLIF(BTRIM(p_account_id), '') IS NOT NULL
          AND consent.twitter_user_id = BTRIM(p_account_id)
        ) OR (
          NULLIF(BTRIM(p_username), '') IS NOT NULL
          AND lower(consent.username) = lower(BTRIM(p_username))
        )
      )
  );
$$;

ALTER FUNCTION public.policy_account_is_blocked(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.policy_account_is_blocked(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.policy_account_is_blocked(text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.policy_json_contains_blocked_author(
  p_payload jsonb
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT value #>> '{}' AS account_id, NULL::text AS username
      FROM jsonb_path_query(COALESCE(p_payload, '{}'::jsonb), 'lax $.**.accountId') AS value
      UNION ALL
      SELECT value #>> '{}', NULL::text
      FROM jsonb_path_query(COALESCE(p_payload, '{}'::jsonb), 'lax $.**.account_id') AS value
      UNION ALL
      SELECT NULL::text, value #>> '{}'
      FROM jsonb_path_query(COALESCE(p_payload, '{}'::jsonb), 'lax $.**.username') AS value
      UNION ALL
      SELECT NULL::text, value #>> '{}'
      FROM jsonb_path_query(COALESCE(p_payload, '{}'::jsonb), 'lax $.**.screen_name') AS value
    ) AS identity
    WHERE public.policy_account_is_blocked(
      identity.account_id,
      identity.username
    )
  );
$$;

ALTER FUNCTION public.policy_json_contains_blocked_author(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.policy_json_contains_blocked_author(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.policy_json_contains_blocked_author(jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.policy_blocked_account_id(p_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT candidate.account_id
  FROM (
    SELECT consent.twitter_user_id AS account_id, 1 AS priority
    FROM public.optin AS consent
    WHERE consent.explicit_optout IS TRUE
      AND lower(consent.username) = lower(BTRIM(p_username))
      AND NULLIF(BTRIM(consent.twitter_user_id), '') IS NOT NULL

    UNION ALL

    SELECT blocked.account_id, 2 AS priority
    FROM tes.blocked_scraping_users AS blocked
    WHERE lower(blocked.username) = lower(BTRIM(p_username))

    UNION ALL

    SELECT account.account_id, 3 AS priority
    FROM public.all_account AS account
    JOIN tes.blocked_scraping_users AS blocked
      ON blocked.account_id = account.account_id
    WHERE lower(account.username) = lower(BTRIM(p_username))
  ) AS candidate
  ORDER BY candidate.priority
  LIMIT 1;
$$;

ALTER FUNCTION public.policy_blocked_account_id(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.policy_blocked_account_id(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.policy_blocked_account_id(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.lock_policy_account(p_account_id text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_advisory_xact_lock(
    hashtextextended('community-archive-policy:' || COALESCE(p_account_id, ''), 0)
  );
$$;

ALTER FUNCTION public.lock_policy_account(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.lock_policy_account(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_policy_account(text) TO service_role;

CREATE OR REPLACE FUNCTION public.archive_upload_is_allowed(
  p_account_id text,
  p_username text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NULLIF(BTRIM(p_account_id), '') IS NOT NULL
     AND NULLIF(BTRIM(p_username), '') IS NOT NULL
     AND public.policy_account_is_blocked(p_account_id, p_username) IS NOT TRUE;
$$;

ALTER FUNCTION public.archive_upload_is_allowed(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.archive_upload_is_allowed(text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_archive_upload_allowed(
  p_account_id text,
  p_username text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_provider_id text := auth.jwt()->'app_metadata'->>'provider_id';
  v_username text := auth.jwt()->'app_metadata'->>'user_name';
BEGIN
  IF session_user <> 'postgres'
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND (
    NULLIF(BTRIM(v_provider_id), '') IS NULL
    OR v_provider_id <> p_account_id
    OR NULLIF(BTRIM(v_username), '') IS NULL
    OR lower(v_username) <> lower(p_username)
  ) THEN
    RAISE EXCEPTION 'archive identity does not match the authenticated account'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.archive_upload_is_allowed(p_account_id, p_username) THEN
    RAISE EXCEPTION 'archive owner is blocked by current policy'
      USING ERRCODE = '42501';
  END IF;

  RETURN true;
END;
$$;

ALTER FUNCTION public.assert_archive_upload_allowed(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assert_archive_upload_allowed(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_archive_upload_allowed(text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enqueue_policy_archive_cleanup(
  p_account_id text,
  p_username text,
  p_reason text DEFAULT 'Policy block'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key uuid;
BEGIN
  IF NULLIF(BTRIM(p_username), '') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT job.key
  INTO v_key
  FROM private.admin_jobs AS job
  WHERE job.job_name = 'admin_delete_with_export'
    AND job.status IN ('QUEUED', 'PROCESSING')
    AND lower(job.args->>'username') = lower(BTRIM(p_username))
  ORDER BY job.created_at
  LIMIT 1;

  IF v_key IS NOT NULL THEN
    RETURN v_key;
  END IF;

  INSERT INTO private.admin_jobs (job_name, status, args)
  VALUES (
    'admin_delete_with_export',
    'QUEUED',
    jsonb_strip_nulls(jsonb_build_object(
      'account_id', NULLIF(BTRIM(p_account_id), ''),
      'username', lower(BTRIM(p_username)),
      'reason', COALESCE(NULLIF(BTRIM(p_reason), ''), 'Policy block'),
      'enqueued_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ))
  )
  RETURNING key INTO v_key;

  RETURN v_key;
END;
$$;

ALTER FUNCTION public.enqueue_policy_archive_cleanup(text, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enqueue_policy_archive_cleanup(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_policy_archive_cleanup(text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_policy_account_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_block_source text;
BEGIN
  IF public.policy_account_is_blocked(NEW.account_id, NEW.username) THEN
    -- A username-only consent row must become a stable account-id policy
    -- association before this trigger blanks the username. Otherwise a later
    -- direct tweet insert could no longer discover the block.
    v_block_source := CASE WHEN EXISTS (
      SELECT 1
      FROM public.optin AS consent
      WHERE consent.explicit_optout IS TRUE
        AND (
          consent.twitter_user_id = NEW.account_id
          OR lower(consent.username) = lower(BTRIM(NEW.username))
        )
    ) OR EXISTS (
      SELECT 1
      FROM tes.blocked_scraping_users AS blocked
      WHERE blocked.account_id = NEW.account_id
        AND blocked.block_source = 'explicit_optout'
    ) THEN 'explicit_optout' ELSE 'admin' END;

    INSERT INTO tes.blocked_scraping_users (
      account_id, block_source, username
    ) VALUES (
      NEW.account_id, v_block_source, NULLIF(BTRIM(NEW.username), '')
    )
    ON CONFLICT (account_id, block_source) DO UPDATE
    SET username = COALESCE(
      NULLIF(BTRIM(tes.blocked_scraping_users.username), ''),
      EXCLUDED.username
    );

    NEW.created_via := 'policy_tombstone';
    NEW.username := '';
    NEW.created_at := '1970-01-01 00:00:00+00';
    NEW.account_display_name := '';
    NEW.num_tweets := 0;
    NEW.num_following := 0;
    NEW.num_followers := 0;
    NEW.num_likes := 0;
    NEW.is_tombstone := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_policy_tweet_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_retweeted_username text;
BEGIN
  IF public.policy_account_is_blocked(NEW.account_id, NULL) THEN
    NEW.created_at := '1970-01-01 00:00:00+00';
    NEW.full_text := '';
    NEW.favorite_count := 0;
    NEW.retweet_count := 0;
    NEW.reply_to_tweet_id := NULL;
    NEW.reply_to_user_id := NULL;
    NEW.reply_to_username := NULL;
    NEW.archive_upload_id := NULL;
    NEW.is_tombstone := true;
    RETURN NEW;
  END IF;

  v_retweeted_username := substring(NEW.full_text FROM '^RT @([A-Za-z0-9_]{1,15}):');
  IF v_retweeted_username IS NOT NULL
     AND public.policy_account_is_blocked(NULL, v_retweeted_username) THEN
    -- The row is the allowed account's retweet interaction, not a tombstone;
    -- remove only the blocked author's copied payload.
    NEW.full_text := '';
  END IF;

  IF public.policy_account_is_blocked(
    NEW.reply_to_user_id,
    NEW.reply_to_username
  ) THEN
    -- Preserve the stable reply relationship while removing blocked identity
    -- metadata copied onto the allowed outer tweet.
    NEW.reply_to_username := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_policy_mentioned_user_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.policy_account_is_blocked(NEW.user_id, NEW.screen_name) THEN
    NEW.name := '';
    NEW.screen_name := '';
    NEW.is_tombstone := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_policy_liked_tweet_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NULLIF(BTRIM(NEW.author_account_id), '') IS NULL
     OR public.policy_account_is_blocked(NEW.author_account_id, NULL) THEN
    NEW.full_text := '';
    NEW.is_tombstone := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_policy_blocked_account_detail()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id text := to_jsonb(NEW)->>TG_ARGV[0];
BEGIN
  IF public.policy_account_is_blocked(v_account_id, NULL) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_policy_tombstone_tweet_detail()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tweet_id text := to_jsonb(NEW)->>TG_ARGV[0];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tweets AS tweet
    WHERE tweet.tweet_id = v_tweet_id
      AND (
        tweet.is_tombstone IS TRUE
        OR public.policy_account_is_blocked(tweet.account_id, NULL)
      )
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_policy_blocked_json_payload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_index integer;
  v_payload jsonb;
BEGIN
  FOR v_index IN 0..TG_NARGS - 1 LOOP
    v_payload := to_jsonb(NEW)->TG_ARGV[v_index];
    IF public.policy_json_contains_blocked_author(v_payload) THEN
      RAISE EXCEPTION 'durable JSON payload contains a blocked author'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_policy_tombstone_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.is_tombstone IS TRUE THEN
    RAISE EXCEPTION 'policy tombstone % cannot be deleted',
      COALESCE(to_jsonb(OLD)->>'tweet_id', to_jsonb(OLD)->>'account_id')
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_policy_archive_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_username text;
BEGIN
  IF NEW.bucket_id <> 'archives' THEN
    RETURN NEW;
  END IF;
  v_username := (storage.foldername(NEW.name))[1];
  IF public.policy_account_is_blocked(NULL, v_username) THEN
    RAISE EXCEPTION 'raw archive object for blocked owner is forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_policy_block_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NULLIF(BTRIM(NEW.username), '') IS NULL THEN
    SELECT COALESCE(
      NULLIF(BTRIM(account.username), ''),
      NULLIF(BTRIM(consent.username), '')
    )
    INTO NEW.username
    FROM (SELECT NEW.account_id AS account_id) AS identity
    LEFT JOIN public.all_account AS account
      ON account.account_id = identity.account_id
    LEFT JOIN public.optin AS consent
      ON consent.twitter_user_id = identity.account_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_policy_block_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- A nested block write from enforce_policy_account_tombstone only records
  -- the stable-id association. The outer account trigger already scrubs that
  -- row, so avoid recursively upserting the same account.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  PERFORM public.lock_policy_account(NEW.account_id);
  PERFORM public.tombstone_policy_account(NEW.account_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tombstone_policy_account(p_account_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '20min'
SET search_path = ''
AS $$
DECLARE
  v_provider_id text;
  v_username text;
  v_archive_upload_ids bigint[];
  v_tweet_ids text[];
BEGIN
  IF p_account_id IS NULL OR BTRIM(p_account_id) = '' THEN
    RAISE EXCEPTION 'p_account_id is required';
  END IF;

  SELECT auth.jwt()->'app_metadata'->>'provider_id' INTO v_provider_id;
  IF current_role NOT IN ('postgres', 'service_role')
     AND (v_provider_id IS NULL OR v_provider_id <> p_account_id) THEN
    RAISE EXCEPTION
      'Unauthorized: provider_id % does not match account_id %',
      v_provider_id,
      p_account_id;
  END IF;

  SELECT COALESCE(
    NULLIF(BTRIM(account.username), ''),
    NULLIF(BTRIM(blocked.username), ''),
    NULLIF(BTRIM(consent.username), ''),
    NULLIF(BTRIM(archive.username), '')
  )
  INTO v_username
  FROM (SELECT p_account_id AS account_id) AS identity
  LEFT JOIN public.all_account AS account
    ON account.account_id = identity.account_id
  LEFT JOIN LATERAL (
    SELECT candidate.username
    FROM tes.blocked_scraping_users AS candidate
    WHERE candidate.account_id = identity.account_id
      AND NULLIF(BTRIM(candidate.username), '') IS NOT NULL
    LIMIT 1
  ) AS blocked ON true
  LEFT JOIN LATERAL (
    SELECT candidate.username
    FROM public.optin AS candidate
    WHERE candidate.twitter_user_id = identity.account_id
    ORDER BY candidate.updated_at DESC NULLS LAST
    LIMIT 1
  ) AS consent ON true
  LEFT JOIN LATERAL (
    SELECT candidate.username
    FROM public.archive_upload AS candidate
    WHERE candidate.account_id = identity.account_id
      AND NULLIF(BTRIM(candidate.username), '') IS NOT NULL
    ORDER BY candidate.id DESC
    LIMIT 1
  ) AS archive ON true;

  UPDATE tes.blocked_scraping_users
  SET username = v_username
  WHERE account_id = p_account_id
    AND NULLIF(BTRIM(username), '') IS NULL
    AND NULLIF(BTRIM(v_username), '') IS NOT NULL;

  SELECT COALESCE(array_agg(id), ARRAY[]::bigint[])
  INTO v_archive_upload_ids
  FROM public.archive_upload
  WHERE account_id = p_account_id;

  SELECT COALESCE(array_agg(tweet_id), ARRAY[]::text[])
  INTO v_tweet_ids
  FROM public.tweets
  WHERE account_id = p_account_id;

  DELETE FROM public.conversations WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.tweet_media WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.user_mentions WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.tweet_urls WHERE tweet_id = ANY(v_tweet_ids);
  -- Delete only relationships authored by the blocked outer tweet. Inbound
  -- allowed quote/retweet relationships keep pointing at the tombstone ID.
  DELETE FROM public.quote_tweets WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.retweets WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM private.tweet_user WHERE tweet_id = ANY(v_tweet_ids);

  DELETE FROM public.likes
  WHERE account_id = p_account_id
     OR archive_upload_id = ANY(v_archive_upload_ids);
  DELETE FROM public.followers
  WHERE account_id = p_account_id
     OR archive_upload_id = ANY(v_archive_upload_ids);
  DELETE FROM public.following
  WHERE account_id = p_account_id
     OR archive_upload_id = ANY(v_archive_upload_ids);
  DELETE FROM public.all_profile WHERE account_id = p_account_id;
  DELETE FROM public.profile_settings WHERE account_id = p_account_id;
  DELETE FROM public.profile_curation WHERE account_id = p_account_id;

  -- Legacy temporary rows and digest snapshots are durable JSON copies that
  -- bypass the normalized-table tombstone triggers. Remove or replace the
  -- complete snapshot when it contains any blocked nested author.
  IF to_regclass('private.archived_temporary_data') IS NOT NULL THEN
    EXECUTE
      'DELETE FROM private.archived_temporary_data AS archived '
      'WHERE archived.originator_id = $1 '
      'OR public.policy_json_contains_blocked_author(archived.data)'
    USING p_account_id;
  END IF;

  UPDATE public.digest_editions AS edition
  SET status = 'archived',
      published_at = NULL,
      content = jsonb_build_object(
        'policy_tombstone', true,
        'stable_account_id', p_account_id
      )
  WHERE public.policy_json_contains_blocked_author(edition.content);

  UPDATE public.digest_runs AS run
  SET candidates = '[]'::jsonb,
      model_request = NULL,
      raw_response = NULL,
      parsed_output = NULL,
      events = '[]'::jsonb,
      response_id = NULL,
      error = NULL
  WHERE public.policy_json_contains_blocked_author(
    jsonb_build_array(
      run.candidates,
      run.model_request,
      run.raw_response,
      run.parsed_output
    )
  );

  UPDATE public.tweet_media
  SET archive_upload_id = NULL
  WHERE archive_upload_id = ANY(v_archive_upload_ids);
  UPDATE public.all_profile
  SET archive_upload_id = NULL
  WHERE archive_upload_id = ANY(v_archive_upload_ids);
  UPDATE public.tweets
  SET archive_upload_id = NULL
  WHERE archive_upload_id = ANY(v_archive_upload_ids);

  DELETE FROM public.archive_upload WHERE id = ANY(v_archive_upload_ids);
  DELETE FROM ca_autorefresh.account_refresh_log WHERE account_id = p_account_id;

  UPDATE public.tweets
  SET created_at = '1970-01-01 00:00:00+00',
      full_text = '',
      favorite_count = 0,
      retweet_count = 0,
      reply_to_tweet_id = NULL,
      reply_to_user_id = NULL,
      reply_to_username = NULL,
      archive_upload_id = NULL,
      is_tombstone = true
  WHERE account_id = p_account_id;

  -- A Twitter archive retweet row is authored by the allowed retweeter but
  -- historically copied the original author's text. Preserve the allowed
  -- interaction row while removing a newly blocked author's copied payload.
  IF v_username ~ '^[A-Za-z0-9_]{1,15}$' THEN
    UPDATE public.tweets
    SET full_text = ''
    WHERE account_id <> p_account_id
      AND full_text ~* ('^RT @' || v_username || ':');
  END IF;

  UPDATE public.tweets
  SET reply_to_username = NULL
  WHERE account_id <> p_account_id
    AND (
      reply_to_user_id = p_account_id
      OR (
        NULLIF(BTRIM(v_username), '') IS NOT NULL
        AND lower(reply_to_username) = lower(v_username)
      )
    );

  INSERT INTO public.all_account (
    account_id,
    created_via,
    username,
    created_at,
    account_display_name,
    num_tweets,
    num_following,
    num_followers,
    num_likes,
    is_tombstone
  ) VALUES (
    p_account_id,
    'policy_tombstone',
    '',
    '1970-01-01 00:00:00+00',
    '',
    0,
    0,
    0,
    0,
    true
  )
  ON CONFLICT (account_id) DO UPDATE
  SET created_via = EXCLUDED.created_via,
      username = EXCLUDED.username,
      created_at = EXCLUDED.created_at,
      account_display_name = EXCLUDED.account_display_name,
      num_tweets = 0,
      num_following = 0,
      num_followers = 0,
      num_likes = 0,
      is_tombstone = true;

  UPDATE public.mentioned_users
  SET name = '', screen_name = '', is_tombstone = true
  WHERE user_id = p_account_id
     OR (
       NULLIF(BTRIM(v_username), '') IS NOT NULL
       AND lower(screen_name) = lower(v_username)
     );

  UPDATE public.liked_tweets
  SET full_text = '', is_tombstone = true
  WHERE author_account_id = p_account_id;

  IF to_regclass('public.account_activity_summary') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public.account_activity_summary;
  END IF;
  IF to_regclass('public.global_activity_summary') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public.global_activity_summary;
  END IF;
  IF to_regclass('public.monthly_tweet_counts_mv') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public.monthly_tweet_counts_mv;
  END IF;

  PERFORM public.enqueue_policy_archive_cleanup(
    p_account_id,
    v_username,
    'Policy tombstone cleanup'
  );
END;
$$;

ALTER FUNCTION public.tombstone_policy_account(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tombstone_policy_account(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tombstone_policy_account(text)
  TO service_role;
