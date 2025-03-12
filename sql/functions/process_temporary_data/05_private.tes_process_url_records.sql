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