CREATE OR REPLACE FUNCTION public.delete_all_archives(p_account_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_schema_name TEXT := 'public';
    v_archive_upload_ids BIGINT[];
BEGIN
    -- Get all archive_upload_ids for the account
    SELECT ARRAY_AGG(id) INTO v_archive_upload_ids
    FROM public.archive_upload
    WHERE account_id = p_account_id;

    -- Use a single transaction for all operations
    BEGIN
        EXECUTE format('
            -- Delete from dependent tables first
            DELETE FROM %I.tweet_media WHERE tweet_id IN (SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1));
            DELETE FROM %I.user_mentions WHERE tweet_id IN (SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1));
            DELETE FROM %I.tweet_urls WHERE tweet_id IN (SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1));
            DELETE FROM %I.tweets WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.likes WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.followers WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.following WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.profile WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.archive_upload WHERE id = ANY($1);
            DELETE FROM %I.account WHERE account_id = $2;
        ', v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name,
           v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name,
           v_schema_name, v_schema_name, v_schema_name)
        USING v_archive_upload_ids, p_account_id;
    EXCEPTION WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE NOTICE 'Error deleting archives for account %: %', p_account_id, SQLERRM;
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql
SET statement_timeout TO '20min';
