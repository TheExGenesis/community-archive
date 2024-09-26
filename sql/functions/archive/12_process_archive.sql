CREATE OR REPLACE FUNCTION public.process_archive(archive_data JSONB)
RETURNS VOID AS $$
DECLARE
v_account_id TEXT;
v_suffix TEXT;
v_archive_upload_id BIGINT;
v_latest_tweet_date TIMESTAMP WITH TIME ZONE;
v_prepared_tweets JSONB;
v_user_id UUID;
BEGIN
-- Check if the user is authenticated or is the postgres role
v_user_id := auth.uid();
IF v_user_id IS NULL AND current_user != 'postgres' THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
-- Get the account_id from the archive data
v_account_id := (archive_data->'account'->0->'account'->>'accountId')::TEXT;
-- Check if the authenticated user has permission to process this archive
IF v_suffix != ((SELECT auth.jwt()) -> 'app_metadata' ->> 'provider_id') AND current_user != 'postgres' THEN
RAISE EXCEPTION 'Not authorized to process this archive';
END IF;
v_suffix := v_account_id;
v_prepared_tweets := (
SELECT jsonb_agg(
jsonb_set(
tweet->'tweet',
'{user_id}',
to_jsonb(v_account_id)
)
)
FROM jsonb_array_elements(archive_data->'tweets') AS tweet
);
SELECT MAX((tweet->>'created_at')::TIMESTAMP WITH TIME ZONE) INTO v_latest_tweet_date
FROM jsonb_array_elements(v_prepared_tweets) AS tweet;
-- Create temporary tables
PERFORM public.create_temp_tables(v_suffix);
-- Insert into temporary account table
PERFORM public.insert_temp_account(archive_data->'account'->0->'account', v_suffix);
-- Insert into temporary archive_upload table
SELECT public.insert_temp_archive_upload(v_account_id, v_latest_tweet_date, v_suffix) INTO v_archive_upload_id;
-- Insert into temporary profiles table
PERFORM public.insert_temp_profiles(
archive_data->'profile'->0->'profile',
v_account_id,
v_suffix
);
-- Insert tweets data
PERFORM public.insert_temp_tweets(v_prepared_tweets, v_suffix);
-- Process tweet entities and insert related data
PERFORM public.process_and_insert_tweet_entities(v_prepared_tweets, v_suffix);
-- Insert followers data
PERFORM public.insert_temp_followers(
archive_data->'follower',
v_account_id,
v_suffix
);
-- Insert following data
PERFORM public.insert_temp_following(
archive_data->'following',
v_account_id,
v_suffix
);
-- Insert likes data
PERFORM public.insert_temp_likes(
archive_data->'like',
v_account_id,
v_suffix
);
-- Commit to public tables
PERFORM public.commit_temp_data(v_suffix);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout TO '10min'; -- Set custom timeout
