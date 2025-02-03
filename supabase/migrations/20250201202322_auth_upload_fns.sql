CREATE OR REPLACE FUNCTION public.create_temp_tables(p_suffix TEXT)
RETURNS VOID AS $$
DECLARE
    v_provider_id TEXT;
BEGIN
    RAISE NOTICE 'create_temp_tables called with suffix: %', p_suffix;

    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Basic auth check
    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify the JWT provider_id matches the suffix
    IF v_provider_id IS NULL OR v_provider_id != p_suffix THEN
        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    -- Drop the temporary tables if they exist
    PERFORM public.drop_temp_tables(p_suffix);
    -- Create new tables
    EXECUTE format('CREATE TABLE temp.archive_upload_%s (LIKE public.archive_upload INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.account_%s (LIKE public.all_account INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.profile_%s (LIKE public.all_profile INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.tweets_%s (LIKE public.tweets INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.mentioned_users_%s (LIKE public.mentioned_users INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.user_mentions_%s (LIKE public.user_mentions INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.tweet_urls_%s (LIKE public.tweet_urls INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.tweet_media_%s (LIKE public.tweet_media INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.followers_%s (LIKE public.followers INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.following_%s (LIKE public.following INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.liked_tweets_%s (LIKE public.liked_tweets INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.likes_%s (LIKE public.likes INCLUDING ALL)', p_suffix);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.drop_temp_tables(p_suffix TEXT)
RETURNS VOID AS $$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Basic auth check
    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN
        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    RAISE NOTICE 'drop_temp_tables called with suffix: %', p_suffix;

    EXECUTE format('DROP TABLE IF EXISTS temp.account_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.archive_upload_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.profile_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.tweets_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.mentioned_users_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.user_mentions_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.tweet_urls_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.tweet_media_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.followers_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.following_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.liked_tweets_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.likes_%s', p_suffix);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Create or replace the commit_temp_data function
CREATE OR REPLACE FUNCTION public.commit_temp_data(p_suffix TEXT)
RETURNS VOID AS $$
DECLARE
    v_archive_upload_id BIGINT;
    v_account_id TEXT;
    v_archive_at TIMESTAMP WITH TIME ZONE;
    v_keep_private BOOLEAN;
    v_upload_likes BOOLEAN;
    v_start_date DATE;
    v_end_date DATE;
    v_phase_start TIMESTAMP;
    v_total_start TIMESTAMP;
    v_provider_id TEXT;
BEGIN
    v_total_start := clock_timestamp();
    
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Use p_suffix as account_id
    v_account_id := p_suffix;
    
    -- Verify the JWT provider_id matches the account_id
    IF v_provider_id IS NULL OR v_provider_id != v_account_id THEN
        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, v_account_id;
    END IF;

    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    RAISE NOTICE 'commit_temp_data called with suffix: %', p_suffix;
    
    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 1: Getting account and archive data';
    -- Remove the account_id query since we already have it
    RAISE NOTICE 'Phase 1 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 2: Getting archive upload data';
    -- Get the archive upload that's ready for commit
    SELECT id, archive_at, keep_private, upload_likes, start_date, end_date
    INTO v_archive_upload_id, v_archive_at, v_keep_private, v_upload_likes, v_start_date, v_end_date
    FROM public.archive_upload
    WHERE account_id = v_account_id
    AND upload_phase = 'ready_for_commit'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_archive_upload_id IS NULL THEN
        RAISE EXCEPTION 'No archive_upload found in ready_for_commit state for account %', v_account_id ;
    END IF;

    -- Update the upload phase to committing
    UPDATE public.archive_upload
    SET upload_phase = 'committing'
    WHERE id = v_archive_upload_id;

    RAISE NOTICE 'Phase 2 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 4: Inserting profile data';
    -- Insert profile data
    EXECUTE format('
        INSERT INTO public.all_profile (bio, website, location, avatar_media_url, header_media_url, account_id, archive_upload_id)
        SELECT p.bio, p.website, p.location, p.avatar_media_url, p.header_media_url, p.account_id, $1
        FROM temp.profile_%s p
        ON CONFLICT (account_id) DO UPDATE SET
            bio = EXCLUDED.bio,
            website = EXCLUDED.website,
            location = EXCLUDED.location,
            avatar_media_url = EXCLUDED.avatar_media_url,
            header_media_url = EXCLUDED.header_media_url,
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE NOTICE 'Phase 4 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 5: Inserting tweets data';
    -- Insert tweets data
    EXECUTE format('
        INSERT INTO public.tweets (tweet_id, account_id, created_at, full_text, retweet_count, favorite_count, reply_to_tweet_id, reply_to_user_id, reply_to_username, archive_upload_id)
        SELECT t.tweet_id, t.account_id, t.created_at, t.full_text, t.retweet_count, t.favorite_count, t.reply_to_tweet_id, t.reply_to_user_id, t.reply_to_username, $1
        FROM temp.tweets_%s t
        ON CONFLICT (tweet_id) DO UPDATE SET
            full_text = EXCLUDED.full_text,
            retweet_count = EXCLUDED.retweet_count,
            favorite_count = EXCLUDED.favorite_count,
            reply_to_tweet_id = EXCLUDED.reply_to_tweet_id,
            reply_to_user_id = EXCLUDED.reply_to_user_id,
            reply_to_username = EXCLUDED.reply_to_username,
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE NOTICE 'Phase 5 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 6: Inserting tweet media data';
    -- Insert tweet_media data
    EXECUTE format('
        INSERT INTO public.tweet_media (media_id, tweet_id, media_url, media_type, width, height, archive_upload_id)
        SELECT tm.media_id, tm.tweet_id, tm.media_url, tm.media_type, tm.width, tm.height, $1
        FROM temp.tweet_media_%s tm
        ON CONFLICT (media_id) DO UPDATE SET
            media_url = EXCLUDED.media_url,
            media_type = EXCLUDED.media_type,
            width = EXCLUDED.width,
            height = EXCLUDED.height,
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE NOTICE 'Phase 6 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 7: Inserting mentioned users data';
    -- Insert mentioned_users data
    EXECUTE format('
        INSERT INTO public.mentioned_users (user_id, name, screen_name, updated_at)
        SELECT user_id, name, screen_name, updated_at
        FROM temp.mentioned_users_%s
        ON CONFLICT (user_id) DO UPDATE SET
            name = EXCLUDED.name,
            screen_name = EXCLUDED.screen_name,
            updated_at = EXCLUDED.updated_at
    ', p_suffix);
    RAISE NOTICE 'Phase 7 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 8: Inserting user mentions data';
    -- Insert user_mentions data
    EXECUTE format('
        INSERT INTO public.user_mentions (mentioned_user_id, tweet_id)
        SELECT um.mentioned_user_id, um.tweet_id
        FROM temp.user_mentions_%s um
        JOIN public.mentioned_users mu ON um.mentioned_user_id = mu.user_id
        JOIN public.tweets t ON um.tweet_id = t.tweet_id
        ON CONFLICT (mentioned_user_id, tweet_id) DO NOTHING
    ', p_suffix);
    RAISE NOTICE 'Phase 8 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 9: Inserting tweet URLs data';
    -- Insert tweet_urls data
    EXECUTE format('
        INSERT INTO public.tweet_urls (url, expanded_url, display_url, tweet_id)
        SELECT tu.url, tu.expanded_url, tu.display_url, tu.tweet_id
        FROM temp.tweet_urls_%s tu
        JOIN public.tweets t ON tu.tweet_id = t.tweet_id
        ON CONFLICT (tweet_id, url) DO NOTHING
    ', p_suffix);
    RAISE NOTICE 'Phase 9 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 10: Inserting followers data';
    -- Insert followers data
    EXECUTE format('
        INSERT INTO public.followers (account_id, follower_account_id, archive_upload_id)
        SELECT f.account_id, f.follower_account_id, $1
        FROM temp.followers_%s f
        ON CONFLICT (account_id, follower_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE NOTICE 'Phase 10 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 11: Inserting following data';
    -- Insert following data
    EXECUTE format('
        INSERT INTO public.following (account_id, following_account_id, archive_upload_id)
        SELECT f.account_id, f.following_account_id, $1
        FROM temp.following_%s f
        ON CONFLICT (account_id, following_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE NOTICE 'Phase 11 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 12: Inserting liked tweets data';
    -- Insert liked_tweets data
    EXECUTE format('
        INSERT INTO public.liked_tweets (tweet_id, full_text)
        SELECT lt.tweet_id, lt.full_text
        FROM temp.liked_tweets_%s lt
        ON CONFLICT (tweet_id) DO NOTHING
    ', p_suffix);
    RAISE NOTICE 'Phase 12 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 13: Inserting likes data';
    -- Insert likes data
    EXECUTE format('
        INSERT INTO public.likes (account_id, liked_tweet_id, archive_upload_id)
        SELECT l.account_id, l.liked_tweet_id, $1
        FROM temp.likes_%s l
        ON CONFLICT (account_id, liked_tweet_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE NOTICE 'Phase 13 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 14: Dropping temporary tables';
    -- Drop temporary tables after committing
    PERFORM public.drop_temp_tables(p_suffix);
    RAISE NOTICE 'Phase 14 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 15: Updating upload phase to completed';
    -- Update upload_phase to 'completed' after successful execution
    UPDATE public.archive_upload
    SET upload_phase = 'completed'
    WHERE id = v_archive_upload_id;
    RAISE NOTICE 'Phase 15 completed in %', clock_timestamp() - v_phase_start;

    RAISE NOTICE 'Total execution time: %', clock_timestamp() - v_total_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout TO '30min';


-- select public.commit_temp_data('322603863');

CREATE OR REPLACE FUNCTION public.delete_user_archive(p_account_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_schema_name TEXT := 'public';
    v_archive_upload_ids BIGINT[];
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the account_id being deleted
    IF v_provider_id IS NULL OR v_provider_id != p_account_id THEN
        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, v_account_id;
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
            DELETE FROM %I.tweets WHERE archive_upload_id = ANY($1);

            -- Delete other related data
            DELETE FROM %I.likes WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.followers WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.following WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.all_profile WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.tweet_media WHERE archive_upload_id = ANY($1);
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
