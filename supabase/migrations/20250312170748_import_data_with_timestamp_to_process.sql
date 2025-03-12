DROP FUNCTION IF EXISTS private.tes_process_account_records();
CREATE OR REPLACE FUNCTION private.tes_process_account_records(process_cutoff_time TIMESTAMP)
RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
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
                )
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
        AND (td.data->>'account_id')::text = pit.account_id;
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
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS private.tes_process_profile_records();
CREATE OR REPLACE FUNCTION private.tes_process_profile_records(process_cutoff_time TIMESTAMP)
RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
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
            WHERE type = 'import_profile' 
            AND (data->>'account_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
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
                (data->>'account_id')::text,
                (data->>'bio')::text,
                (data->>'website')::text,
                (data->>'location')::text,
                (data->>'avatar_media_url')::text,
                (data->>'header_media_url')::text
            FROM latest_records
            WHERE rn = 1
            ON CONFLICT (account_id) 
            DO UPDATE SET
                bio = EXCLUDED.bio,
                website = EXCLUDED.website,
                location = EXCLUDED.location,
                avatar_media_url = EXCLUDED.avatar_media_url,
                header_media_url = EXCLUDED.header_media_url
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
        WHERE td.type = 'import_profile' 
        AND (td.data->>'account_id')::text = pit.account_id
        AND td.timestamp < process_cutoff_time;

        WITH error_scan AS (
            SELECT (data->>'account_id')::text as error_id
            FROM temporary_data
            WHERE type = 'import_profile'
            AND (data->>'account_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
        )
        SELECT array_agg(error_id)
        INTO error_records
        FROM error_scan;


        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS private.tes_process_tweet_records();
CREATE OR REPLACE FUNCTION private.tes_process_tweet_records(process_cutoff_time TIMESTAMP)
RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN
       
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
        SELECT array_agg(tweet_id) INTO processed_ids FROM insertions;

        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);


        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as tweet_id
        )
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        FROM processed_ids_table pit
        WHERE td.type = 'import_tweet' 
        AND (td.data->>'tweet_id')::text = pit.tweet_id
        AND td.timestamp < process_cutoff_time;

        

        WITH error_scan AS (
            SELECT (data->>'tweet_id')::text as error_id,
                   count(*) OVER () as total_scanned
            FROM temporary_data
            WHERE type = 'import_tweet'
            AND (data->>'tweet_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
        )
        SELECT array_agg(error_id)
        INTO error_records
        FROM error_scan;
        

        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS private.tes_process_media_records();
CREATE OR REPLACE FUNCTION private.tes_process_media_records(process_cutoff_time TIMESTAMP)
RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
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
            FROM temporary_data 
            WHERE type = 'import_media'
            AND (data->>'media_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
            ORDER BY (data->>'media_id')::text, timestamp DESC
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
            SELECT (data->>'media_id')::text as error_id
            FROM temporary_data
            WHERE type = 'import_media'
            AND (data->>'media_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
        )
        SELECT array_agg(error_id)
        INTO error_records
        FROM error_scan;
        

        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS private.tes_process_url_records();
CREATE OR REPLACE FUNCTION private.tes_process_url_records(process_cutoff_time TIMESTAMP)
RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
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

        SELECT COUNT(*) INTO processed_count FROM update_result;


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
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS private.tes_process_mention_records();
CREATE OR REPLACE FUNCTION private.tes_process_mention_records(process_cutoff_time TIMESTAMP) RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
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
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS private.tes_complete_group_insertions();
CREATE OR REPLACE FUNCTION private.tes_complete_group_insertions(process_cutoff_time TIMESTAMP)
RETURNS TABLE (
    completed INTEGER
) AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION private.tes_import_temporary_data_into_tables()
RETURNS void AS $$
DECLARE
    account_result RECORD;
    profile_result RECORD;
    tweet_result RECORD;
    media_result RECORD;
    url_result RECORD;
    mention_result RECORD;
    start_time TIMESTAMP;
    total_time INTERVAL;
    step_start TIMESTAMP;
    step_time INTERVAL;
    process_cutoff_time TIMESTAMP;
BEGIN
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
$$ LANGUAGE plpgsql;