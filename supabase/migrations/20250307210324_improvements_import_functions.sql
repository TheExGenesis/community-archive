CREATE TABLE IF NOT EXISTS private.import_errors (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    originator_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    error_message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_import_errors_type_originator_item 
ON private.import_errors (type, originator_id, item_id);



CREATE OR REPLACE FUNCTION private.tes_process_mention_records() RETURNS TABLE (
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
        AND (td.data->>'mentioned_user_id')::text = pit.mentioned_user_id;
        
        -- Get error records
        SELECT array_agg((data->>'mentioned_user_id')::text || ':' || (data->>'tweet_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_mention'
        AND (data->>'mentioned_user_id')::text IS NOT NULL
        AND inserted IS NULL;
        
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
CREATE OR REPLACE FUNCTION private.tes_complete_group_insertions()
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


CREATE OR REPLACE FUNCTION private.tes_process_url_records()
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


        WITH update_result AS (
            UPDATE temporary_data td
            SET inserted = CURRENT_TIMESTAMP
            WHERE td.type = 'import_url'
            AND (td.data->>'tweet_id')::text = ANY(processed_ids)
            RETURNING td.*
        )
        SELECT COUNT(*) INTO processed_count FROM update_result;


        WITH error_scan AS (
            SELECT 
                (data->>'tweet_id')::text || ':' || (data->>'url')::text as error_id
            FROM temporary_data
            WHERE type = 'import_url'
            AND (data->>'tweet_id')::text IS NOT NULL
            AND inserted IS NULL
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