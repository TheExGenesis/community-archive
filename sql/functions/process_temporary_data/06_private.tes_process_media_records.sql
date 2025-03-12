CREATE OR REPLACE FUNCTION private.tes_process_media_records(process_cutoff_time TIMESTAMP)
RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
    start_time TIMESTAMP;
    query_time INTERVAL;
    rows_read BIGINT;
BEGIN
    BEGIN
        RAISE NOTICE 'Starting media processing at %', clock_timestamp();

        start_time := clock_timestamp();
        WITH scan_records AS (
            SELECT *,
                   count(*) OVER () as total_scanned
            FROM temporary_data 
            WHERE type = 'import_media'
            AND (data->>'media_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
        ),
        latest_records AS (
            SELECT DISTINCT ON ((data->>'media_id')::text)
                (data->>'media_id')::bigint as media_id,
                (data->>'tweet_id')::text as tweet_id,
                (data->>'media_url')::text as media_url,
                (data->>'media_type')::text as media_type,
                (data->>'width')::integer as width,
                (data->>'height')::integer as height,
                total_scanned
            FROM scan_records
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
            RETURNING media_id::text, (SELECT MAX(total_scanned) FROM latest_records) as rows_scanned
        )
        SELECT array_agg(media_id), MAX(rows_scanned) INTO processed_ids, rows_read FROM insertions;
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Media insertion completed in %. Scanned % rows from temporary_data', query_time, rows_read;

        start_time := clock_timestamp();
        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Count processed in %. Processed % records', query_time, processed_count;

        start_time := clock_timestamp();
        WITH update_result AS (
            UPDATE temporary_data td
            SET inserted = CURRENT_TIMESTAMP
            WHERE td.type = 'import_media'
            AND (td.data->>'media_id')::text = ANY(processed_ids)
            AND td.timestamp < process_cutoff_time
            RETURNING td.*
        )
        SELECT COUNT(*) INTO rows_read FROM update_result;
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Updated inserted timestamps in %. Updated % rows', query_time, rows_read;

        start_time := clock_timestamp();
        WITH error_scan AS (
            SELECT (data->>'media_id')::text as error_id,
                   count(*) OVER () as total_scanned
            FROM temporary_data
            WHERE type = 'import_media'
            AND (data->>'media_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
        )
        SELECT array_agg(error_id), MAX(total_scanned)
        INTO error_records, rows_read
        FROM error_scan;
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Error records collected in %. Scanned % rows', query_time, rows_read;

        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;