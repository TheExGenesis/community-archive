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
    v_count BIGINT;
    v_inserted BIGINT;
    v_total BIGINT;
BEGIN
    v_total_start := clock_timestamp();
    
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Use p_suffix as account_id
    v_account_id := p_suffix;
    
    -- Verify the JWT provider_id matches the account_id
    IF (v_provider_id IS NULL OR v_provider_id != v_account_id) 
       AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Unauthorized: provider_id %, account_id %, user %', 
            v_provider_id, v_account_id, current_user::text;
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
    LIMIT 1
    FOR UPDATE;

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
    -- Log count before insert
    EXECUTE format('SELECT COUNT(*) FROM temp.tweets_%s', p_suffix) INTO v_count;
    RAISE NOTICE 'About to insert % tweets', v_count;
    
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
    
    -- Log how many were actually inserted/updated
    EXECUTE format('
        SELECT 
            COUNT(*) FILTER (WHERE tweets.archive_upload_id = $1) as inserted,
            COUNT(*) FILTER (WHERE tweets.tweet_id IN (SELECT tweet_id FROM temp.tweets_%s)) as total
        FROM public.tweets
    ', p_suffix) USING v_archive_upload_id INTO v_inserted, v_total;
    RAISE NOTICE 'Inserted/Updated % out of % tweets', v_inserted, v_total;
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

