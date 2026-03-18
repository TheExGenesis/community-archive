-- Add delete_single_archive function for deleting individual archive uploads
-- Unlike delete_user_archive which deletes ALL archives for an account,
-- this function deletes a single archive_upload and its associated data,
-- preserving the user's account, profile, and other archives.

CREATE OR REPLACE FUNCTION public.delete_single_archive(p_account_id text, p_archive_upload_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '20min'
AS $function$
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
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error deleting archive % for account %: %', p_archive_upload_id, p_account_id, SQLERRM;
        RAISE;
    END;
END;
$function$;
