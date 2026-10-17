-- Propagate archive likes/follows deletions to the ClickHouse projection.
--
-- PostgreSQL cannot reach the loopback-only ClickHouse, so the three deletion
-- paths record a content-free request in the same transaction as their
-- PostgreSQL delete, without waiting for any lock. The archive processor
-- reads each request's account state under the account policy lock, deletes
-- the ClickHouse rows physically after releasing it, verifies none remain, and
-- only then marks the request completed. The three function bodies keep the
-- current production logic and add one enqueue call each; a SECURITY DEFINER
-- aggregate exposes the backlog to the metrics exporter.

SET lock_timeout TO '5s';

CREATE TABLE IF NOT EXISTS "private"."archive_clickhouse_graph_purge" (
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    "purge_scope" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "reason" "text" NOT NULL,
    "purge_state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "last_error_code" "text",
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "queued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "archive_clickhouse_graph_purge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "archive_clickhouse_graph_purge_account_id_check" CHECK (("account_id" ~ '^(0|[1-9][0-9]*)$'::"text")),
    CONSTRAINT "archive_clickhouse_graph_purge_scope_check" CHECK (((("purge_scope" = 'account'::"text") AND ("archive_upload_id" IS NULL) AND ("reason" = ANY (ARRAY['delete_user_archive'::"text", 'policy_tombstone'::"text"]))) OR (("purge_scope" = 'archive_upload'::"text") AND ("archive_upload_id" IS NOT NULL) AND ("reason" = 'delete_single_archive'::"text")))),
    CONSTRAINT "archive_clickhouse_graph_purge_state_check" CHECK (("purge_state" = ANY (ARRAY['pending'::"text", 'completed'::"text"]))),
    CONSTRAINT "archive_clickhouse_graph_purge_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "archive_clickhouse_graph_purge_error_code_check" CHECK ((("last_error_code" IS NULL) OR ("last_error_code" ~ '^[a-z0-9_]{1,80}$'::"text")))
);
ALTER TABLE "private"."archive_clickhouse_graph_purge" OWNER TO "postgres";
ALTER TABLE "private"."archive_clickhouse_graph_purge" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "private"."archive_clickhouse_graph_purge" FROM PUBLIC, "anon", "authenticated", "readclient", "service_role";
COMMENT ON TABLE "private"."archive_clickhouse_graph_purge" IS 'Content-free outbox of archive likes/follows deletions for the ClickHouse projection; drained by the archive processor under the account policy lock.';

CREATE INDEX IF NOT EXISTS "archive_clickhouse_graph_purge_pending_idx"
ON "private"."archive_clickhouse_graph_purge" ("next_attempt_at", "id")
WHERE ("purge_state" = 'pending'::"text");

CREATE OR REPLACE TRIGGER "update_archive_clickhouse_graph_purge_updated_at" BEFORE UPDATE ON "private"."archive_clickhouse_graph_purge" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE FUNCTION private.enqueue_archive_clickhouse_graph_purge(
  p_purge_scope text,
  p_account_id text,
  p_archive_upload_id bigint,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- ClickHouse stores UInt64 account IDs only. Legacy placeholders such as
  -- policy_unknown:* cannot own likes or follows there, and must never make
  -- a deletion or opt-out transaction fail.
  IF p_account_id IS NULL
     OR p_account_id !~ '^(0|[1-9][0-9]{0,19})$'
     OR p_account_id::numeric > 18446744073709551615 THEN
    RETURN;
  END IF;

  -- Every deletion gets its own request; requests are idempotent and the
  -- processor reads current state under the account policy lock when it runs
  -- one. Never wait for that lock here: API callers run with an 8-second
  -- lock_timeout, and a deletion must not fail because an upload is being
  -- processed.
  INSERT INTO private.archive_clickhouse_graph_purge (
    purge_scope,
    account_id,
    archive_upload_id,
    reason
  ) VALUES (
    p_purge_scope,
    p_account_id,
    p_archive_upload_id,
    p_reason
  );
END;
$$;

ALTER FUNCTION private.enqueue_archive_clickhouse_graph_purge(text, text, bigint, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enqueue_archive_clickhouse_graph_purge(text, text, bigint, text)
  FROM PUBLIC, anon, authenticated, readclient, service_role;

-- Exporter view of the purge backlog. RLS hides the outbox itself, so the
-- restricted monitoring role reads three aggregates through this function.
CREATE OR REPLACE FUNCTION private.community_archive_monitoring_graph_purge()
RETURNS TABLE (
  pending_requests double precision,
  oldest_pending_age_seconds double precision,
  max_attempts double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF session_user <> 'archive_metrics_exporter' THEN
    RAISE EXCEPTION 'monitoring function is restricted'
      USING ERRCODE = '42501';
  END IF;

  -- queued_at restarts when a backfill replays a request, so a replay does
  -- not look like an hour-old stall; failed attempts keep their age.
  RETURN QUERY
  SELECT
    COUNT(*)::double precision,
    COALESCE(EXTRACT(EPOCH FROM (now() - MIN(purge.queued_at))), 0)::double precision,
    COALESCE(MAX(purge.attempt_count), 0)::double precision
  FROM private.archive_clickhouse_graph_purge AS purge
  WHERE purge.purge_state = 'pending';
END;
$$;

ALTER FUNCTION private.community_archive_monitoring_graph_purge() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.community_archive_monitoring_graph_purge()
  FROM PUBLIC, anon, authenticated, readclient, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'archive_metrics_exporter'
  ) THEN
    GRANT EXECUTE
      ON FUNCTION private.community_archive_monitoring_graph_purge()
      TO archive_metrics_exporter;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."delete_user_archive"("p_account_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '20min'
    SET "search_path" TO ''
    AS $_$
DECLARE
    v_schema_name TEXT := 'public';
    v_archive_upload_ids BIGINT[];
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the account_id being deleted, unless postgres/service_role
    IF (current_role NOT IN ('postgres', 'service_role')) AND 
       (v_provider_id IS NULL OR v_provider_id != p_account_id) THEN
        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_account_id;
    END IF;

    SELECT ARRAY_AGG(id) INTO v_archive_upload_ids
    FROM public.archive_upload
    WHERE account_id = p_account_id;

    BEGIN
        -- Delete tweets and related data in correct order to handle foreign key constraints
        EXECUTE format('
            -- First delete from conversations since it references tweets
            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1) OR account_id = $2
            )
            DELETE FROM %I.conversations WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);

            -- Then delete other tweet-related data
            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1) OR account_id = $2
            )
            DELETE FROM %I.tweet_media WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);

            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1) OR account_id = $2
            )
            DELETE FROM %I.user_mentions WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);

            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1) OR account_id = $2
            )
            DELETE FROM %I.tweet_urls WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);

            -- Now we can safely delete the tweets
            DELETE FROM %I.tweets WHERE archive_upload_id = ANY($1) OR account_id = $2;

            -- Delete other related data
            DELETE FROM %I.likes WHERE archive_upload_id = ANY($1) OR account_id = $2;
            DELETE FROM %I.followers WHERE archive_upload_id = ANY($1) OR account_id = $2;
            DELETE FROM %I.following WHERE archive_upload_id = ANY($1) OR account_id = $2;
            DELETE FROM %I.all_profile WHERE account_id = $2;

            -- Delete any remaining tweet_media referencing these archive_uploads
            -- (catches orphaned rows not covered by the tweet_id-based delete above)
            DELETE FROM %I.tweet_media WHERE archive_upload_id = ANY($1);

            DELETE FROM %I.archive_upload WHERE id = ANY($1);

            -- Delete from ca_autorefresh before deleting account
            DELETE FROM ca_autorefresh.account_refresh_log WHERE account_id = $2;

            DELETE FROM %I.all_account WHERE account_id = $2;
        ',
        v_schema_name, v_schema_name, v_schema_name, v_schema_name,
        v_schema_name, v_schema_name, v_schema_name, v_schema_name,
        v_schema_name, v_schema_name, v_schema_name, v_schema_name,
        v_schema_name, v_schema_name, v_schema_name, v_schema_name,
        v_schema_name, v_schema_name)
        USING v_archive_upload_ids, p_account_id;

        -- ClickHouse keeps archive likes and follows; the archive processor
        -- removes them once this request is drained (see
        -- private.archive_clickhouse_graph_purge).
        PERFORM private.enqueue_archive_clickhouse_graph_purge(
            'account', p_account_id, NULL, 'delete_user_archive'
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error deleting archives for account %: %', p_account_id, SQLERRM;
        RAISE;
    END;
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."delete_single_archive"("p_account_id" "text", "p_archive_upload_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '20min'
    SET "search_path" TO ''
    AS $_$
DECLARE
    v_schema_name TEXT := 'public';
    v_provider_id TEXT;
    v_owner_account_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;

    -- Verify the JWT provider_id matches the account_id being deleted, unless postgres/service_role
    IF (current_role NOT IN ('postgres', 'service_role')) AND
       (v_provider_id IS NULL OR v_provider_id != p_account_id) THEN
        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_account_id;
    END IF;

    -- Verify the archive_upload belongs to this account
    SELECT account_id INTO v_owner_account_id
    FROM public.archive_upload
    WHERE id = p_archive_upload_id;

    IF v_owner_account_id IS NULL THEN
        RAISE EXCEPTION 'Archive upload % not found', p_archive_upload_id;
    END IF;

    IF v_owner_account_id != p_account_id THEN
        RAISE EXCEPTION 'Archive upload % does not belong to account %', p_archive_upload_id, p_account_id;
    END IF;

    BEGIN
        -- Delete tweets and related data for this single archive upload
        EXECUTE format('
            -- First delete from conversations since it references tweets
            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = $1
            )
            DELETE FROM %I.conversations WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);

            -- Then delete other tweet-related data
            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = $1
            )
            DELETE FROM %I.tweet_media WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);

            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = $1
            )
            DELETE FROM %I.user_mentions WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);

            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = $1
            )
            DELETE FROM %I.tweet_urls WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);

            -- Delete the tweets
            DELETE FROM %I.tweets WHERE archive_upload_id = $1;

            -- Delete other related data
            DELETE FROM %I.likes WHERE archive_upload_id = $1;
            DELETE FROM %I.followers WHERE archive_upload_id = $1;
            DELETE FROM %I.following WHERE archive_upload_id = $1;

            -- Delete any remaining tweet_media referencing this archive_upload
            DELETE FROM %I.tweet_media WHERE archive_upload_id = $1;

            -- Re-point all_profile to another archive for this account (or null if none left)
            UPDATE %I.all_profile SET archive_upload_id = (
                SELECT id FROM %I.archive_upload WHERE account_id = $2 AND id != $1 ORDER BY created_at DESC LIMIT 1
            ) WHERE archive_upload_id = $1;

            -- Delete the archive_upload itself
            DELETE FROM %I.archive_upload WHERE id = $1;
        ',
        v_schema_name, v_schema_name, v_schema_name, v_schema_name,
        v_schema_name, v_schema_name, v_schema_name, v_schema_name,
        v_schema_name, v_schema_name, v_schema_name, v_schema_name,
        v_schema_name, v_schema_name, v_schema_name, v_schema_name,
        v_schema_name)
        USING p_archive_upload_id, p_account_id;

        -- Remove only this upload's ClickHouse likes and follows; edges that a
        -- retained upload also contains stay (see
        -- private.archive_clickhouse_graph_purge).
        PERFORM private.enqueue_archive_clickhouse_graph_purge(
            'archive_upload', p_account_id, p_archive_upload_id,
            'delete_single_archive'
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error deleting archive % for account %: %', p_archive_upload_id, p_account_id, SQLERRM;
        RAISE;
    END;
END;
$_$;

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
  v_archive_usernames text[];
  v_archive_username text;
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

  SELECT COALESCE(
    array_agg(DISTINCT BTRIM(username) ORDER BY BTRIM(username)),
    ARRAY[]::text[]
  )
  INTO v_archive_usernames
  FROM public.archive_upload
  WHERE account_id = p_account_id
    AND NULLIF(BTRIM(username), '') IS NOT NULL;

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

  -- Remove the account's ClickHouse likes and follows, and tombstone liked
  -- tweet text it authored, once the archive processor drains this request.
  PERFORM private.enqueue_archive_clickhouse_graph_purge(
    'account', p_account_id, NULL, 'policy_tombstone'
  );
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

  -- Never fall back to a full corpus scan inside an opt-out transaction. The
  -- release operator builds these exact-expression indexes concurrently.
  IF v_username ~ '^[A-Za-z0-9_]{1,15}$'
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_index AS candidate
       WHERE candidate.indexrelid = pg_catalog.to_regclass(
         'public.tweets_retweeted_username_lower_idx'
       )
         AND candidate.indisvalid
         AND candidate.indisready
     ) THEN
    UPDATE public.tweets
    SET full_text = ''
    WHERE account_id <> p_account_id
      AND full_text ~ '^RT @[A-Za-z0-9_]{1,15}:'
      AND lower(substring(
        full_text FROM '^RT @([A-Za-z0-9_]{1,15}):'
      )) = lower(v_username);
  END IF;

  UPDATE public.tweets
  SET reply_to_username = NULL
  WHERE account_id <> p_account_id
    AND reply_to_user_id = p_account_id;

  IF NULLIF(BTRIM(v_username), '') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_index AS candidate
       WHERE candidate.indexrelid = pg_catalog.to_regclass(
         'public.tweets_reply_to_username_lower_idx'
       )
         AND candidate.indisvalid
         AND candidate.indisready
     ) THEN
    UPDATE public.tweets
    SET reply_to_username = NULL
    WHERE account_id <> p_account_id
      AND reply_to_username IS NOT NULL
      AND lower(reply_to_username) = lower(v_username);
  END IF;

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
  WHERE user_id = p_account_id;

  IF NULLIF(BTRIM(v_username), '') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_index AS candidate
       WHERE candidate.indexrelid = pg_catalog.to_regclass(
         'public.mentioned_users_screen_name_lower_idx'
       )
         AND candidate.indisvalid
         AND candidate.indisready
     ) THEN
    UPDATE public.mentioned_users
    SET name = '', screen_name = '', is_tombstone = true
    WHERE screen_name <> ''
      AND lower(screen_name) = lower(v_username);
  END IF;

  -- Never sequential-scan the legacy liked-tweet table from an opt-out
  -- transaction. The release operator creates this index concurrently and
  -- reruns the blocked-account sweep before writers resume.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS candidate
    WHERE candidate.indexrelid = pg_catalog.to_regclass(
      'public.liked_tweets_author_account_id_idx'
    )
      AND candidate.indisvalid
      AND candidate.indisready
  ) THEN
    UPDATE public.liked_tweets
    SET full_text = '', is_tombstone = true
    WHERE author_account_id IS NOT NULL
      AND author_account_id = p_account_id;
  END IF;

  FOREACH v_archive_username IN ARRAY v_archive_usernames LOOP
    PERFORM public.enqueue_policy_archive_cleanup(
      p_account_id,
      v_archive_username,
      'Policy tombstone cleanup'
    );
  END LOOP;
  PERFORM public.enqueue_policy_archive_cleanup(
    p_account_id,
    v_username,
    'Policy tombstone cleanup'
  );
END;
$$;
