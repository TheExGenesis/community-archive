-- Drop the old function
DROP FUNCTION IF EXISTS public.delete_all_archives(TEXT);

-- Create the new function with the new name
CREATE OR REPLACE FUNCTION public.delete_user_archive(p_account_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_schema_name TEXT := 'public';
    v_archive_upload_ids BIGINT[];
BEGIN
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
            DELETE FROM %I.tweets WHERE archive_upload_id = ANY($1);

            -- Delete other related data
            DELETE FROM %I.likes WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.followers WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.following WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.profile WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.tweet_media WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.archive_upload WHERE id = ANY($1);
            DELETE FROM %I.account WHERE account_id = $2;
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