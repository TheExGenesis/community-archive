CREATE OR REPLACE FUNCTION public.delete_user_archive(p_account_id TEXT)
RETURNS VOID AS $$
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
            DELETE FROM %I.likes WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.followers WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.following WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.all_profile WHERE account_id = $2;
            DELETE FROM %I.archive_upload WHERE id = ANY($1);
            DELETE FROM %I.all_account WHERE account_id = $2;
        ', 
        v_schema_name, v_schema_name, v_schema_name, v_schema_name, 
        v_schema_name, v_schema_name, v_schema_name, v_schema_name, 
        v_schema_name, v_schema_name, v_schema_name, v_schema_name,
        v_schema_name, v_schema_name, v_schema_name, v_schema_name)
        USING v_archive_upload_ids, p_account_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error deleting archives for account %: %', p_account_id, SQLERRM;
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout TO '20min';