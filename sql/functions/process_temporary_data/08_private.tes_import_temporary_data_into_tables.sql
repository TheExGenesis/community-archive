CREATE OR REPLACE FUNCTION private.tes_import_temporary_data_into_tables()
RETURNS void AS $$
DECLARE
    account_result RECORD;
    profile_result RECORD;
    tweet_result RECORD;
    media_result RECORD;
    url_result RECORD;
    mention_result RECORD;
BEGIN
    RAISE NOTICE 'Starting tes_import_temporary_data_into_tables';
    -- Process accounts and capture results
    SELECT * INTO account_result FROM private.tes_process_account_records();
    RAISE NOTICE 'Processed % accounts with % errors', account_result.processed, array_length(account_result.errors, 1);
    -- Process profiles and capture results  
    SELECT * INTO profile_result FROM private.tes_process_profile_records();
    RAISE NOTICE 'Processed % profiles with % errors', profile_result.processed, array_length(profile_result.errors, 1);
    -- Process tweets and capture results
    SELECT * INTO tweet_result FROM private.tes_process_tweet_records();
    RAISE NOTICE 'Processed % tweets with % errors', tweet_result.processed, array_length(tweet_result.errors, 1);
    -- Process media and capture results
    SELECT * INTO media_result FROM private.tes_process_media_records();
    RAISE NOTICE 'Processed % media with % errors', media_result.processed, array_length(media_result.errors, 1);
    -- Process urls and capture results
    SELECT * INTO url_result FROM private.tes_process_url_records();
    RAISE NOTICE 'Processed % urls with % errors', url_result.processed, array_length(url_result.errors, 1);
    -- Process mentions and capture results
    SELECT * INTO mention_result FROM private.tes_process_mention_records();
    RAISE NOTICE 'Processed % mentions with % errors', mention_result.processed, array_length(mention_result.errors, 1);
    PERFORM private.tes_complete_group_insertions();
    RAISE NOTICE 'Job completed';
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in tes_import_temporary_data_into_tables: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;
