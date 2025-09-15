

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;









-- moved to 070_functions.sql: ca_website.compute_hourly_scraping_stats



-- moved to 070_functions.sql: private.archive_temp_data



/* CREATE OR REPLACE FUNCTION "private"."commit_temp_data_test"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '30min'
    AS $_$
DECLARE
    v_archive_upload_id BIGINT;
    v_account_id TEXT;
    v_archive_at TIMESTAMP WITH TIME ZONE;
    v_keep_private BOOLEAN;
    v_upload_likes BOOLEAN;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    RAISE NOTICE 'commit_temp_data called with suffix: %', p_suffix;
    
    RAISE NOTICE 'Phase 1: Inserting account data';
    -- 1. Insert account data first
    EXECUTE format('
        INSERT INTO public.all_account (
            created_via, username, account_id, created_at, account_display_name,
            num_tweets, num_following, num_followers, num_likes
        )
        SELECT 
            created_via, username, account_id, created_at, account_display_name,
            num_tweets, num_following, num_followers, num_likes
        FROM temp.account_%s
        ON CONFLICT (account_id) DO UPDATE SET
            username = EXCLUDED.username,
            account_display_name = EXCLUDED.account_display_name,
            created_via = EXCLUDED.created_via,
            created_at = EXCLUDED.created_at,
            num_tweets = EXCLUDED.num_tweets,
            num_following = EXCLUDED.num_following,
            num_followers = EXCLUDED.num_followers,
            num_likes = EXCLUDED.num_likes
        RETURNING account_id
    ', p_suffix) INTO v_account_id;

    RAISE NOTICE 'Phase 2: Getting archive upload data';
    -- 2. Get the latest archive upload data from temp.archive_upload
    EXECUTE format('
        SELECT archive_at, keep_private, upload_likes, start_date, end_date
        FROM temp.archive_upload_%s
        ORDER BY archive_at DESC
        LIMIT 1
    ', p_suffix) INTO v_archive_at, v_keep_private, v_upload_likes, v_start_date, v_end_date;

    RAISE NOTICE 'Phase 3: Inserting archive upload data';
    -- 3. Insert or update archive_upload and get the ID
    INSERT INTO public.archive_upload (
        account_id, 
        archive_at, 
        created_at, 
        keep_private, 
        upload_likes, 
        start_date, 
        end_date,
        upload_phase
    )
    VALUES (
        v_account_id, 
        v_archive_at, 
        CURRENT_TIMESTAMP, 
        v_keep_private, 
        v_upload_likes, 
        v_start_date, 
        v_end_date,
        'uploading'
    )
    ON CONFLICT (account_id, archive_at)
    DO UPDATE SET
        account_id = EXCLUDED.account_id,
        created_at = CURRENT_TIMESTAMP,
        keep_private = EXCLUDED.keep_private,
        upload_likes = EXCLUDED.upload_likes,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        upload_phase = 'uploading'
    RETURNING id INTO v_archive_upload_id;

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

    RAISE NOTICE 'Phase 9: Inserting tweet URLs data';
    -- Insert tweet_urls data
    EXECUTE format('
        INSERT INTO public.tweet_urls (url, expanded_url, display_url, tweet_id)
        SELECT tu.url, tu.expanded_url, tu.display_url, tu.tweet_id
        FROM temp.tweet_urls_%s tu
        JOIN public.tweets t ON tu.tweet_id = t.tweet_id
        ON CONFLICT (tweet_id, url) DO NOTHING
    ', p_suffix);

    RAISE NOTICE 'Phase 10: Inserting followers data';
    -- Insert followers data
    EXECUTE format('
        INSERT INTO public.followers (account_id, follower_account_id, archive_upload_id)
        SELECT f.account_id, f.follower_account_id, $1
        FROM temp.followers_%s f
        ON CONFLICT (account_id, follower_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;

    RAISE NOTICE 'Phase 11: Inserting following data';
    -- Insert following data
    EXECUTE format('
        INSERT INTO public.following (account_id, following_account_id, archive_upload_id)
        SELECT f.account_id, f.following_account_id, $1
        FROM temp.following_%s f
        ON CONFLICT (account_id, following_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;

    RAISE NOTICE 'Phase 12: Inserting liked tweets data';
    -- Insert liked_tweets data
    EXECUTE format('
        INSERT INTO public.liked_tweets (tweet_id, full_text)
        SELECT lt.tweet_id, lt.full_text
        FROM temp.liked_tweets_%s lt
        ON CONFLICT (tweet_id) DO NOTHING
    ', p_suffix);

    RAISE NOTICE 'Phase 13: Inserting likes data';
    -- Insert likes data
    EXECUTE format('
        INSERT INTO public.likes (account_id, liked_tweet_id, archive_upload_id)
        SELECT l.account_id, l.liked_tweet_id, $1
        FROM temp.likes_%s l
        ON CONFLICT (account_id, liked_tweet_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;

    RAISE NOTICE 'Phase 14: Dropping temporary tables';
    -- Drop temporary tables after committing
    PERFORM public.drop_temp_tables(p_suffix);

    RAISE NOTICE 'Phase 15: Updating upload phase to completed';
    -- Update upload_phase to 'completed' after successful execution
    UPDATE public.archive_upload
    SET upload_phase = 'completed'
    WHERE id = v_archive_upload_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Update upload_phase to 'failed' if an error occurs
        UPDATE public.archive_upload
        SET upload_phase = 'failed'
        WHERE id = v_archive_upload_id;
        RAISE;
END;
$_$;


ALTER FUNCTION "private"."commit_temp_data_test"("p_suffix" "text") OWNER TO "postgres";
*/
-- removed (test-only): private.commit_temp_data_test


-- moved to 070_functions.sql: private.count_liked_tweets_in_replies


-- moved to 070_functions.sql: private.get_provider_id


-- moved to 070_functions.sql: private.get_provider_id_internal


-- moved to 070_functions.sql: private.get_reply_to_user_counts


-- moved to 070_functions.sql: private.get_tweets_in_user_conversations


-- moved to 070_functions.sql: private.get_user_conversations


-- moved to 070_functions.sql: private.post_upload_update_conversation_ids


-- moved to 070_functions.sql: private.pretty_tweet_info


-- moved to 070_functions.sql: private.process_jobs



-- moved to 070_functions.sql: private.queue_archive_changes


-- moved to 070_functions.sql: private.queue_refresh_activity_summary


-- moved to 070_functions.sql: private.queue_update_conversation_ids


-- moved to 070_functions.sql: private.refresh_account_activity_summary


-- moved to 070_functions.sql: private.snapshot_pg_stat_statements


CREATE OR REPLACE FUNCTION "private"."tes_complete_group_insertions"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("completed" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    completed_count INTEGER := 0;
BEGIN
    BEGIN
        -- Identify originator_ids with only api% rows and inserted IS NULL
        WITH eligible_groups AS (
            SELECT originator_id
            FROM temporary_data
            WHERE inserted IS NULL
            AND timestamp < process_cutoff_time
            GROUP BY originator_id
            HAVING COUNT(*) FILTER (WHERE type NOT LIKE 'api%') = 0
        ),
        updates AS (
            UPDATE temporary_data td
            SET inserted = CURRENT_TIMESTAMP
            FROM eligible_groups eg
            WHERE td.originator_id = eg.originator_id
            AND td.type LIKE 'api%'
            AND td.inserted IS NULL
            AND td.timestamp < process_cutoff_time
            RETURNING td.originator_id
        )
        SELECT COUNT(DISTINCT u.originator_id), 
               ARRAY_AGG(DISTINCT u.originator_id)
        INTO completed_count
        FROM updates u;

        RETURN QUERY SELECT completed_count;

    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$;


ALTER FUNCTION "private"."tes_complete_group_insertions"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_import_temporary_data_into_tables"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    start_time TIMESTAMP;
    total_time INTERVAL;
    step_start TIMESTAMP;
    step_time INTERVAL;
    process_cutoff_time TIMESTAMP;
    account_result RECORD;
    profile_result RECORD;
    tweet_result RECORD;
    media_result RECORD;
    url_result RECORD;
    mention_result RECORD;
BEGIN
    -- Set aggressive memory settings for this function
    SET LOCAL work_mem = '32MB';  -- Increase from 5MB for better sorts
    SET LOCAL maintenance_work_mem = '256MB';  -- For any index operations
    SET LOCAL temp_buffers = '32MB';  -- For temporary tables
    
    start_time := clock_timestamp();
    RAISE NOTICE 'Starting tes_import_temporary_data_into_tables at %', start_time;
    
    -- Define a timestamp to ensure we only process records that existed when the function was called
    process_cutoff_time := clock_timestamp();
    
    step_start := clock_timestamp();
    SELECT * INTO account_result FROM private.tes_process_account_records(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'Account processing completed in %. Processed % records with % errors', 
        step_time, account_result.processed, array_length(account_result.errors, 1);

    step_start := clock_timestamp();
    SELECT * INTO profile_result FROM private.tes_process_profile_records(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'Profile processing completed in %. Processed % records with % errors', 
        step_time, profile_result.processed, array_length(profile_result.errors, 1);

    step_start := clock_timestamp();
    SELECT * INTO tweet_result FROM private.tes_process_tweet_records(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'Tweet processing completed in %. Processed % records with % errors', 
        step_time, tweet_result.processed, array_length(tweet_result.errors, 1);

    step_start := clock_timestamp();
    SELECT * INTO media_result FROM private.tes_process_media_records(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'Media processing completed in %. Processed % records with % errors', 
        step_time, media_result.processed, array_length(media_result.errors, 1);

    step_start := clock_timestamp();
    SELECT * INTO url_result FROM private.tes_process_url_records(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'URL processing completed in %. Processed % records with % errors', 
        step_time, url_result.processed, array_length(url_result.errors, 1);

    step_start := clock_timestamp();
    SELECT * INTO mention_result FROM private.tes_process_mention_records(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'Mention processing completed in %. Processed % records with % errors', 
        step_time, mention_result.processed, array_length(mention_result.errors, 1);

    step_start := clock_timestamp();
    PERFORM private.tes_complete_group_insertions(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'Group completion finished in %', step_time;

    total_time := clock_timestamp() - start_time;
    RAISE NOTICE 'Total job completed in %', total_time;

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in tes_import_temporary_data_into_tables: %', SQLERRM;
END;
$$;


ALTER FUNCTION "private"."tes_import_temporary_data_into_tables"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_invoke_edge_function_move_data_to_storage"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    request_id TEXT;
    response_status INTEGER;
    start_time TIMESTAMP;
    elapsed_seconds NUMERIC;
BEGIN
    PERFORM net.http_post(
        url:='https://fabxmporizzqflnftavs.supabase.co/functions/v1/schedule_data_moving'
    );
END;
$$;


ALTER FUNCTION "private"."tes_invoke_edge_function_move_data_to_storage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_account_records"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN

        WITH latest_records AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'account_id')::text 
                    ORDER BY (data->>'created_at')::timestamp with time zone DESC
                ) as rn
            FROM temporary_data 
            WHERE type = 'import_account' 
            AND (data->>'account_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
        ),
        insertions AS (
            INSERT INTO public.all_account
            SELECT 
                (data->>'account_id')::text,
                (data->>'created_via')::text,
                (data->>'username')::text,
                (data->>'created_at')::timestamp with time zone,
                (data->>'account_display_name')::text,
                NULLIF((data->>'num_tweets')::text, '')::integer,
                NULLIF((data->>'num_following')::text, '')::integer,
                NULLIF((data->>'num_followers')::text, '')::integer,
                NULLIF((data->>'num_likes')::text, '')::integer
            FROM latest_records
            WHERE rn = 1
            ON CONFLICT (account_id) 
            DO UPDATE SET
                username = EXCLUDED.username,
                created_at = EXCLUDED.created_at,
                account_display_name = EXCLUDED.account_display_name,
                num_tweets = EXCLUDED.num_tweets,
                num_following = EXCLUDED.num_following,
                num_followers = EXCLUDED.num_followers,
                num_likes = EXCLUDED.num_likes
            RETURNING account_id
        )
        SELECT array_agg(account_id) INTO processed_ids FROM insertions;

        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);

        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as account_id
        )
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        FROM processed_ids_table pit
        WHERE td.type = 'import_account' 
        AND (td.data->>'account_id')::text = pit.account_id
        AND td.timestamp < process_cutoff_time;
        
        -- Get error records
        SELECT array_agg((data->>'account_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_account'
        AND (data->>'account_id')::text IS NOT NULL
        AND inserted IS NULL
        AND timestamp < process_cutoff_time;

        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$;


ALTER FUNCTION "private"."tes_process_account_records"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_media_records"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN
        WITH latest_records AS (
            SELECT DISTINCT ON ((data->>'media_id')::text)
                (data->>'media_id')::bigint as media_id,
                (data->>'tweet_id')::text as tweet_id,
                (data->>'media_url')::text as media_url,
                (data->>'media_type')::text as media_type,
                (data->>'width')::integer as width,
                (data->>'height')::integer as height
            FROM temporary_data td
            LEFT JOIN private.import_errors ie ON
                ie.type = 'import_media' AND ie.type = td.type
                AND ie.originator_id = td.originator_id
                AND ie.item_id = td.item_id
            WHERE td.type = 'import_media'
            AND (td.data->>'media_id')::text IS NOT NULL
            AND td.inserted IS NULL
            AND td.timestamp < process_cutoff_time
            AND ie.id IS NULL
            ORDER BY (data->>'media_id')::text, td.timestamp DESC
        ),
        insertions AS (
            INSERT INTO public.tweet_media (
                media_id,
                tweet_id,
                media_url,
                media_type,
                width,
                height
            )
            SELECT 
                media_id,
                tweet_id,
                media_url,
                media_type,
                width,
                height
            FROM latest_records
            ON CONFLICT (media_id) 
            DO UPDATE SET
                tweet_id = EXCLUDED.tweet_id,
                media_url = EXCLUDED.media_url,
                media_type = EXCLUDED.media_type,
                width = EXCLUDED.width,
                height = EXCLUDED.height
            RETURNING media_id::text
        )
        SELECT array_agg(media_id) INTO processed_ids FROM insertions;
        
        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);
        
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        WHERE td.type = 'import_media'
        AND (td.data->>'media_id')::text = ANY(processed_ids)
        AND td.timestamp < process_cutoff_time;
        
        WITH error_scan AS (
            SELECT 
                (data->>'media_id')::text as error_id
            FROM temporary_data
            WHERE type = 'import_media'
            AND (data->>'media_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
        )
        SELECT array_agg(error_id)
        INTO error_records
        FROM error_scan;
        
        RETURN QUERY SELECT processed_count, COALESCE(error_records, ARRAY[]::TEXT[]);

    EXCEPTION WHEN OTHERS THEN
        -- Log unexpected errors (like foreign key violations) to import_errors
        WITH failed_records AS (
            SELECT 
                td.data->>'media_id' AS media_id,
                td.data->>'tweet_id' AS tweet_id,
                td.item_id,
                td.originator_id
            FROM temporary_data td 
            LEFT JOIN private.import_errors ie ON 
                ie.type = 'import_media' AND ie.type = td.type AND
                ie.originator_id = td.originator_id AND 
                ie.item_id = td.item_id
            WHERE td.type = 'import_media'
            AND td.data->>'media_id' IS NOT NULL
            AND td.inserted IS NULL
            AND td.timestamp < process_cutoff_time
            AND ie.id IS NULL
        ),
        validation_checks AS (
            SELECT 
                fr.media_id,
                fr.tweet_id,
                fr.originator_id,
                fr.item_id,
                NOT EXISTS (SELECT 1 FROM tweets t WHERE t.tweet_id = fr.tweet_id) AS missing_tweet
            FROM failed_records fr
        )
        INSERT INTO private.import_errors (
            type,
            originator_id,
            item_id,
            error_message
        )
        SELECT 
            'import_media',
            originator_id,
            item_id,
            CASE 
                WHEN missing_tweet THEN CONCAT('Tweet ID ', tweet_id, ' not found in tweets')
                ELSE SQLERRM
            END
        FROM validation_checks
        WHERE missing_tweet;

        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$;


ALTER FUNCTION "private"."tes_process_media_records"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_mention_records"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN
        -- First, insert or update the mentioned users
        WITH latest_records AS (
            SELECT td.*,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'mentioned_user_id')::text 
                    ORDER BY td.timestamp DESC
                ) as rn
            FROM temporary_data td
            LEFT JOIN private.import_errors ie ON 
                ie.type = 'import_mention' and ie.type = td.type
                AND ie.originator_id = td.originator_id
                AND ie.item_id = td.item_id
            WHERE td.type = 'import_mention'
            AND (td.data->>'mentioned_user_id')::text IS NOT NULL
            AND td.inserted IS NULL
            AND td.timestamp < process_cutoff_time
            AND ie.id IS NULL
        ),
        user_insertions AS (
            INSERT INTO public.mentioned_users (
                user_id,
                name,
                screen_name,
                updated_at
            )
            SELECT 
                (data->>'mentioned_user_id')::text,
                (data->>'display_name')::text,
                (data->>'username')::text,
                CURRENT_TIMESTAMP
            FROM latest_records
            WHERE rn = 1
            ON CONFLICT (user_id) 
            DO UPDATE SET
                name = EXCLUDED.name,
                screen_name = EXCLUDED.screen_name,
                updated_at = CURRENT_TIMESTAMP
        ),
        mention_insertions AS (
            INSERT INTO public.user_mentions (
                mentioned_user_id,
                tweet_id
            )
            SELECT DISTINCT
                (data->>'mentioned_user_id')::text,
                (data->>'tweet_id')::text
            FROM latest_records
            WHERE rn = 1
            ON CONFLICT (mentioned_user_id, tweet_id) 
            DO UPDATE SET
                mentioned_user_id = EXCLUDED.mentioned_user_id
            RETURNING mentioned_user_id
        )
        SELECT array_agg(mentioned_user_id) INTO processed_ids FROM mention_insertions;
        
        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);
        
        -- Update inserted timestamp
        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as mentioned_user_id
        )
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        FROM processed_ids_table pit
        WHERE td.type = 'import_mention' 
        AND (td.data->>'mentioned_user_id')::text = pit.mentioned_user_id
        AND td.timestamp < process_cutoff_time;
        
        -- Get error records
        SELECT array_agg((data->>'mentioned_user_id')::text || ':' || (data->>'tweet_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_mention'
        AND (data->>'mentioned_user_id')::text IS NOT NULL
        AND inserted IS NULL
        AND timestamp < process_cutoff_time;
        
        RETURN QUERY SELECT processed_count, error_records;
    
    EXCEPTION WHEN OTHERS THEN
        -- Insert failed records into import_errors table, but only for specific conditions
        WITH failed_records AS (
            SELECT 
                td.data->>'mentioned_user_id' AS mentioned_user_id,
                td.data->>'tweet_id' AS tweet_id,
                td.item_id, td.originator_id
    
            FROM temporary_data td 
            LEFT JOIN private.import_errors ie ON 
                ie.type = 'import_mention' AND
                ie.originator_id = td.originator_id AND 
                ie.item_id = td.item_id
            WHERE td.type = 'import_mention'
            AND td.data->>'mentioned_user_id' IS NOT NULL
            AND td.inserted IS NULL
            AND td.timestamp < process_cutoff_time
            AND ie.id IS NULL
        ),
        validation_checks AS (
            SELECT 
                fr.mentioned_user_id,
                fr.tweet_id,
                fr.originator_id,
                fr.item_id,
                NOT EXISTS (SELECT 1 FROM tweets t WHERE t.tweet_id = fr.tweet_id) AS missing_tweet
            FROM failed_records fr
        )
        INSERT INTO private.import_errors (
            type,
            originator_id,
            item_id,
            error_message
        )
        SELECT 
            'import_mention',
            originator_id,
            item_id,
            CASE 
                WHEN missing_tweet THEN CONCAT('Tweet ID ', tweet_id ,' not found in tweets')
                ELSE SQLERRM
            END
        FROM validation_checks
        WHERE missing_tweet;
        
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$;


ALTER FUNCTION "private"."tes_process_mention_records"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_profile_records"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN
        WITH latest_records AS (
            SELECT DISTINCT ON ((data->>'account_id')::text)
                data->>'account_id' as account_id,
                data->>'bio' as bio,
                data->>'website' as website,
                data->>'location' as location,
                data->>'avatar_media_url' as avatar_media_url,
                data->>'header_media_url' as header_media_url
            FROM temporary_data td
            LEFT JOIN private.import_errors ie ON
                ie.type = 'import_profile' AND ie.type = td.type
                AND ie.originator_id = td.originator_id
                AND ie.item_id = td.item_id
            WHERE td.type = 'import_profile'
            AND (td.data->>'account_id')::text IS NOT NULL
            AND td.inserted IS NULL
            AND td.timestamp < process_cutoff_time
            AND ie.id IS NULL
            ORDER BY (data->>'account_id')::text, td.timestamp DESC
        ),
        insertions AS (
            INSERT INTO public.all_profile (
                account_id,
                bio,
                website,
                location,
                avatar_media_url,
                header_media_url
            )
            SELECT 
                account_id,
                bio,
                website,
                location,
                avatar_media_url,
                header_media_url
            FROM latest_records
            ON CONFLICT (account_id) 
            DO UPDATE SET
                bio = EXCLUDED.bio,
                website = EXCLUDED.website,
                location = EXCLUDED.location,
                avatar_media_url = EXCLUDED.avatar_media_url,
                header_media_url = EXCLUDED.header_media_url
            RETURNING account_id
        )
        SELECT array_agg(DISTINCT account_id) INTO processed_ids FROM insertions;

        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);

        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        WHERE td.type = 'import_profile'
        AND (td.data->>'account_id')::text = ANY(processed_ids)
        AND td.timestamp < process_cutoff_time;

        WITH error_scan AS (
            SELECT 
                (data->>'account_id')::text as error_id
            FROM temporary_data
            WHERE type = 'import_profile'
            AND (data->>'account_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
        )
        SELECT array_agg(error_id)
        INTO error_records
        FROM error_scan;

        RETURN QUERY SELECT processed_count, COALESCE(error_records, ARRAY[]::TEXT[]);

    EXCEPTION WHEN OTHERS THEN
        -- Log unexpected errors (like foreign key violations) to import_errors
        WITH failed_records AS (
            SELECT 
                td.data->>'account_id' AS account_id,
                td.item_id,
                td.originator_id
            FROM temporary_data td 
            LEFT JOIN private.import_errors ie ON 
                ie.type = 'import_profile' AND ie.type = td.type AND
                ie.originator_id = td.originator_id AND 
                ie.item_id = td.item_id
            WHERE td.type = 'import_profile'
            AND td.data->>'account_id' IS NOT NULL
            AND td.inserted IS NULL
            AND td.timestamp < process_cutoff_time
            AND ie.id IS NULL
        ),
        validation_checks AS (
            SELECT 
                fr.account_id,
                fr.originator_id,
                fr.item_id,
                NOT EXISTS (SELECT 1 FROM public.all_account a WHERE a.account_id = fr.account_id) AS missing_account
            FROM failed_records fr
        )
        INSERT INTO private.import_errors (
            type,
            originator_id,
            item_id,
            error_message
        )
        SELECT 
            'import_profile',
            originator_id,
            item_id,
            CASE 
                WHEN missing_account THEN CONCAT('Account ID ', account_id, ' not found in all_account')
                ELSE SQLERRM
            END
        FROM validation_checks
        WHERE missing_account;

        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$;


ALTER FUNCTION "private"."tes_process_profile_records"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_tweet_records"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN
        WITH latest_records AS (
            SELECT DISTINCT ON ((data->>'tweet_id')::text)
                data->>'tweet_id' as tweet_id,
                data->>'account_id' as account_id,
                data->>'created_at' as created_at,
                data->>'full_text' as full_text,
                data->>'retweet_count' as retweet_count,
                data->>'favorite_count' as favorite_count,
                data->>'reply_to_tweet_id' as reply_to_tweet_id,
                data->>'reply_to_user_id' as reply_to_user_id,
                data->>'reply_to_username' as reply_to_username
            FROM temporary_data td
            LEFT JOIN private.import_errors ie ON
                ie.type = 'import_tweet' AND ie.type = td.type
                AND ie.originator_id = td.originator_id
                AND ie.item_id = td.item_id
            WHERE td.type = 'import_tweet'
                AND (td.data->>'tweet_id')::text IS NOT NULL
                AND td.inserted IS NULL
                AND td.timestamp < process_cutoff_time
                AND ie.id IS NULL
            ORDER BY (data->>'tweet_id')::text, td.timestamp DESC
        ),
        insertions AS (
            INSERT INTO public.tweets (
                tweet_id,
                account_id,
                created_at,
                full_text,
                retweet_count,
                favorite_count,
                reply_to_tweet_id,
                reply_to_user_id,
                reply_to_username
            )
            SELECT 
                tweet_id,
                account_id,
                (created_at)::timestamp with time zone,
                full_text,
                COALESCE((retweet_count)::integer, 0),
                COALESCE((favorite_count)::integer, 0),
                NULLIF(reply_to_tweet_id, ''),
                NULLIF(reply_to_user_id, ''),
                NULLIF(reply_to_username, '')
            FROM latest_records
            ON CONFLICT (tweet_id) 
            DO UPDATE SET
                account_id = EXCLUDED.account_id,
                created_at = EXCLUDED.created_at,
                full_text = EXCLUDED.full_text,
                retweet_count = EXCLUDED.retweet_count,
                favorite_count = EXCLUDED.favorite_count,
                reply_to_tweet_id = EXCLUDED.reply_to_tweet_id,
                reply_to_user_id = EXCLUDED.reply_to_user_id,
                reply_to_username = EXCLUDED.reply_to_username
            RETURNING tweet_id
        )
        SELECT array_agg(DISTINCT tweet_id) INTO processed_ids FROM insertions;

        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);

        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        WHERE td.type = 'import_tweet'
        AND (td.data->>'tweet_id')::text = ANY(processed_ids)
        AND td.timestamp < process_cutoff_time;

        WITH error_scan AS (
            SELECT 
                (data->>'tweet_id')::text as error_id
            FROM temporary_data
            WHERE type = 'import_tweet'
            AND (data->>'tweet_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
        )
        SELECT array_agg(error_id)
        INTO error_records
        FROM error_scan;

        RETURN QUERY SELECT processed_count, COALESCE(error_records, ARRAY[]::TEXT[]);

    EXCEPTION WHEN OTHERS THEN
        -- Log unexpected errors (like foreign key violations) to import_errors
        WITH failed_records AS (
            SELECT 
                td.data->>'tweet_id' AS tweet_id,
                td.data->>'account_id' AS account_id,
                td.item_id,
                td.originator_id
            FROM temporary_data td 
            LEFT JOIN private.import_errors ie ON 
                ie.type = 'import_tweet' AND ie.type = td.type AND
                ie.originator_id = td.originator_id AND 
                ie.item_id = td.item_id
            WHERE td.type = 'import_tweet'
            AND td.data->>'tweet_id' IS NOT NULL
            AND td.inserted IS NULL
            AND td.timestamp < process_cutoff_time
            AND ie.id IS NULL
        ),
        validation_checks AS (
            SELECT 
                fr.tweet_id,
                fr.account_id,
                fr.originator_id,
                fr.item_id,
                NOT EXISTS (SELECT 1 FROM public.all_account a WHERE a.account_id = fr.account_id) AS missing_account
            FROM failed_records fr
        )
        INSERT INTO private.import_errors (
            type,
            originator_id,
            item_id,
            error_message
        )
        SELECT 
            'import_tweet',
            originator_id,
            item_id,
            CASE 
                WHEN missing_account THEN CONCAT('Account ID ', account_id, ' not found in all_account')
                ELSE SQLERRM
            END
        FROM validation_checks
        WHERE missing_account;

        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$;


ALTER FUNCTION "private"."tes_process_tweet_records"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_unique_mention_record"("process_cutoff_time" timestamp without time zone, "target_originator_id" "text") RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
    total_records_found INTEGER := 0;
    latest_records_count INTEGER := 0;
    user_insertion_count INTEGER := 0;
    mention_insertion_count INTEGER := 0;
    update_count INTEGER := 0;
    error_insertion_count INTEGER := 0;
BEGIN
    -- Log function start
    RAISE NOTICE 'Starting tes_process_mention_records for originator_id: %, cutoff_time: %', 
        target_originator_id, process_cutoff_time;

    BEGIN
        -- Log initial record count for this originator
        SELECT COUNT(*) INTO total_records_found
        FROM temporary_data td
        LEFT JOIN private.import_errors ie ON 
            ie.type = 'import_mention' and ie.type = td.type
            AND ie.originator_id = td.originator_id
            AND ie.item_id = td.item_id
        WHERE td.type = 'import_mention'
        AND (td.data->>'mentioned_user_id')::text IS NOT NULL
        AND td.inserted IS NULL
        AND td.timestamp < process_cutoff_time
        AND td.originator_id = target_originator_id
        AND ie.id IS NULL;
        
        RAISE NOTICE 'Found % total unprocessed mention records for originator_id: %', 
            total_records_found, target_originator_id;
        
        -- If no records found, exit early
        IF total_records_found = 0 THEN
            RAISE NOTICE 'No mention records found for processing, returning early';
            RETURN QUERY SELECT 0, ARRAY[]::TEXT[];
            RETURN;
        END IF;

        -- Log start of processing
        RAISE NOTICE 'Starting mention processing for originator_id: %', target_originator_id;

        -- First, insert or update the mentioned users
        WITH latest_records AS (
            SELECT td.*,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'mentioned_user_id')::text 
                    ORDER BY td.timestamp DESC
                ) as rn
            FROM temporary_data td
            LEFT JOIN private.import_errors ie ON 
                ie.type = 'import_mention' and ie.type = td.type
                AND ie.originator_id = td.originator_id
                AND ie.item_id = td.item_id
            WHERE td.type = 'import_mention'
            AND (td.data->>'mentioned_user_id')::text IS NOT NULL
            AND td.inserted IS NULL
            AND td.timestamp < process_cutoff_time
            AND td.originator_id = target_originator_id
            AND ie.id IS NULL
        ),
        count_latest AS (
            SELECT COUNT(*) as cnt FROM latest_records WHERE rn = 1
        ),
        user_insertions AS (
            INSERT INTO public.mentioned_users (
                user_id,
                name,
                screen_name,
                updated_at
            )
            SELECT 
                (data->>'mentioned_user_id')::text,
                (data->>'display_name')::text,
                (data->>'username')::text,
                CURRENT_TIMESTAMP
            FROM latest_records
            WHERE rn = 1
            ON CONFLICT (user_id) 
            DO UPDATE SET
                name = EXCLUDED.name,
                screen_name = EXCLUDED.screen_name,
                updated_at = CURRENT_TIMESTAMP
            RETURNING user_id
        ),
        count_user_insertions AS (
            SELECT COUNT(*) as cnt FROM user_insertions
        ),
        mention_insertions AS (
            INSERT INTO public.user_mentions (
                mentioned_user_id,
                tweet_id
            )
            SELECT DISTINCT
                (data->>'mentioned_user_id')::text,
                (data->>'tweet_id')::text
            FROM latest_records
            WHERE rn = 1
            ON CONFLICT (mentioned_user_id, tweet_id) 
            DO UPDATE SET
                mentioned_user_id = EXCLUDED.mentioned_user_id
            RETURNING mentioned_user_id
        )
        SELECT 
            array_agg(mi.mentioned_user_id),
            (SELECT cnt FROM count_latest),
            (SELECT cnt FROM count_user_insertions),
            COUNT(*)
        INTO processed_ids, latest_records_count, user_insertion_count, mention_insertion_count
        FROM mention_insertions mi;
        
        RAISE NOTICE 'Found % latest records (after deduplication) for originator_id: %', 
            latest_records_count, target_originator_id;
        RAISE NOTICE 'Processed % mentioned_users for originator_id: %', 
            user_insertion_count, target_originator_id;
        RAISE NOTICE 'Processed % user_mentions for originator_id: %', 
            mention_insertion_count, target_originator_id;

        -- Handle case where no records were processed
        IF processed_ids IS NULL THEN
            RAISE NOTICE 'No mention records were inserted/updated for originator_id: %', 
                target_originator_id;
            processed_ids := ARRAY[]::TEXT[];
            processed_count := 0;
        ELSE
            SELECT COUNT(*) INTO processed_count FROM unnest(processed_ids);
            RAISE NOTICE 'Successfully processed % mention records for originator_id: %', 
                processed_count, target_originator_id;
        END IF;
        
        -- Log update operation start
        RAISE NOTICE 'Starting to mark % records as processed for originator_id: %', 
            processed_count, target_originator_id;

        -- Update inserted timestamp
        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as mentioned_user_id
        )
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        FROM processed_ids_table pit
        WHERE td.type = 'import_mention' 
        AND (td.data->>'mentioned_user_id')::text = pit.mentioned_user_id
        AND td.timestamp < process_cutoff_time
        AND td.originator_id = target_originator_id;

        GET DIAGNOSTICS update_count = ROW_COUNT;
        RAISE NOTICE 'Marked % temporary_data records as processed for originator_id: %', 
            update_count, target_originator_id;
        
        -- Log error scan start
        RAISE NOTICE 'Starting error scan for remaining unprocessed mention records for originator_id: %', 
            target_originator_id;

        -- Get error records
        SELECT array_agg((data->>'mentioned_user_id')::text || ':' || (data->>'tweet_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_mention'
        AND (data->>'mentioned_user_id')::text IS NOT NULL
        AND inserted IS NULL
        AND timestamp < process_cutoff_time
        AND originator_id = target_originator_id;
        
        IF error_records IS NOT NULL THEN
            RAISE NOTICE 'Found % error records for originator_id: %', 
                array_length(error_records, 1), target_originator_id;
        ELSE
            RAISE NOTICE 'No error records found for originator_id: %', target_originator_id;
            error_records := ARRAY[]::TEXT[];
        END IF;

        RAISE NOTICE 'Completing tes_process_mention_records for originator_id: % - processed: %, errors: %', 
            target_originator_id, processed_count, COALESCE(array_length(error_records, 1), 0);
        
        RETURN QUERY SELECT processed_count, error_records;
    
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'ERROR in tes_process_mention_records for originator_id: % - SQLSTATE: %, SQLERRM: %', 
            target_originator_id, SQLSTATE, SQLERRM;

        -- Insert failed records into import_errors table, but only for specific conditions
        WITH failed_records AS (
            SELECT 
                td.data->>'mentioned_user_id' AS mentioned_user_id,
                td.data->>'tweet_id' AS tweet_id,
                td.item_id, 
                td.originator_id
            FROM temporary_data td 
            LEFT JOIN private.import_errors ie ON 
                ie.type = 'import_mention' AND
                ie.originator_id = td.originator_id AND 
                ie.item_id = td.item_id
            WHERE td.type = 'import_mention'
            AND td.data->>'mentioned_user_id' IS NOT NULL
            AND td.inserted IS NULL
            AND td.timestamp < process_cutoff_time
            AND td.originator_id = target_originator_id
            AND ie.id IS NULL
        ),
        validation_checks AS (
            SELECT 
                fr.mentioned_user_id,
                fr.tweet_id,
                fr.originator_id,
                fr.item_id,
                NOT EXISTS (SELECT 1 FROM tweets t WHERE t.tweet_id = fr.tweet_id) AS missing_tweet
            FROM failed_records fr
        ),
        error_insertions AS (
            INSERT INTO private.import_errors (
                type,
                originator_id,
                item_id,
                error_message
            )
            SELECT 
                'import_mention',
                originator_id,
                item_id,
                CASE 
                    WHEN missing_tweet THEN CONCAT('Tweet ID ', tweet_id ,' not found in tweets')
                    ELSE SQLERRM
                END
            FROM validation_checks
            WHERE missing_tweet
            RETURNING id
        )
        SELECT COUNT(*) INTO error_insertion_count FROM error_insertions;

        RAISE NOTICE 'Inserted % error records into import_errors for originator_id: %', 
            error_insertion_count, target_originator_id;
        
        RETURN QUERY SELECT -1, ARRAY[format('SQLSTATE: %s, Error: %s', SQLSTATE, SQLERRM)];
    END;
END;
$$;


ALTER FUNCTION "private"."tes_process_unique_mention_record"("process_cutoff_time" timestamp without time zone, "target_originator_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_unique_tweet_record"("process_cutoff_time" timestamp without time zone, "target_originator_id" "text") RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
    total_records_found INTEGER := 0;
    latest_records_count INTEGER := 0;
    insertion_count INTEGER := 0;
    update_count INTEGER := 0;
BEGIN
    -- Log function start
    RAISE NOTICE 'Starting tes_process_tweet_records for originator_id: %, cutoff_time: %', 
        target_originator_id, process_cutoff_time;
    
    BEGIN
        -- Log initial record count for this originator
        SELECT COUNT(*) INTO total_records_found
        FROM temporary_data 
        WHERE type = 'import_tweet' 
        AND (data->>'tweet_id')::text IS NOT NULL
        AND inserted IS NULL
        AND timestamp < process_cutoff_time
        AND originator_id = target_originator_id;
        
        RAISE NOTICE 'Found % total unprocessed tweet records for originator_id: %', 
            total_records_found, target_originator_id;
        
        -- If no records found, exit early
        IF total_records_found = 0 THEN
            RAISE NOTICE 'No records found for processing, returning early';
            RETURN QUERY SELECT 0, ARRAY[]::TEXT[];
            RETURN;
        END IF;
       
        WITH latest_records AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'tweet_id')::text 
                    ORDER BY (data->>'created_at')::timestamp with time zone DESC
                ) as rn
            FROM temporary_data 
            WHERE type = 'import_tweet' 
            AND (data->>'tweet_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
            AND originator_id = target_originator_id
        ),
        count_latest AS (
            SELECT COUNT(*) as cnt FROM latest_records WHERE rn = 1
        ),
        insertions AS (
            INSERT INTO public.tweets (
                tweet_id,
                account_id,
                created_at,
                full_text,
                retweet_count,
                favorite_count,
                reply_to_tweet_id,
                reply_to_user_id,
                reply_to_username
            )
            SELECT 
                (data->>'tweet_id')::text,
                (data->>'account_id')::text,
                (data->>'created_at')::timestamp with time zone,
                (data->>'full_text')::text,
                COALESCE((data->>'retweet_count')::integer, 0),
                COALESCE((data->>'favorite_count')::integer, 0),
                NULLIF((data->>'reply_to_tweet_id')::text, ''),
                NULLIF((data->>'reply_to_user_id')::text, ''),
                NULLIF((data->>'reply_to_username')::text, '')
            FROM latest_records
            WHERE rn = 1
            ON CONFLICT (tweet_id) 
            DO UPDATE SET
                account_id = EXCLUDED.account_id,
                created_at = EXCLUDED.created_at,
                full_text = EXCLUDED.full_text,
                retweet_count = EXCLUDED.retweet_count,
                favorite_count = EXCLUDED.favorite_count,
                reply_to_tweet_id = EXCLUDED.reply_to_tweet_id,
                reply_to_user_id = EXCLUDED.reply_to_user_id,
                reply_to_username = EXCLUDED.reply_to_username
            RETURNING tweet_id
        )
        SELECT 
            array_agg(i.tweet_id), 
            (SELECT cnt FROM count_latest)
        INTO processed_ids, latest_records_count
        FROM insertions i;

        RAISE NOTICE 'Found % latest records (after deduplication) for originator_id: %', 
            latest_records_count, target_originator_id;

        -- Log insertion results
        IF processed_ids IS NOT NULL THEN
            SELECT COUNT(*) INTO insertion_count FROM unnest(processed_ids);
            RAISE NOTICE 'Successfully inserted/updated % tweet records for originator_id: %', 
                insertion_count, target_originator_id;
        ELSE
            RAISE NOTICE 'No tweet records were inserted/updated for originator_id: %', 
                target_originator_id;
            processed_ids := ARRAY[]::TEXT[];
            insertion_count := 0;
        END IF;

        processed_count := insertion_count;

        -- Log update operation start
        RAISE NOTICE 'Starting to mark % records as processed for originator_id: %', 
            processed_count, target_originator_id;

        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as tweet_id
        )
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        FROM processed_ids_table pit
        WHERE td.type = 'import_tweet' 
        AND (td.data->>'tweet_id')::text = pit.tweet_id
        AND td.timestamp < process_cutoff_time
        AND td.originator_id = target_originator_id;

        GET DIAGNOSTICS update_count = ROW_COUNT;
        RAISE NOTICE 'Marked % temporary_data records as processed for originator_id: %', 
            update_count, target_originator_id;

        -- Log error scan start
        RAISE NOTICE 'Starting error scan for remaining unprocessed records for originator_id: %', 
            target_originator_id;

        WITH error_scan AS (
            SELECT (data->>'tweet_id')::text as error_id,
                   count(*) OVER () as total_scanned
            FROM temporary_data
            WHERE type = 'import_tweet'
            AND (data->>'tweet_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
            AND originator_id = target_originator_id
        )
        SELECT array_agg(error_id)
        INTO error_records
        FROM error_scan;
        
        IF error_records IS NOT NULL THEN
            RAISE NOTICE 'Found % error records for originator_id: %', 
                array_length(error_records, 1), target_originator_id;
        ELSE
            RAISE NOTICE 'No error records found for originator_id: %', target_originator_id;
            error_records := ARRAY[]::TEXT[];
        END IF;

        RAISE NOTICE 'Completing tes_process_tweet_records for originator_id: % - processed: %, errors: %', 
            target_originator_id, processed_count, COALESCE(array_length(error_records, 1), 0);
        
        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'ERROR in tes_process_tweet_records for originator_id: % - SQLSTATE: %, SQLERRM: %', 
            target_originator_id, SQLSTATE, SQLERRM;
        RETURN QUERY SELECT -1, ARRAY[format('SQLSTATE: %s, Error: %s', SQLSTATE, SQLERRM)];
    END;
END;
$$;


ALTER FUNCTION "private"."tes_process_unique_tweet_record"("process_cutoff_time" timestamp without time zone, "target_originator_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_url_records"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN

        with latest_records AS (
            SELECT DISTINCT ON ((data->>'tweet_id')::text, (data->>'url')::text)
                data->>'url' as url,
                data->>'expanded_url' as expanded_url,
                data->>'display_url' as display_url,
                data->>'tweet_id' as tweet_id
            FROM temporary_data td
            LEFT JOIN private.import_errors ie ON
                ie.type = 'import_url' AND ie.type = td.type
                AND ie.originator_id = td.originator_id
                AND ie.item_id = td.item_id
            WHERE td.type = 'import_url'
                AND (td.data->>'tweet_id')::text IS NOT NULL
                AND td.inserted IS NULL
                AND td.timestamp < process_cutoff_time
                AND ie.id IS NULL
            ORDER BY (data->>'tweet_id')::text, (data->>'url')::text, td.timestamp DESC
        ),
        insertions AS (
            INSERT INTO public.tweet_urls (
                url,
                expanded_url,
                display_url,
                tweet_id
            )
            SELECT 
                url,
                expanded_url,
                display_url,
                tweet_id
            FROM latest_records
            ON CONFLICT (tweet_id, url) 
            DO UPDATE SET
                expanded_url = EXCLUDED.expanded_url,
                display_url = EXCLUDED.display_url
            RETURNING tweet_id
        )
        SELECT array_agg(DISTINCT tweet_id) INTO processed_ids FROM insertions;

        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);

        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        WHERE td.type = 'import_url'
        AND (td.data->>'tweet_id')::text = ANY(processed_ids)
        AND td.timestamp < process_cutoff_time;

        WITH error_scan AS (
            SELECT 
                (data->>'tweet_id')::text || ':' || (data->>'url')::text as error_id
            FROM temporary_data
            WHERE type = 'import_url'
            AND (data->>'tweet_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
        )
        SELECT array_agg(error_id)
        INTO error_records
        FROM error_scan;


        RETURN QUERY SELECT processed_count, COALESCE(error_records, ARRAY[]::TEXT[]);

    EXCEPTION WHEN OTHERS THEN
        -- Log unexpected errors (like foreign key violations) to import_errors
        WITH failed_records AS (
            SELECT 
                td.data->>'tweet_id' AS tweet_id,
                td.data->>'url' AS url,
                td.item_id,
                td.originator_id
            FROM temporary_data td 
            LEFT JOIN private.import_errors ie ON 
                ie.type = 'import_url' AND ie.type = td.type AND
                ie.originator_id = td.originator_id AND 
                ie.item_id = td.item_id
            WHERE td.type = 'import_url'
            AND td.data->>'tweet_id' IS NOT NULL
            AND td.inserted IS NULL
            AND td.timestamp < process_cutoff_time
            AND ie.id IS NULL
        ),
        validation_checks AS (
            SELECT 
                fr.tweet_id,
                fr.url,
                fr.originator_id,
                fr.item_id,
                NOT EXISTS (SELECT 1 FROM tweets t WHERE t.tweet_id = fr.tweet_id) AS missing_tweet
            FROM failed_records fr
        )
        INSERT INTO private.import_errors (
            type,
            originator_id,
            item_id,
            error_message
        )
        SELECT 
            'import_url',
            originator_id,
            item_id,
            CASE 
                WHEN missing_tweet THEN CONCAT('Tweet ID ', tweet_id, ' not found in tweets')
                ELSE SQLERRM
            END
        FROM validation_checks
        WHERE missing_tweet;

        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$;


ALTER FUNCTION "private"."tes_process_url_records"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


-- moved to 070_functions.sql: private.time_conversation_update


-- moved to 070_functions.sql: private.update_conversation_ids



-- moved to 070_functions.sql: private.update_conversation_ids_since



-- moved to 070_functions.sql: private.update_conversation_ids_since_v2


-- moved to 070_functions.sql: private.update_conversation_ids_since_v3


-- moved to 070_functions.sql: public.apply_public_entities_rls_policies


-- moved to 070_functions.sql: public.apply_public_liked_tweets_rls_policies


/* CREATE OR REPLACE FUNCTION "public"."apply_public_rls_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    policy_name TEXT;
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP; 

    -- Update the public visibility policy to check for keep_private more efficiently
    EXECUTE format('
        CREATE POLICY "Data is publicly visible" ON %I.%I
        FOR SELECT
        USING (true)', schema_name, table_name);

    -- The modification policy remains unchanged
    EXECUTE format('
        CREATE POLICY "Data is modifiable by their users" ON %I.%I TO authenticated 
        USING (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        ) 
        WITH CHECK (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        )', schema_name, table_name);
END;
$$;


ALTER FUNCTION "public"."apply_public_rls_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_public_rls_policies_not_private"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    policy_name TEXT;
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP; 

    EXECUTE format('CREATE POLICY "Data is publicly visible" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
    EXECUTE format('
        CREATE POLICY "Data is modifiable by their users" ON %I.%I TO authenticated 
        USING (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        ) 
        WITH CHECK (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        )', schema_name, table_name);
END;
$$;


ALTER FUNCTION "public"."apply_public_rls_policies_not_private"("schema_name" "text", "table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_readonly_rls_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    policy_name TEXT;
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP; 

    -- Only create read policy, writes will be handled by service role/postgres
    EXECUTE format('CREATE POLICY "Public read access" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
END;
$$;


ALTER FUNCTION "public"."apply_readonly_rls_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";
*/
-- moved to 070_functions.sql: public.apply_public_rls_policies
-- moved to 070_functions.sql: public.apply_public_rls_policies_not_private
-- moved to 070_functions.sql: public.apply_readonly_rls_policies


/* CREATE OR REPLACE FUNCTION "public"."commit_temp_data"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '30min'
    AS $_$
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
    FOR UPDATE SKIP LOCKED;

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
$_$;


ALTER FUNCTION "public"."commit_temp_data"("p_suffix" "text") OWNER TO "postgres";
*/
-- moved to 070_functions.sql: public.commit_temp_data


COMMENT ON FUNCTION "public"."commit_temp_data"("p_suffix" "text") IS 'Commits temporary data to permanent tables and handles upload options';



-- moved to 070_functions.sql: public.compute_hourly_scraping_stats


-- moved to 070_functions.sql: public.create_temp_tables


-- moved to 070_functions.sql: public.delete_tweets


/* CREATE OR REPLACE FUNCTION "public"."delete_user_archive"("p_account_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '20min'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."delete_user_archive"("p_account_id" "text") OWNER TO "postgres";
*/
-- moved to 070_functions.sql: public.delete_user_archive


/* CREATE OR REPLACE FUNCTION "public"."drop_all_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    policy_name TEXT;
BEGIN
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."drop_all_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";
*/
-- moved to 070_functions.sql: public.drop_all_policies


-- moved to 070_functions.sql: public.drop_temp_tables


-- moved to 070_functions.sql: public.get_account_most_liked_tweets_archive_users


-- moved to 070_functions.sql: public.get_account_most_mentioned_accounts


-- moved to 070_functions.sql: public.get_account_most_replied_tweets_by_archive_users


-- moved to 070_functions.sql: public.get_account_top_favorite_count_tweets


CREATE OR REPLACE FUNCTION "public"."get_account_top_retweet_count_tweets"("username_" "text", "limit_" integer) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "reply_to_user_id" "text", "reply_to_username" "text", "archive_upload_id" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tweet_id, 
        t.account_id, 
        t.created_at, 
        t.full_text, 
        t.retweet_count, 
        t.favorite_count, 
        t.reply_to_tweet_id, 
        t.reply_to_user_id, 
        t.reply_to_username, 
        t.archive_upload_id 
    FROM 
        public.tweets t 
    JOIN 
        public.account a ON t.account_id = a.account_id 
    WHERE 
        a.username = username_
    ORDER BY 
        t.retweet_count DESC 
    LIMIT 
        limit_;
END;
$$;


ALTER FUNCTION "public"."get_account_top_retweet_count_tweets"("username_" "text", "limit_" integer) OWNER TO "postgres";
-- moved to 070_functions.sql: public.get_account_top_retweet_count_tweets


-- moved to 070_functions.sql: public.get_hourly_scraping_stats


-- moved to 070_functions.sql: public.get_hourly_stats_simple


-- moved to 070_functions.sql: public.get_latest_tweets


-- moved to 070_functions.sql: public.get_main_thread


COMMENT ON FUNCTION "public"."get_main_thread"("p_conversation_id" "text") IS 'Returns the main thread view for a given conversation_id';



-- moved to 070_functions.sql: public.get_monthly_tweet_counts


-- moved to 070_functions.sql: public.get_monthly_tweet_counts_fast


-- moved to 070_functions.sql: public.get_most_liked_tweets_by_username


-- moved to 070_functions.sql: public.get_most_mentioned_accounts_by_username


CREATE OR REPLACE FUNCTION "public"."get_scraper_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") RETURNS TABLE("scraper_date" timestamp without time zone, "unique_scrapers" bigint)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    RAISE NOTICE 'Executing get_scraper_counts_by_granularity with start_date %, end_date %, and granularity %', start_date, end_date, granularity;
    
    -- Validate granularity parameter
    IF granularity NOT IN ('minute', 'hour', 'day', 'week', 'month', 'year') THEN
        RAISE EXCEPTION 'Invalid granularity. Must be "minute", "hour", "day", "week", "month", or "year".';
    END IF;

    -- Query private.tweet_user to get unique scraper counts by time interval
    -- Exclude system users and group by the specified time granularity
    RETURN QUERY EXECUTE format('
    SELECT 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'') AS scraper_date, 
        COUNT(DISTINCT user_id) AS unique_scrapers
    FROM 
        private.tweet_user 
    WHERE
        created_at >= $1
        AND created_at < $2
        AND user_id != ''system''
    GROUP BY 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'')
    ORDER BY 
        scraper_date
    ', granularity, granularity)
    USING start_date, end_date;
END;
$_$;


ALTER FUNCTION "public"."get_scraper_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") OWNER TO "postgres";


/* CREATE OR REPLACE FUNCTION "public"."get_simple_streamed_tweet_counts"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") RETURNS TABLE("tweet_date" timestamp without time zone, "tweet_count" bigint)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    -- Only support hour granularity for last day view
    IF granularity != 'hour' THEN
        RAISE EXCEPTION 'Only hour granularity is supported for simplified stream monitor';
    END IF;

    -- Only allow queries for the last 25 hours to keep it simple and fast
    IF start_date < (now() - interval '25 hours') THEN
        RAISE EXCEPTION 'Only queries for the last 25 hours are supported';
    END IF;

    RETURN QUERY EXECUTE format('
        SELECT 
            date_trunc(%L, created_at AT TIME ZONE ''UTC'') AS tweet_date, 
            COUNT(*) AS tweet_count 
        FROM 
            public.tweets 
        WHERE
            created_at >= $1
            AND created_at < $2
            AND archive_upload_id IS NULL
        GROUP BY 
            date_trunc(%L, created_at AT TIME ZONE ''UTC'')
        ORDER BY 
            tweet_date
        ', granularity, granularity)
        USING start_date, end_date;
END;
$_$;


ALTER FUNCTION "public"."get_simple_streamed_tweet_counts"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") OWNER TO "postgres";
*/
-- moved to 070_functions.sql: public.get_simple_streamed_tweet_counts


-- moved to 070_functions.sql: public.get_streaming_stats


-- moved to 070_functions.sql: public.get_streaming_stats_daily


-- moved to 070_functions.sql: public.get_streaming_stats_daily_streamed_only


-- moved to 070_functions.sql: public.get_streaming_stats_hourly


-- moved to 070_functions.sql: public.get_streaming_stats_hourly_streamed_only


-- moved to 070_functions.sql: public.get_streaming_stats_weekly


-- moved to 070_functions.sql: public.get_streaming_stats_weekly_streamed_only


-- moved to 031_functions_prereq.sql: get_top_accounts_with_followers


-- moved to 070_functions.sql: public.get_top_liked_users


-- moved to 031_functions_prereq.sql: get_top_mentioned_users


-- moved to 070_functions.sql: public.get_top_retweeted_tweets_by_username


-- moved to 070_functions.sql: public.get_trending_tweets


-- moved to 070_functions.sql: public.get_tweet_count_by_date (range)


CREATE OR REPLACE FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") RETURNS TABLE("tweet_date" timestamp without time zone, "tweet_count" bigint)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    IF granularity NOT IN ('day', 'week', 'month', 'year') THEN
        RAISE EXCEPTION 'Invalid granularity. Must be "day", "week", "month", or "year".';
    END IF;

    RETURN QUERY EXECUTE format('
    SELECT 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'') AS tweet_date, 
        COUNT(*) AS tweet_count 
    FROM 
        public.tweets 
    WHERE
        created_at >= $1
        AND created_at < $2 + INTERVAL ''1 %s''
    GROUP BY 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'')
    ORDER BY 
        tweet_date
    ', granularity, granularity, granularity)
    USING start_date, end_date;
END;
$_$;


ALTER FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tweet_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") RETURNS TABLE("tweet_date" timestamp without time zone, "tweet_count" bigint)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    RAISE NOTICE 'Executing get_tweet_counts_by_granularity with start_date %, end_date %, and granularity %', start_date, end_date, granularity;
    
    -- Updated to support minute and hour granularity
    IF granularity NOT IN ('minute', 'hour', 'day', 'week', 'month', 'year') THEN
        RAISE EXCEPTION 'Invalid granularity. Must be "minute", "hour", "day", "week", "month", or "year".';
    END IF;

    -- Fixed date range filtering to not add interval to end_date
    RETURN QUERY EXECUTE format('
    SELECT 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'') AS tweet_date, 
        COUNT(*) AS tweet_count 
    FROM 
        public.tweets 
    WHERE
        created_at >= $1
        AND created_at < $2
    GROUP BY 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'')
    ORDER BY 
        tweet_date
    ', granularity, granularity)
    USING start_date, end_date;
END;
$_$;


ALTER FUNCTION "public"."get_tweet_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unique_scraper_count"("start_date" timestamp with time zone, "end_date" timestamp with time zone) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'private', 'public'
    AS $$
DECLARE
  scraper_count bigint;
BEGIN
  -- Count unique user_ids from private.tweet_user table, excluding 'system'
  SELECT COUNT(DISTINCT user_id)
  INTO scraper_count
  FROM private.tweet_user
  WHERE created_at >= start_date
    AND created_at < end_date
    AND user_id != 'system';
  
  RETURN COALESCE(scraper_count, 0);
END;
$$;


ALTER FUNCTION "public"."get_unique_scraper_count"("start_date" timestamp with time zone, "end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
INSERT INTO temp.account_%s (
    account_id, created_via, username, created_at, account_display_name,
    num_tweets, num_following, num_followers, num_likes
)
SELECT
$1->>''accountId'',
$1->>''createdVia'',
$1->>''username'',
($1->>''createdAt'')::TIMESTAMP WITH TIME ZONE,
$1->>''accountDisplayName'',
COALESCE(($1->>''num_tweets'')::INTEGER, 0),
COALESCE(($1->>''num_following'')::INTEGER, 0),
COALESCE(($1->>''num_followers'')::INTEGER, 0),
COALESCE(($1->>''num_likes'')::INTEGER, 0)
', p_suffix)
USING p_account;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_keep_private" boolean, "p_upload_likes" boolean, "p_start_date" "date", "p_end_date" "date", "p_suffix" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_id BIGINT;
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
        INSERT INTO temp.archive_upload_%s (
            account_id,
            archive_at,
            keep_private,
            upload_likes,
            start_date,
            end_date
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
    ', p_suffix)
    USING
        p_account_id,
        p_archive_at,
        p_keep_private,
        p_upload_likes,
        p_start_date,
        p_end_date
    INTO v_id;

    RETURN v_id;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_keep_private" boolean, "p_upload_likes" boolean, "p_start_date" "date", "p_end_date" "date", "p_suffix" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_keep_private" boolean, "p_upload_likes" boolean, "p_start_date" "date", "p_end_date" "date", "p_suffix" "text") IS 'Inserts upload options into temporary archive_upload table';



CREATE OR REPLACE FUNCTION "public"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
INSERT INTO temp.followers_%s (account_id, follower_account_id, archive_upload_id)
SELECT
$2,
(follower->''follower''->>''accountId'')::TEXT,
-1
FROM jsonb_array_elements($1) AS follower
', p_suffix)
USING p_followers, p_account_id;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
INSERT INTO temp.following_%s (account_id, following_account_id, archive_upload_id)
SELECT
$2,
(following->''following''->>''accountId'')::TEXT,
-1
FROM jsonb_array_elements($1) AS following
', p_suffix)
USING p_following, p_account_id;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
INSERT INTO temp.liked_tweets_%s (tweet_id, full_text)
SELECT
(likes->''like''->>''tweetId'')::TEXT,
(likes->''like''->>''fullText'')::TEXT
FROM jsonb_array_elements($1) AS likes
ON CONFLICT (tweet_id) DO NOTHING
', p_suffix) USING p_likes;
    EXECUTE format('
INSERT INTO temp.likes_%s (account_id, liked_tweet_id, archive_upload_id)
SELECT
$2,
(likes->''like''->>''tweetId'')::TEXT,
-1
FROM jsonb_array_elements($1) AS likes
ON CONFLICT (account_id, liked_tweet_id) DO NOTHING
', p_suffix) USING p_likes, p_account_id;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
INSERT INTO temp.profile_%s (bio, website, location, avatar_media_url, header_media_url, account_id, archive_upload_id)
SELECT
($1->''description''->>''bio'')::TEXT,
($1->''description''->>''website'')::TEXT,
($1->''description''->>''location'')::TEXT,
($1->>''avatarMediaUrl'')::TEXT,
($1->>''headerMediaUrl'')::TEXT,
$2,
-1
', p_suffix) USING p_profile, p_account_id;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
INSERT INTO temp.tweets_%s (
tweet_id, account_id, created_at, full_text, retweet_count, favorite_count,
reply_to_tweet_id, reply_to_user_id, reply_to_username, archive_upload_id
)
SELECT
(tweet->>''id_str'')::TEXT,
(tweet->>''user_id'')::TEXT,
(tweet->>''created_at'')::TIMESTAMP WITH TIME ZONE,
(tweet->>''full_text'')::TEXT,
(tweet->>''retweet_count'')::INTEGER,
(tweet->>''favorite_count'')::INTEGER,
(tweet->>''in_reply_to_status_id_str'')::TEXT,
(tweet->>''in_reply_to_user_id_str'')::TEXT,
(tweet->>''in_reply_to_screen_name'')::TEXT,
-1
FROM jsonb_array_elements($1) AS tweet
', p_suffix) USING p_tweets;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Insert mentioned users
    EXECUTE format('
INSERT INTO temp.mentioned_users_%s (user_id, name, screen_name, updated_at)
SELECT DISTINCT
(mentioned_user->>''id_str'')::TEXT,
(mentioned_user->>''name'')::TEXT,
(mentioned_user->>''screen_name'')::TEXT,
NOW()
FROM jsonb_array_elements($1) AS tweet,
jsonb_array_elements(tweet->''entities''->''user_mentions'') AS mentioned_user
', p_suffix) USING p_tweets;
    -- Insert user mentions
    EXECUTE format('
INSERT INTO temp.user_mentions_%s (mentioned_user_id, tweet_id)
SELECT
(mentioned_user->>''id_str'')::TEXT,
(tweet->>''id_str'')::TEXT
FROM jsonb_array_elements($1) AS tweet,
jsonb_array_elements(tweet->''entities''->''user_mentions'') AS mentioned_user
', p_suffix) USING p_tweets;
    -- Insert tweet media
    EXECUTE format('
INSERT INTO temp.tweet_media_%s (media_id, tweet_id, media_url, media_type, width, height, archive_upload_id)
SELECT
(media->>''id_str'')::BIGINT,
(tweet->>''id_str'')::TEXT,
(media->>''media_url_https'')::TEXT,
(media->>''type'')::TEXT,
(media->''sizes''->''large''->>''w'')::INTEGER,
(media->''sizes''->''large''->>''h'')::INTEGER,
-1
FROM jsonb_array_elements($1) AS tweet,
jsonb_array_elements(tweet->''entities''->''media'') AS media
', p_suffix) USING p_tweets;
    -- Insert tweet URLs
    EXECUTE format('
INSERT INTO temp.tweet_urls_%s (url, expanded_url, display_url, tweet_id)
SELECT
(url->>''url'')::TEXT,
(url->>''expanded_url'')::TEXT,
(url->>''display_url'')::TEXT,
(tweet->>''id_str'')::TEXT
FROM jsonb_array_elements($1) AS tweet,
jsonb_array_elements(tweet->''entities''->''urls'') AS url
', p_suffix) USING p_tweets;
END;
$_$;


ALTER FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_archive"("archive_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '10min'
    AS $$
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
      IF v_suffix != (auth.jwt() -> 'app_metadata' ->> 'provider_id') AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authorized to process this archive';
      END IF;

      -- v_suffix := (archive_data->'account'->0->'account'->>'username')::TEXT;
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
  $$;


ALTER FUNCTION "public"."process_archive"("archive_data" "jsonb") OWNER TO "postgres";


-- moved to 070_functions.sql: public.search_tweets(sql variant)


-- moved to 070_functions.sql: public.search_tweets(plpgsql variant)


CREATE OR REPLACE FUNCTION "public"."sync_meta_data"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.raw_app_meta_data = jsonb_set(
        jsonb_set(
            COALESCE(NEW.raw_app_meta_data::jsonb, '{}'::jsonb),
            '{user_name}',
            NEW.raw_user_meta_data::jsonb->'user_name'
        ),
        '{provider_id}',
        NEW.raw_user_meta_data::jsonb->'provider_id'
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_meta_data"() OWNER TO "postgres";


-- moved to 070_functions.sql: public.trigger_commit_temp_data



-- moved to 070_functions.sql: public.update_foreign_keys


-- moved to 070_functions.sql: public.update_optin_updated_at


-- moved to 070_functions.sql: public.update_updated_at_column


-- moved to 070_functions.sql: public.word_occurrences


-- moved to 070_functions.sql: tes.get_current_account_id


-- moved to 070_functions.sql: tes.get_followers


-- moved to 070_functions.sql: tes.get_followings


-- moved to 070_functions.sql: tes.get_moots


CREATE OR REPLACE FUNCTION "tes"."get_tweet_counts_by_date"() RETURNS TABLE("tweet_date" "date", "tweet_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    -- Get the current user's account_id
    v_account_id := tes.get_current_account_id();

    RETURN QUERY
    SELECT 
        DATE(created_at) AS tweet_date,
        COUNT(*) AS tweet_count
    FROM 
        public.tweets
    WHERE 
        account_id = v_account_id
    GROUP BY 
        DATE(created_at)
    ORDER BY 
        tweet_date;
END;
$$;


ALTER FUNCTION "tes"."get_tweet_counts_by_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."get_tweets_on_this_day"("p_limit" integer DEFAULT NULL::integer) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "reply_to_user_id" "text", "reply_to_username" "text", "username" "text", "account_display_name" "text", "avatar_media_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_month INTEGER;
    current_day INTEGER;
    v_account_id TEXT;
BEGIN
    -- Get the current user's account_id
    v_account_id := tes.get_current_account_id();

    -- Get the current month and day
    SELECT EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(DAY FROM CURRENT_DATE)
    INTO current_month, current_day;

    RETURN QUERY
    SELECT 
        t.tweet_id, t.account_id, t.created_at, t.full_text, t.retweet_count,
        t.favorite_count, t.reply_to_tweet_id, t.reply_to_user_id, t.reply_to_username,
        a.username, a.account_display_name, p.avatar_media_url
    FROM 
        public.tweets t
        inner join account a on t.account_id = a.account_id
        inner join profile p on t.account_id = p.account_id
    WHERE 
        EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'UTC') = current_month
        AND EXTRACT(DAY FROM t.created_at AT TIME ZONE 'UTC') = current_day
        AND EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'UTC') < EXTRACT(YEAR FROM CURRENT_DATE)
        AND t.account_id = v_account_id
    ORDER BY 
        t.favorite_count DESC, t.retweet_count DESC
    LIMIT p_limit;
END;
$$;


ALTER FUNCTION "tes"."get_tweets_on_this_day"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."get_user_intercepted_stats"("days_back" integer DEFAULT 30) RETURNS TABLE("date" "date", "type" "text", "count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
    current_user_id text;
begin
    -- Get the current authenticated user's account_id
    SELECT auth.jwt() -> 'user_metadata' ->> 'sub' into current_user_id ;
    
    -- Verify user is authenticated
    if current_user_id is null then
        raise exception 'User must be authenticated';
    end if;
    
    -- Return data only for the authenticated user within the specified date range
    return query
    select 
        uis.date,
        uis.type,
        uis.count
    from private.user_intercepted_stats uis
    where uis.user_id = current_user_id
      and uis.date >= current_date - interval '1 day' * days_back
    order by uis.date desc, uis.type;
end;
$$;


ALTER FUNCTION "tes"."get_user_intercepted_stats"("days_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."hash_user_id"("user_id" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Convert the input to text if not already, hash it using SHA-256,
    -- and return as a hex string
    RETURN encode(digest(user_id::text, 'sha256'), 'hex');
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error hashing user_id: %', SQLERRM;
END;
$$;


ALTER FUNCTION "tes"."hash_user_id"("user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."search_liked_tweets"("search_query" "text", "from_user" "text" DEFAULT NULL::"text", "to_user" "text" DEFAULT NULL::"text", "since_date" "date" DEFAULT NULL::"date", "until_date" "date" DEFAULT NULL::"date", "min_likes" integer DEFAULT 0, "min_retweets" integer DEFAULT 0, "max_likes" integer DEFAULT 100000000, "max_retweets" integer DEFAULT 100000000, "limit_" integer DEFAULT 50) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "avatar_media_url" "text", "archive_upload_id" bigint, "username" "text", "account_display_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  from_account_id TEXT;
  to_account_id TEXT;
  v_account_id TEXT;
BEGIN
  -- Get the current user's account_id
  v_account_id := tes.get_current_account_id();

  -- Get account_id for from_user
  IF from_user IS NOT NULL THEN
    SELECT a.account_id INTO from_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(from_user);
    
    -- Return empty if from_user not found
    IF from_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  -- Get account_id for to_user
  IF to_user IS NOT NULL THEN
    SELECT a.account_id INTO to_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(to_user);
    
    -- Return empty if to_user not found
    IF to_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH combined_tweets AS (
    SELECT 
      COALESCE(t.tweet_id,lt.tweet_id) as tweet_id,
      t.account_id,
      t.created_at,
      COALESCE(t.full_text, lt.full_text) as full_text,
      t.retweet_count,
      t.favorite_count,
      t.reply_to_user_id,
      t.reply_to_tweet_id,
      COALESCE(t.fts, lt.fts) as fts
    FROM (
      SELECT lt.tweet_id, lt.full_text, lt.fts
      FROM liked_tweets lt
      left JOIN likes l ON lt.tweet_id = l.liked_tweet_id 
      WHERE l.account_id = v_account_id
    ) lt
    LEFT JOIN tweets t ON lt.tweet_id = t.tweet_id
  ),
  matching_tweets AS (
    SELECT ct.tweet_id,ct.full_text
    FROM combined_tweets ct
    WHERE (search_query = '' OR ct.fts @@ websearch_to_tsquery('english', search_query))
      AND (from_account_id IS NULL OR ct.account_id = from_account_id)
      AND (to_account_id IS NULL OR ct.reply_to_user_id = to_account_id)
      AND (since_date IS NULL OR ct.created_at >= since_date OR ct.created_at IS NULL)
      AND (until_date IS NULL OR ct.created_at <= until_date OR ct.created_at IS NULL)
      AND (min_likes IS NULL OR ct.favorite_count >= min_likes OR ct.favorite_count IS NULL)
      AND (max_likes IS NULL OR ct.favorite_count <= max_likes OR ct.favorite_count IS NULL)
      AND (min_retweets IS NULL OR ct.retweet_count >= min_retweets OR ct.retweet_count IS NULL)
      AND (max_retweets IS NULL OR ct.retweet_count <= max_retweets OR ct.retweet_count IS NULL)
    ORDER BY COALESCE(ct.created_at, '2099-12-31'::timestamp) DESC
    LIMIT limit_
  )
  SELECT 
    COALESCE (mt.tweet_id,t.tweet_id), 
    t.account_id, 
    t.created_at, 
    COALESCE (mt.full_text,t.full_text), 
    t.retweet_count, 
    t.favorite_count,
    t.reply_to_tweet_id,
    p.avatar_media_url,
    p.archive_upload_id,
    a.username,
    a.account_display_name
  FROM matching_tweets mt
  LEFT JOIN tweets t ON mt.tweet_id = t.tweet_id
  LEFT JOIN account a ON t.account_id = a.account_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(p.avatar_media_url,'none.com') as avatar_media_url, p.archive_upload_id
    FROM profile as p
    WHERE p.account_id = t.account_id
    ORDER BY p.archive_upload_id DESC
    LIMIT 1
  ) p ON true
  ORDER BY t.created_at DESC;
END;
$$;


ALTER FUNCTION "tes"."search_liked_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "min_likes" integer, "min_retweets" integer, "max_likes" integer, "max_retweets" integer, "limit_" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."search_tweets"("search_query" "text", "from_user" "text" DEFAULT NULL::"text", "to_user" "text" DEFAULT NULL::"text", "since_date" "date" DEFAULT NULL::"date", "until_date" "date" DEFAULT NULL::"date", "min_likes" integer DEFAULT 0, "min_retweets" integer DEFAULT 0, "max_likes" integer DEFAULT 100000000, "max_retweets" integer DEFAULT 100000000, "limit_" integer DEFAULT 50) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "avatar_media_url" "text", "archive_upload_id" bigint, "username" "text", "account_display_name" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  from_account_id TEXT;
  to_account_id TEXT;
BEGIN
  -- Get account_id for from_user
  IF from_user IS NOT NULL THEN
    SELECT a.account_id INTO from_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(from_user);
    
    -- Return empty if from_user not found
    IF from_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  -- Get account_id for to_user
  IF to_user IS NOT NULL THEN
    SELECT a.account_id INTO to_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(to_user);
    
    -- Return empty if to_user not found
    IF to_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH matching_tweets AS (
    SELECT t.tweet_id
    FROM tweets t
    WHERE (search_query = '' OR t.fts @@ websearch_to_tsquery('english', search_query))
      AND (from_account_id IS NULL OR t.account_id = from_account_id)
      AND (to_account_id IS NULL OR t.reply_to_user_id = to_account_id)
      AND (since_date IS NULL OR t.created_at >= since_date)
      AND (until_date IS NULL OR t.created_at <= until_date)
      AND (min_likes IS NULL OR t.favorite_count >= min_likes)
      AND (max_likes IS NULL OR t.favorite_count <= max_likes)
      AND (min_retweets IS NULL OR t.retweet_count >= min_retweets)
      AND (max_retweets IS NULL OR t.retweet_count <= max_retweets)
      --temporary change due to circle tweets
      AND (t.created_at < '2022-08-01'::DATE OR t.created_at > '2023-11-30'::DATE)  
    ORDER BY t.created_at DESC
    LIMIT limit_
  )
  SELECT 
    t.tweet_id, 
    t.account_id, 
    t.created_at, 
    t.full_text, 
    t.retweet_count, 
    t.favorite_count,
    t.reply_to_tweet_id,
    p.avatar_media_url,
    p.archive_upload_id,
    a.username,
    a.account_display_name
  FROM matching_tweets mt
  JOIN tweets t ON mt.tweet_id = t.tweet_id
  JOIN account a ON t.account_id = a.account_id
  LEFT JOIN LATERAL (
    SELECT p.avatar_media_url, p.archive_upload_id
    FROM profile as p
    WHERE p.account_id = t.account_id
    ORDER BY p.archive_upload_id DESC
    LIMIT 1
  ) p ON true
  ORDER BY t.created_at DESC;
END;
$$;


ALTER FUNCTION "tes"."search_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "min_likes" integer, "min_retweets" integer, "max_likes" integer, "max_retweets" integer, "limit_" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "ca_website"."scraping_stats" (
    "period_type" "text" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "tweet_count" bigint DEFAULT 0 NOT NULL,
    "unique_scrapers" integer DEFAULT 0 NOT NULL,
    "last_updated" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_complete" boolean DEFAULT false NOT NULL,
    CONSTRAINT "scraping_stats_period_type_check" CHECK (("period_type" = ANY (ARRAY['hour'::"text", 'day'::"text", 'week'::"text", 'month'::"text"])))
);


ALTER TABLE "ca_website"."scraping_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."archived_temporary_data" (
    "type" character varying(255) NOT NULL,
    "item_id" character varying(255) NOT NULL,
    "originator_id" character varying(255) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data" "jsonb" NOT NULL,
    "user_id" character varying(255) DEFAULT 'anon'::character varying NOT NULL,
    "inserted" timestamp with time zone,
    "stored" boolean DEFAULT false,
    "id" integer NOT NULL
);


ALTER TABLE "private"."archived_temporary_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."daily_pg_stat_statements" (
    "id" integer NOT NULL,
    "snapshot_time" timestamp without time zone DEFAULT "now"(),
    "userid" "oid",
    "dbid" "oid",
    "toplevel" boolean,
    "queryid" bigint,
    "query" "text",
    "plans" bigint,
    "total_plan_time" double precision,
    "min_plan_time" double precision,
    "max_plan_time" double precision,
    "mean_plan_time" double precision,
    "stddev_plan_time" double precision,
    "calls" bigint,
    "total_exec_time" double precision,
    "min_exec_time" double precision,
    "max_exec_time" double precision,
    "mean_exec_time" double precision,
    "stddev_exec_time" double precision,
    "rows" bigint,
    "shared_blks_hit" bigint,
    "shared_blks_read" bigint,
    "shared_blks_dirtied" bigint,
    "shared_blks_written" bigint,
    "local_blks_hit" bigint,
    "local_blks_read" bigint,
    "local_blks_dirtied" bigint,
    "local_blks_written" bigint,
    "temp_blks_read" bigint,
    "temp_blks_written" bigint,
    "blk_read_time" double precision,
    "blk_write_time" double precision,
    "temp_blk_read_time" double precision,
    "temp_blk_write_time" double precision,
    "wal_records" bigint,
    "wal_fpi" bigint,
    "wal_bytes" numeric,
    "jit_functions" bigint,
    "jit_generation_time" double precision,
    "jit_inlining_count" bigint,
    "jit_inlining_time" double precision,
    "jit_optimization_count" bigint,
    "jit_optimization_time" double precision,
    "jit_emission_count" bigint,
    "jit_emission_time" double precision
);


ALTER TABLE "private"."daily_pg_stat_statements" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "private"."daily_pg_stat_statements_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "private"."daily_pg_stat_statements_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."daily_pg_stat_statements_id_seq" OWNED BY "private"."daily_pg_stat_statements"."id";



CREATE TABLE IF NOT EXISTS "private"."import_errors" (
    "id" integer NOT NULL,
    "type" "text" NOT NULL,
    "originator_id" "text" NOT NULL,
    "item_id" "text" NOT NULL,
    "error_message" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "private"."import_errors" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "private"."import_errors_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "private"."import_errors_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."import_errors_id_seq" OWNED BY "private"."import_errors"."id";



CREATE TABLE IF NOT EXISTS "private"."job_queue" (
    "key" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_name" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "status" "text",
    "args" "jsonb",
    CONSTRAINT "job_queue_status_check" CHECK (("status" = ANY (ARRAY['QUEUED'::"text", 'PROCESSING'::"text", 'DONE'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "private"."job_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."logs" (
    "log_id" integer NOT NULL,
    "log_timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error_type" "text",
    "error_message" "text",
    "error_code" "text",
    "context" "jsonb"
);


ALTER TABLE "private"."logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "private"."logs_log_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "private"."logs_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."logs_log_id_seq" OWNED BY "private"."logs"."log_id";



CREATE TABLE IF NOT EXISTS "private"."materialized_view_refresh_logs" (
    "view_name" "text" NOT NULL,
    "refresh_started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "refresh_completed_at" timestamp with time zone,
    "duration_ms" bigint
);


ALTER TABLE "private"."materialized_view_refresh_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."tweet_user" (
    "tweet_id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "private"."tweet_user" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."user_intercepted_stats" (
    "user_id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "count" integer NOT NULL
);


ALTER TABLE "private"."user_intercepted_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."all_account" (
    "account_id" "text" NOT NULL,
    "created_via" "text" NOT NULL,
    "username" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "account_display_name" "text" NOT NULL,
    "num_tweets" integer DEFAULT 0,
    "num_following" integer DEFAULT 0,
    "num_followers" integer DEFAULT 0,
    "num_likes" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."all_account" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."archive_upload" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "archive_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "keep_private" boolean DEFAULT false,
    "upload_likes" boolean DEFAULT true,
    "start_date" "date",
    "end_date" "date",
    "upload_phase" "public"."upload_phase_enum" DEFAULT 'uploading'::"public"."upload_phase_enum"
);


ALTER TABLE "public"."archive_upload" OWNER TO "postgres";


COMMENT ON TABLE "public"."archive_upload" IS 'Stores upload options for each archive upload';



-- moved to 040_views.sql: public.account


CREATE TABLE IF NOT EXISTS "public"."likes" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "liked_tweet_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mentioned_users" (
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "screen_name" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."mentioned_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tweets" (
    "tweet_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "full_text" "text" NOT NULL,
    "retweet_count" integer NOT NULL,
    "favorite_count" integer NOT NULL,
    "reply_to_tweet_id" "text",
    "reply_to_user_id" "text",
    "reply_to_username" "text",
    "archive_upload_id" bigint,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.10', "autovacuum_analyze_scale_factor"='0.05', "fillfactor"='90');


ALTER TABLE "public"."tweets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_mentions" (
    "id" bigint NOT NULL,
    "mentioned_user_id" "text" NOT NULL,
    "tweet_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."user_mentions" OWNER TO "postgres";


-- moved to 035_matviews.sql: account_activity_summary


CREATE TABLE IF NOT EXISTS "public"."all_profile" (
    "account_id" "text" NOT NULL,
    "bio" "text",
    "website" "text",
    "location" "text",
    "avatar_media_url" "text",
    "header_media_url" "text",
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."all_profile" OWNER TO "postgres";


-- moved to 050_constraints.sql: identity column for public.archive_upload



CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "tweet_id" "text" NOT NULL,
    "conversation_id" "text"
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tweet_urls" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "expanded_url" "text",
    "display_url" "text" NOT NULL,
    "tweet_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."tweet_urls" OWNER TO "postgres";


-- moved to 040_views.sql: public.quote_tweets


-- moved to 040_views.sql: public.enriched_tweets


CREATE TABLE IF NOT EXISTS "public"."followers" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "follower_account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."followers" OWNER TO "postgres";


-- moved to 050_constraints.sql: identity column for public.followers



CREATE TABLE IF NOT EXISTS "public"."following" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "following_account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."following" OWNER TO "postgres";


-- moved to 050_constraints.sql: identity column for public.following



-- moved to 035_matviews.sql: global_activity_summary


-- moved to 035_matviews.sql: monthly_tweet_counts_mv


-- moved to 040_views.sql: public.global_monthly_tweet_counts


CREATE TABLE IF NOT EXISTS "public"."liked_tweets" (
    "tweet_id" "text" NOT NULL,
    "full_text" "text" NOT NULL,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED
);


ALTER TABLE "public"."liked_tweets" OWNER TO "postgres";


-- moved to 050_constraints.sql: identity column for public.likes



-- moved to 020_tables.sql: public.optin table


COMMENT ON TABLE "public"."optin" IS 'Stores user consent for tweet streaming to the community archive';



COMMENT ON COLUMN "public"."optin"."opted_in" IS 'Current opt-in status for tweet streaming';



COMMENT ON COLUMN "public"."optin"."terms_version" IS 'Version of terms and conditions the user agreed to';



-- moved to 040_views.sql: public.profile


-- moved to 020_tables.sql: public.scraper_count


CREATE TABLE IF NOT EXISTS "public"."tweet_media" (
    "media_id" bigint NOT NULL,
    "tweet_id" "text" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."tweet_media" OWNER TO "postgres";


-- moved to 040_views.sql: public.tweet_replies_view


-- moved to 050_constraints.sql: identity column for public.tweet_urls



-- moved to 040_views.sql: public.tweets_w_conversation_id


-- moved to 050_constraints.sql: identity column for public.user_mentions




CREATE TABLE IF NOT EXISTS "tes"."blocked_scraping_users" (
    "account_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "tes"."blocked_scraping_users" OWNER TO "postgres";


ALTER TABLE ONLY "private"."daily_pg_stat_statements" ALTER COLUMN "id" SET DEFAULT "nextval"('"private"."daily_pg_stat_statements_id_seq"'::"regclass");



ALTER TABLE ONLY "private"."import_errors" ALTER COLUMN "id" SET DEFAULT "nextval"('"private"."import_errors_id_seq"'::"regclass");



ALTER TABLE ONLY "private"."logs" ALTER COLUMN "log_id" SET DEFAULT "nextval"('"private"."logs_log_id_seq"'::"regclass");



ALTER TABLE ONLY "ca_website"."scraping_stats"
    ADD CONSTRAINT "scraping_stats_pkey" PRIMARY KEY ("period_type", "period_start");



ALTER TABLE ONLY "private"."archived_temporary_data"
    ADD CONSTRAINT "archived_temporary_data_id_key" UNIQUE ("id");



ALTER TABLE ONLY "private"."archived_temporary_data"
    ADD CONSTRAINT "archived_temporary_data_pkey" PRIMARY KEY ("type", "originator_id", "item_id", "timestamp");



ALTER TABLE ONLY "private"."daily_pg_stat_statements"
    ADD CONSTRAINT "daily_pg_stat_statements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."import_errors"
    ADD CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."job_queue"
    ADD CONSTRAINT "job_queue_pkey" PRIMARY KEY ("key");



-- moved to 050_constraints.sql: logs pkey



-- moved to 050_constraints.sql: tweet_user pkey



-- moved to 050_constraints.sql: user_intercepted_stats pkey



-- moved to 050_constraints.sql: all_account pkey



-- moved to 050_constraints.sql: all_profile unique



-- moved to 050_constraints.sql: all_profile pkey



-- moved to 050_constraints.sql: archive_upload unique



-- moved to 050_constraints.sql: archive_upload pkey



-- moved to 050_constraints.sql: conversations pkey



-- moved to 050_constraints.sql: followers unique



-- moved to 050_constraints.sql: followers pkey



-- moved to 050_constraints.sql: following unique



-- moved to 050_constraints.sql: following pkey



-- moved to 050_constraints.sql: liked_tweets pkey



-- moved to 050_constraints.sql: likes unique



-- moved to 050_constraints.sql: likes pkey



-- moved to 050_constraints.sql: mentioned_users pkey



-- moved to 050_constraints.sql: optin pkey



-- moved to 050_constraints.sql: optin unique user_id



-- moved to 050_constraints.sql: optin unique username



-- moved to 050_constraints.sql: tweet_media pkey



-- moved to 050_constraints.sql: tweet_urls pkey



-- moved to 050_constraints.sql: tweet_urls unique



-- moved to 050_constraints.sql: tweets pkey



-- moved to 050_constraints.sql: user_mentions unique



-- moved to 050_constraints.sql: user_mentions pkey

-- moved to 050_constraints.sql: tes.blocked_scraping_users pkey



CREATE INDEX "idx_scraping_stats_last_updated" ON "ca_website"."scraping_stats" USING "btree" ("last_updated");



CREATE INDEX "idx_scraping_stats_period_end" ON "ca_website"."scraping_stats" USING "btree" ("period_end");



CREATE INDEX "archived_temporary_data_inserted_stored_idx" ON "private"."archived_temporary_data" USING "btree" ("inserted", "stored") WHERE (("inserted" IS NOT NULL) AND ("stored" = false) AND (("type")::"text" ~~ 'api_%'::"text"));



CREATE INDEX "archived_temporary_data_inserted_stored_type_idx" ON "private"."archived_temporary_data" USING "btree" ("inserted", "stored", "type");



CREATE INDEX "archived_temporary_data_stored_idx" ON "private"."archived_temporary_data" USING "btree" ("stored");



CREATE INDEX "archived_temporary_data_timestamp_idx" ON "private"."archived_temporary_data" USING "btree" ("timestamp" DESC);



CREATE INDEX "archived_temporary_data_type_idx" ON "private"."archived_temporary_data" USING "btree" ("type" "text_pattern_ops");



CREATE INDEX "archived_temporary_data_type_originator_id_item_id_idx" ON "private"."archived_temporary_data" USING "btree" ("type", "originator_id", "item_id");



CREATE INDEX "archived_temporary_data_user_id_idx" ON "private"."archived_temporary_data" USING "btree" ("user_id");



CREATE INDEX "idx_import_errors_type_originator_item" ON "private"."import_errors" USING "btree" ("type", "originator_id", "item_id");



CREATE INDEX "idx_job_queue_job_name" ON "private"."job_queue" USING "btree" ("job_name");



CREATE INDEX "idx_job_queue_status_timestamp" ON "private"."job_queue" USING "btree" ("status", "timestamp");



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 036_matview_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 036_matview_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 030_indexes.sql



-- moved to 080_triggers.sql: queue_job_on_upload_complete



-- moved to 080_triggers.sql: queue_job_on_upload_delete



-- moved to 080_triggers.sql: trigger_commit_temp_data



-- moved to 080_triggers.sql: update_all_account_updated_at



-- moved to 080_triggers.sql: update_all_profile_updated_at



-- moved to 080_triggers.sql: update_followers_updated_at



-- moved to 080_triggers.sql: update_following_updated_at



-- moved to 080_triggers.sql: update_likes_updated_at



-- moved to 080_triggers.sql: update_optin_timestamp



-- moved to 080_triggers.sql: update_tweet_media_updated_at



-- moved to 080_triggers.sql: update_tweet_urls_updated_at



-- moved to 080_triggers.sql: update_tweets_updated_at



-- moved to 080_triggers.sql: update_user_mentions_updated_at



-- moved to 080_triggers.sql: update_tes_blocked_scraping_timestamp



-- moved to 050_constraints.sql: all_profile fkeys



-- moved to 050_constraints.sql: all_profile fkeys



-- moved to 050_constraints.sql: archive_upload fkey



-- moved to 050_constraints.sql: conversations fkey



-- moved to 050_constraints.sql: followers fkeys



-- moved to 050_constraints.sql: followers fkeys



-- moved to 050_constraints.sql: following fkeys



-- moved to 050_constraints.sql: following fkeys



-- moved to 050_constraints.sql: likes fkeys



-- moved to 050_constraints.sql: likes fkeys



-- moved to 050_constraints.sql: likes fkeys



-- moved to 050_constraints.sql: optin user_id FK



-- moved to 050_constraints.sql: tweet_media fkeys



-- moved to 050_constraints.sql: tweet_media fkeys



-- moved to 050_constraints.sql: tweet_urls fkey



-- moved to 050_constraints.sql: tweets fkeys



-- moved to 050_constraints.sql: tweets fkeys



-- moved to 050_constraints.sql: user_mentions fkeys



-- moved to 050_constraints.sql: user_mentions fkeys



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql



-- moved to 060_policies.sql


-- moved to 060_policies.sql




-- moved to 060_policies.sql


-- moved to 060_policies.sql


-- moved to 060_policies.sql


-- moved to 060_policies.sql


-- moved to 060_policies.sql


-- moved to 060_policies.sql


-- moved to 060_policies.sql


-- moved to 060_policies.sql


-- moved to 060_policies.sql


-- moved to 060_policies.sql


-- moved to 060_policies.sql


-- moved to 060_policies.sql


-- moved to 060_policies.sql



-- moved to 060_policies.sql




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "ca_website" TO "authenticated";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



-- dev schema deprecated: remove usage grants



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
-- moved to 060_grants.sql






GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "temp" TO "anon";
GRANT USAGE ON SCHEMA "temp" TO "service_role";
GRANT USAGE ON SCHEMA "temp" TO "authenticated";



GRANT USAGE ON SCHEMA "tes" TO "anon";
GRANT USAGE ON SCHEMA "tes" TO "authenticated";
GRANT USAGE ON SCHEMA "tes" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";



GRANT ALL ON FUNCTION "ca_website"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
























-- dev schema deprecated: removed GRANTs on dev functions






























































































































































































































REVOKE ALL ON FUNCTION "private"."get_provider_id_internal"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."apply_public_entities_rls_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_public_entities_rls_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_public_entities_rls_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_public_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_public_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_public_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_public_rls_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_public_rls_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_public_rls_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_public_rls_policies_not_private"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_public_rls_policies_not_private"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_public_rls_policies_not_private"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_readonly_rls_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_readonly_rls_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_readonly_rls_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."commit_temp_data"("p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."commit_temp_data"("p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."commit_temp_data"("p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_temp_tables"("p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_temp_tables"("p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_temp_tables"("p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_tweets"("p_tweet_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_tweets"("p_tweet_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_tweets"("p_tweet_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user_archive"("p_account_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user_archive"("p_account_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_archive"("p_account_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."drop_all_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."drop_all_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."drop_all_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."drop_temp_tables"("p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."drop_temp_tables"("p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."drop_temp_tables"("p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_most_liked_tweets_archive_users"("username_" "text", "limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_most_liked_tweets_archive_users"("username_" "text", "limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_most_liked_tweets_archive_users"("username_" "text", "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_most_mentioned_accounts"("username_" "text", "limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_most_mentioned_accounts"("username_" "text", "limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_most_mentioned_accounts"("username_" "text", "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_most_replied_tweets_by_archive_users"("username_" "text", "limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_most_replied_tweets_by_archive_users"("username_" "text", "limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_most_replied_tweets_by_archive_users"("username_" "text", "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_top_favorite_count_tweets"("username_" "text", "limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_top_favorite_count_tweets"("username_" "text", "limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_top_favorite_count_tweets"("username_" "text", "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_top_retweet_count_tweets"("username_" "text", "limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_top_retweet_count_tweets"("username_" "text", "limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_top_retweet_count_tweets"("username_" "text", "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hourly_scraping_stats"("p_hours_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_hourly_scraping_stats"("p_hours_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hourly_scraping_stats"("p_hours_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hourly_stats_simple"("p_hours_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_hourly_stats_simple"("p_hours_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hourly_stats_simple"("p_hours_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_main_thread"("p_conversation_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_main_thread"("p_conversation_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_main_thread"("p_conversation_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_tweet_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_tweet_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_tweet_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_tweet_counts_fast"("p_account_id" "text", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_tweet_counts_fast"("p_account_id" "text", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_tweet_counts_fast"("p_account_id" "text", "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_most_liked_tweets_by_username"("username_" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_most_liked_tweets_by_username"("username_" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_most_liked_tweets_by_username"("username_" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_most_mentioned_accounts_by_username"("username_" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_most_mentioned_accounts_by_username"("username_" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_most_mentioned_accounts_by_username"("username_" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_scraper_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_scraper_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_scraper_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_simple_streamed_tweet_counts"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_simple_streamed_tweet_counts"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_simple_streamed_tweet_counts"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_granularity" "text", "p_streamed_only" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_granularity" "text", "p_streamed_only" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_granularity" "text", "p_streamed_only" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_granularity" "text", "p_streamed_only" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats_daily"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats_daily"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_daily"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_daily"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats_daily_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats_daily_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_daily_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_daily_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats_hourly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats_hourly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_hourly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_hourly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats_hourly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats_hourly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_hourly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_hourly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats_weekly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats_weekly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_weekly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_weekly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats_weekly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats_weekly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_weekly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_weekly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_liked_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_liked_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_liked_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_mentioned_users"("limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_mentioned_users"("limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_mentioned_users"("limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_retweeted_tweets_by_username"("username_" "text", "limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_retweeted_tweets_by_username"("username_" "text", "limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_retweeted_tweets_by_username"("username_" "text", "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_trending_tweets"("hours_back" integer, "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_trending_tweets"("hours_back" integer, "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trending_tweets"("hours_back" integer, "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tweet_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tweet_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tweet_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unique_scraper_count"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_unique_scraper_count"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unique_scraper_count"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_keep_private" boolean, "p_upload_likes" boolean, "p_start_date" "date", "p_end_date" "date", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_keep_private" boolean, "p_upload_likes" boolean, "p_start_date" "date", "p_end_date" "date", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_keep_private" boolean, "p_upload_likes" boolean, "p_start_date" "date", "p_end_date" "date", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgaudit_ddl_command_end"() TO "postgres";
GRANT ALL ON FUNCTION "public"."pgaudit_ddl_command_end"() TO "anon";
GRANT ALL ON FUNCTION "public"."pgaudit_ddl_command_end"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgaudit_ddl_command_end"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pgaudit_sql_drop"() TO "postgres";
GRANT ALL ON FUNCTION "public"."pgaudit_sql_drop"() TO "anon";
GRANT ALL ON FUNCTION "public"."pgaudit_sql_drop"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgaudit_sql_drop"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_archive"("archive_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."process_archive"("archive_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_archive"("archive_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_tweets"("search_query" "text", "limit_count" integer, "account_filter" "text", "date_from" timestamp without time zone, "date_to" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."search_tweets"("search_query" "text", "limit_count" integer, "account_filter" "text", "date_from" timestamp without time zone, "date_to" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_tweets"("search_query" "text", "limit_count" integer, "account_filter" "text", "date_from" timestamp without time zone, "date_to" timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "limit_" integer, "offset_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "limit_" integer, "offset_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "limit_" integer, "offset_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_meta_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_meta_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_meta_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_commit_temp_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_commit_temp_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_commit_temp_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_foreign_keys"("old_table_name" "text", "new_table_name" "text", "schema_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_foreign_keys"("old_table_name" "text", "new_table_name" "text", "schema_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_foreign_keys"("old_table_name" "text", "new_table_name" "text", "schema_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_optin_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_optin_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_optin_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_occurrences"("search_word" "text", "start_date" timestamp with time zone, "end_date" timestamp with time zone, "user_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."word_occurrences"("search_word" "text", "start_date" timestamp with time zone, "end_date" timestamp with time zone, "user_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_occurrences"("search_word" "text", "start_date" timestamp with time zone, "end_date" timestamp with time zone, "user_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_current_account_id"() TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_followers"() TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_followings"() TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_moots"() TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_tweet_counts_by_date"() TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_tweets_on_this_day"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_user_intercepted_stats"("days_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "tes"."hash_user_id"("user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "tes"."search_liked_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "min_likes" integer, "min_retweets" integer, "max_likes" integer, "max_retweets" integer, "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "tes"."search_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "min_likes" integer, "min_retweets" integer, "max_likes" integer, "max_retweets" integer, "limit_" integer) TO "service_role";



GRANT SELECT ON TABLE "ca_website"."scraping_stats" TO "authenticated";






























GRANT ALL ON TABLE "public"."all_account" TO "anon";
GRANT ALL ON TABLE "public"."all_account" TO "authenticated";
GRANT ALL ON TABLE "public"."all_account" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."archive_upload" TO "anon";
GRANT ALL ON TABLE "public"."archive_upload" TO "authenticated";
GRANT ALL ON TABLE "public"."archive_upload" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."account" TO "anon";
GRANT ALL ON TABLE "public"."account" TO "authenticated";
GRANT ALL ON TABLE "public"."account" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."likes" TO "anon";
GRANT ALL ON TABLE "public"."likes" TO "authenticated";
GRANT ALL ON TABLE "public"."likes" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."mentioned_users" TO "anon";
GRANT ALL ON TABLE "public"."mentioned_users" TO "authenticated";
GRANT ALL ON TABLE "public"."mentioned_users" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."tweets" TO "anon";
GRANT ALL ON TABLE "public"."tweets" TO "authenticated";
GRANT ALL ON TABLE "public"."tweets" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."user_mentions" TO "anon";
GRANT ALL ON TABLE "public"."user_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_mentions" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."account_activity_summary" TO "anon";
GRANT ALL ON TABLE "public"."account_activity_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."account_activity_summary" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."all_profile" TO "anon";
GRANT ALL ON TABLE "public"."all_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."all_profile" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON SEQUENCE "public"."archive_upload_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."archive_upload_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."archive_upload_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."tweet_urls" TO "anon";
GRANT ALL ON TABLE "public"."tweet_urls" TO "authenticated";
GRANT ALL ON TABLE "public"."tweet_urls" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."quote_tweets" TO "anon";
GRANT ALL ON TABLE "public"."quote_tweets" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_tweets" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."enriched_tweets" TO "anon";
GRANT ALL ON TABLE "public"."enriched_tweets" TO "authenticated";
GRANT ALL ON TABLE "public"."enriched_tweets" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."followers" TO "anon";
GRANT ALL ON TABLE "public"."followers" TO "authenticated";
GRANT ALL ON TABLE "public"."followers" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON SEQUENCE "public"."followers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."followers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."followers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."following" TO "anon";
GRANT ALL ON TABLE "public"."following" TO "authenticated";
GRANT ALL ON TABLE "public"."following" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON SEQUENCE "public"."following_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."following_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."following_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."global_activity_summary" TO "anon";
GRANT ALL ON TABLE "public"."global_activity_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."global_activity_summary" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."monthly_tweet_counts_mv" TO "anon";
GRANT ALL ON TABLE "public"."monthly_tweet_counts_mv" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_tweet_counts_mv" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."global_monthly_tweet_counts" TO "anon";
GRANT ALL ON TABLE "public"."global_monthly_tweet_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."global_monthly_tweet_counts" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."liked_tweets" TO "anon";
GRANT ALL ON TABLE "public"."liked_tweets" TO "authenticated";
GRANT ALL ON TABLE "public"."liked_tweets" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON SEQUENCE "public"."likes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."likes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."likes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."optin" TO "anon";
GRANT ALL ON TABLE "public"."optin" TO "authenticated";
GRANT ALL ON TABLE "public"."optin" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."profile" TO "anon";
GRANT ALL ON TABLE "public"."profile" TO "authenticated";
GRANT ALL ON TABLE "public"."profile" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."scraper_count" TO "anon";
GRANT ALL ON TABLE "public"."scraper_count" TO "authenticated";
GRANT ALL ON TABLE "public"."scraper_count" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."tweet_media" TO "anon";
GRANT ALL ON TABLE "public"."tweet_media" TO "authenticated";
GRANT ALL ON TABLE "public"."tweet_media" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON TABLE "public"."tweet_replies_view" TO "anon";
GRANT ALL ON TABLE "public"."tweet_replies_view" TO "authenticated";
GRANT ALL ON TABLE "public"."tweet_replies_view" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON SEQUENCE "public"."tweet_urls_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tweet_urls_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tweet_urls_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tweets_w_conversation_id" TO "anon";
GRANT ALL ON TABLE "public"."tweets_w_conversation_id" TO "authenticated";
GRANT ALL ON TABLE "public"."tweets_w_conversation_id" TO "service_role";
-- moved to 060_grants.sql



GRANT ALL ON SEQUENCE "public"."user_mentions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_mentions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_mentions_id_seq" TO "service_role";


GRANT SELECT ON TABLE "tes"."blocked_scraping_users" TO "anon";
GRANT SELECT ON TABLE "tes"."blocked_scraping_users" TO "authenticated";
GRANT ALL ON TABLE "tes"."blocked_scraping_users" TO "service_role";



-- dev schema deprecated: removed default privileges on sequences



-- dev schema deprecated: removed default privileges on functions



-- dev schema deprecated: removed default privileges on tables



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";
-- moved to 060_grants.sql






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON FUNCTIONS  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON TABLES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tes" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tes" GRANT ALL ON FUNCTIONS  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tes" GRANT SELECT ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tes" GRANT SELECT ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tes" GRANT ALL ON TABLES  TO "service_role";



























RESET ALL;
