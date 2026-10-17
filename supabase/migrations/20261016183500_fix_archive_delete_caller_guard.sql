-- Enforce the archive-delete caller guard.
--
-- delete_user_archive and delete_single_archive are SECURITY DEFINER functions
-- owned by postgres and executable by authenticated. Their guard exempted
-- callers whose current_role was postgres or service_role, but inside a
-- SECURITY DEFINER function current_role is always the owner, so the JWT
-- provider_id check never ran and any signed-in user could delete another
-- account's archives, likes and follows. A NULL p_account_id also slipped past
-- the `!=` comparison, and delete_single_archive then deleted the named upload
-- for whichever account owned it.
--
-- PostgREST connects as authenticator and sets request.jwt.claims on every
-- request, including its role claim. Privileged callers are now service_role
-- by that claim, or a direct postgres session with no request JWT; everyone
-- else must present app_metadata.provider_id equal to p_account_id. The bodies
-- are otherwise identical to 20261016180000_archive_clickhouse_graph_purge.sql,
-- including the ClickHouse graph purge requests. Ownership, grants and the
-- statement_timeout and search_path settings are unchanged.

SET lock_timeout TO '5s';

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
    
    -- Verify the JWT provider_id matches the account_id being deleted, unless
    -- the caller is service_role or a direct postgres session. current_role is
    -- always the owner inside SECURITY DEFINER, so identify the caller from the
    -- request JWT that PostgREST sets on every request instead.
    IF NOT (
           COALESCE(auth.jwt()->>'role', '') = 'service_role'
           OR (COALESCE(auth.jwt(), '{}'::jsonb) = '{}'::jsonb AND session_user = 'postgres')
       ) AND
       (v_provider_id IS NULL OR v_provider_id IS DISTINCT FROM p_account_id) THEN
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

    -- Verify the JWT provider_id matches the account_id being deleted, unless
    -- the caller is service_role or a direct postgres session. current_role is
    -- always the owner inside SECURITY DEFINER, so identify the caller from the
    -- request JWT that PostgREST sets on every request instead.
    IF NOT (
           COALESCE(auth.jwt()->>'role', '') = 'service_role'
           OR (COALESCE(auth.jwt(), '{}'::jsonb) = '{}'::jsonb AND session_user = 'postgres')
       ) AND
       (v_provider_id IS NULL OR v_provider_id IS DISTINCT FROM p_account_id) THEN
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
