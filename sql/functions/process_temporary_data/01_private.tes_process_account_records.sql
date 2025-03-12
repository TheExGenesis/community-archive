CREATE OR REPLACE FUNCTION private.tes_process_account_records(process_cutoff_time TIMESTAMP)
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
        RAISE NOTICE 'Starting account processing at %', clock_timestamp();
        
        start_time := clock_timestamp();
        WITH latest_records AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'account_id')::text 
                    ORDER BY (data->>'created_at')::timestamp with time zone DESC
                ) as rn,
                count(*) OVER () as total_rows
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
            RETURNING account_id, (SELECT total_rows FROM latest_records LIMIT 1) as rows_scanned
        )
        SELECT array_agg(account_id), MAX(rows_scanned) INTO processed_ids, rows_read FROM insertions;
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Account insertion completed in %. Scanned % rows from temporary_data', query_time, rows_read;

        start_time := clock_timestamp();
        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Count processed in %. Processed % records', query_time, processed_count;

        -- Update inserted timestamp
        start_time := clock_timestamp();
        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as account_id
        ),
        update_result AS (
            UPDATE temporary_data td
            SET inserted = CURRENT_TIMESTAMP
            FROM processed_ids_table pit
            WHERE td.type = 'import_account' 
            AND (td.data->>'account_id')::text = pit.account_id
            AND td.timestamp < process_cutoff_time
            RETURNING td.*
        )
        SELECT COUNT(*) INTO rows_read FROM update_result;
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Updated inserted timestamps in %. Updated % rows', query_time, rows_read;

        -- Get error records
        start_time := clock_timestamp();
        WITH error_scan AS (
            SELECT (data->>'account_id')::text as error_id,
                   count(*) OVER () as total_scanned
            FROM temporary_data
            WHERE type = 'import_account'
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