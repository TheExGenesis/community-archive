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
$$ LANGUAGE plpgsql;



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
$$ LANGUAGE plpgsql;


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
$$ LANGUAGE plpgsql;