CREATE OR REPLACE FUNCTION private.tes_process_media_records()
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
        -- Update inserted timestamp for ALL related records
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        WHERE td.type = 'import_media'
        AND (td.data->>'media_id')::text = ANY(processed_ids);
        -- Get error records
        SELECT array_agg((data->>'media_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_media'
        AND (data->>'media_id')::text IS NOT NULL
        AND inserted IS NULL;
        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;
