CREATE OR REPLACE FUNCTION private.tes_process_profile_records(process_cutoff_time TIMESTAMP)
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
        RAISE NOTICE 'Starting profile processing at %', clock_timestamp();

        start_time := clock_timestamp();
        WITH latest_records AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'account_id')::text 
                    ORDER BY (data->>'created_at')::timestamp with time zone DESC
                ) as rn,
                count(*) OVER () as total_rows
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
            RETURNING account_id, (SELECT total_rows FROM latest_records LIMIT 1) as rows_scanned
        )
        SELECT array_agg(account_id), MAX(rows_scanned) INTO processed_ids, rows_read FROM insertions;
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Profile insertion completed in %. Scanned % rows from temporary_data', query_time, rows_read;

        start_time := clock_timestamp();
        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Count processed in %. Processed % records', query_time, processed_count;

        start_time := clock_timestamp();
        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as account_id
        ),
        update_result AS (
            UPDATE temporary_data td
            SET inserted = CURRENT_TIMESTAMP
            FROM processed_ids_table pit
            WHERE td.type = 'import_profile' 
            AND (td.data->>'account_id')::text = pit.account_id
            AND td.timestamp < process_cutoff_time
            RETURNING td.*
        )
        SELECT COUNT(*) INTO rows_read FROM update_result;
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Updated inserted timestamps in %. Updated % rows', query_time, rows_read;

        start_time := clock_timestamp();
        WITH error_scan AS (
            SELECT (data->>'account_id')::text as error_id,
                   count(*) OVER () as total_scanned
            FROM temporary_data
            WHERE type = 'import_profile'
            AND (data->>'account_id')::text IS NOT NULL
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