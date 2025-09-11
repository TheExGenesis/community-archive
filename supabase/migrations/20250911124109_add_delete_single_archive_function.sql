-- Create function to delete a single archive by archive_upload_id
-- This function allows users to delete individual archives from their profile
CREATE OR REPLACE FUNCTION public.delete_single_user_archive(p_archive_upload_id BIGINT)
RETURNS VOID AS $$
DECLARE
    v_schema_name TEXT := 'public';
    v_user_id UUID;
    v_account_id TEXT;
BEGIN
    -- Check if the user owns this archive
    SELECT user_id, account_id INTO v_user_id, v_account_id
    FROM public.archive_upload
    WHERE id = p_archive_upload_id;

    -- Only allow deletion if the user owns the archive
    IF v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You can only delete your own archives';
    END IF;

    BEGIN
        -- Delete tweets and related data in correct order to handle foreign key constraints
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

            -- Now we can safely delete the tweets
            DELETE FROM %I.tweets WHERE archive_upload_id = $1;

            -- Delete other related data for this specific archive
            DELETE FROM %I.likes WHERE archive_upload_id = $1;
            DELETE FROM %I.followers WHERE archive_upload_id = $1;
            DELETE FROM %I.following WHERE archive_upload_id = $1;
            DELETE FROM %I.profile WHERE archive_upload_id = $1;
            DELETE FROM %I.tweet_media WHERE archive_upload_id = $1;
            
            -- Delete the archive upload record
            DELETE FROM %I.archive_upload WHERE id = $1;
            
            -- Check if this was the last archive for this account
            -- If so, delete the account record too
            IF NOT EXISTS (
                SELECT 1 FROM %I.archive_upload WHERE account_id = $2
            ) THEN
                DELETE FROM %I.account WHERE account_id = $2;
            END IF;
        ', 
        v_schema_name, v_schema_name, v_schema_name, v_schema_name, 
        v_schema_name, v_schema_name, v_schema_name, v_schema_name, 
        v_schema_name, v_schema_name, v_schema_name, v_schema_name,
        v_schema_name, v_schema_name, v_schema_name, v_schema_name,
        v_schema_name)
        USING p_archive_upload_id, v_account_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error deleting archive %: %', p_archive_upload_id, SQLERRM;
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout TO '20min';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_single_user_archive(BIGINT) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.delete_single_user_archive IS 'Deletes a single archive upload and all related data. Users can only delete their own archives.';