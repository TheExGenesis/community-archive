CREATE OR REPLACE FUNCTION private.tes_process_tweet_records(process_cutoff_time TIMESTAMP)
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
        RAISE NOTICE 'Starting tweet processing at %', clock_timestamp();

        start_time := clock_timestamp();
        WITH latest_records AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'tweet_id')::text 
                    ORDER BY (data->>'created_at')::timestamp with time zone DESC
                ) as rn,
                count(*) OVER () as total_rows
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
            RETURNING tweet_id, (SELECT total_rows FROM latest_records LIMIT 1) as rows_scanned
        )
        SELECT array_agg(tweet_id), MAX(rows_scanned) INTO processed_ids, rows_read FROM insertions;
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Tweet insertion completed in %. Scanned % rows from temporary_data', query_time, rows_read;

        start_time := clock_timestamp();
        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Count processed in %. Processed % records', query_time, processed_count;

        start_time := clock_timestamp();
        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as tweet_id
        ),
        update_result AS (
            UPDATE temporary_data td
            SET inserted = CURRENT_TIMESTAMP
            FROM processed_ids_table pit
            WHERE td.type = 'import_tweet' 
            AND (td.data->>'tweet_id')::text = pit.tweet_id
            AND td.timestamp < process_cutoff_time
            RETURNING td.*
        )
        SELECT COUNT(*) INTO rows_read FROM update_result;
        query_time := clock_timestamp() - start_time;
        RAISE NOTICE 'Updated inserted timestamps in %. Updated % rows', query_time, rows_read;

        start_time := clock_timestamp();
        WITH error_scan AS (
            SELECT (data->>'tweet_id')::text as error_id,
                   count(*) OVER () as total_scanned
            FROM temporary_data
            WHERE type = 'import_tweet'
            AND (data->>'tweet_id')::text IS NOT NULL
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