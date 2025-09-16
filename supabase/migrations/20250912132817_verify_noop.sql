set check_function_bodies = off;

CREATE OR REPLACE FUNCTION ca_website.compute_hourly_scraping_stats(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(period_start timestamp with time zone, period_end timestamp with time zone, tweet_count bigint, unique_scrapers integer)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH hours AS (
        SELECT 
            date_trunc('hour', h) as hour_start,
            date_trunc('hour', h) + interval '1 hour' as hour_end
        FROM generate_series(
            date_trunc('hour', p_start_date),
            date_trunc('hour', p_end_date),
            interval '1 hour'
        ) h
    ),
    stats AS (
        SELECT
            h.hour_start,
            h.hour_end,
            COUNT(t.tweet_id) as tweet_count,
            0 as unique_scrapers  -- For now, not tracked for streamed tweets
        FROM hours h
        LEFT JOIN public.tweets t ON 
            t.created_at >= h.hour_start AND 
            t.created_at < h.hour_end AND
            t.archive_upload_id IS NULL  -- Only streamed tweets
        GROUP BY h.hour_start, h.hour_end
    )
    SELECT 
        s.hour_start as period_start,
        s.hour_end as period_end,
        COALESCE(s.tweet_count, 0) as tweet_count,
        COALESCE(s.unique_scrapers, 0) as unique_scrapers
    FROM stats s
    ORDER BY s.hour_start;
END;
$function$
;


drop function if exists "private"."archive_temp_data"(batch_size integer, max_runtime_seconds integer, age_interval interval);

drop function if exists "private"."commit_temp_data_test"(p_suffix text);

drop function if exists "private"."count_liked_tweets_in_replies"();

drop function if exists "private"."get_reply_to_user_counts"();

drop function if exists "private"."get_tweets_in_user_conversations"(username_ text);

drop function if exists "private"."get_user_conversations"(username_ text);

drop function if exists "private"."post_upload_update_conversation_ids"();

drop function if exists "private"."pretty_tweet_info"(input_tweet_id text);

drop function if exists "private"."process_jobs"();

drop function if exists "private"."refresh_account_activity_summary"();

drop function if exists "private"."snapshot_pg_stat_statements"();

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.time_conversation_update(since_timestamp timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    start_time TIMESTAMP WITH TIME ZONE;
    end_time TIMESTAMP WITH TIME ZONE;
    result INTEGER;
    duration_ms NUMERIC;
BEGIN
    start_time := clock_timestamp();
    
    SELECT private.update_conversation_ids_since(since_timestamp) INTO result;
    
    end_time := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    RETURN json_build_object(
        'tweets_processed', result,
        'duration_ms', duration_ms,
        'start_time', start_time,
        'end_time', end_time,
        'since_timestamp', since_timestamp
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION private.update_conversation_ids()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    affected_rows INTEGER := 0;
    current_tweet RECORD;
    current_conversation_id BIGINT;
    error_message TEXT;
    lock_key BIGINT;
BEGIN
    lock_key := hashtext('private' || '.' || 'update_conversation_ids')::BIGINT;
    
    -- Obtain an advisory lock using the calculated key
    PERFORM pg_advisory_lock(lock_key);
    -- Create a temporary table to store processed tweets
    CREATE TEMPORARY TABLE temp_processed_tweets (
        tweet_id text PRIMARY KEY,
        conversation_id text
    );

    -- Create an index on the temporary table
    CREATE INDEX idx_temp_conversation_id ON temp_processed_tweets(conversation_id);

    -- Process tweets in order
    FOR current_tweet IN (SELECT tweet_id, reply_to_tweet_id FROM tweets ORDER BY tweet_id) LOOP
        IF current_tweet.reply_to_tweet_id IS NULL THEN
            current_conversation_id := current_tweet.tweet_id;
        ELSE
            SELECT conversation_id INTO current_conversation_id
            FROM temp_processed_tweets
            WHERE tweet_id = current_tweet.reply_to_tweet_id;

            IF current_conversation_id IS NULL THEN
                CONTINUE;
            END IF;
        END IF;

        -- Insert or update the conversation record
        INSERT INTO conversations (tweet_id, conversation_id)
        VALUES (current_tweet.tweet_id, current_conversation_id)
        ON CONFLICT (tweet_id) DO UPDATE
        SET conversation_id = EXCLUDED.conversation_id
        WHERE conversations.conversation_id IS DISTINCT FROM EXCLUDED.conversation_id;

        -- Insert into the temporary table
        INSERT INTO temp_processed_tweets (tweet_id, conversation_id)
        VALUES (current_tweet.tweet_id, current_conversation_id);

        affected_rows := affected_rows + 1;
    END LOOP;

    -- Clean up
    DROP TABLE temp_processed_tweets;
    PERFORM pg_advisory_unlock(lock_key);
    RETURN affected_rows;
EXCEPTION
    WHEN OTHERS THEN
        DROP TABLE IF EXISTS temp_processed_tweets;
        PERFORM pg_advisory_unlock(lock_key);
        GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
        RAISE EXCEPTION 'An error occurred in update_conversation_ids: %', error_message;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.update_conversation_ids_since(since_timestamp timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    affected_rows INTEGER := 0;
    current_tweet RECORD;
    current_conversation_id BIGINT;
    error_message TEXT;
    lock_key BIGINT;
    where_clause TEXT;
BEGIN
    lock_key := hashtext('private' || '.' || 'update_conversation_ids_since')::BIGINT;
    
    PERFORM pg_advisory_lock(lock_key);
    
    CREATE TEMPORARY TABLE temp_processed_tweets (
        tweet_id text PRIMARY KEY,
        conversation_id text
    );

    CREATE INDEX idx_temp_conversation_id ON temp_processed_tweets(conversation_id);

    where_clause := CASE 
        WHEN since_timestamp IS NOT NULL THEN 
            'WHERE updated_at >= ''' || since_timestamp || ''''
        ELSE 
            ''
    END;

    FOR current_tweet IN 
        EXECUTE format('SELECT tweet_id, reply_to_tweet_id FROM tweets %s ORDER BY tweet_id', where_clause)
    LOOP
        IF current_tweet.reply_to_tweet_id IS NULL THEN
            current_conversation_id := current_tweet.tweet_id;
        ELSE
            SELECT conversation_id INTO current_conversation_id
            FROM temp_processed_tweets
            WHERE tweet_id = current_tweet.reply_to_tweet_id;

            IF current_conversation_id IS NULL THEN
                SELECT conversation_id INTO current_conversation_id
                FROM conversations
                WHERE tweet_id = current_tweet.reply_to_tweet_id;
            END IF;

            IF current_conversation_id IS NULL THEN
                CONTINUE;
            END IF;
        END IF;

        INSERT INTO conversations (tweet_id, conversation_id)
        VALUES (current_tweet.tweet_id, current_conversation_id)
        ON CONFLICT (tweet_id) DO UPDATE
        SET conversation_id = EXCLUDED.conversation_id
        WHERE conversations.conversation_id IS DISTINCT FROM EXCLUDED.conversation_id;

        INSERT INTO temp_processed_tweets (tweet_id, conversation_id)
        VALUES (current_tweet.tweet_id, current_conversation_id);

        affected_rows := affected_rows + 1;
    END LOOP;

    DROP TABLE temp_processed_tweets;
    PERFORM pg_advisory_unlock(lock_key);

    RETURN affected_rows;
EXCEPTION
    WHEN OTHERS THEN
        DROP TABLE IF EXISTS temp_processed_tweets;
        PERFORM pg_advisory_unlock(lock_key);
        GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
        RAISE EXCEPTION 'An error occurred in update_conversation_ids_since: %', error_message;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.update_conversation_ids_since_v2(since_timestamp timestamp with time zone DEFAULT NULL::timestamp with time zone, batch_size integer DEFAULT 10000)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    affected_rows INTEGER := 0;
    processed_batches INTEGER := 0;
    current_tweet RECORD;
    current_conversation_id BIGINT;
    error_message TEXT;
    lock_key BIGINT;
    start_time TIMESTAMP WITH TIME ZONE;
    end_time TIMESTAMP WITH TIME ZONE;
    cursor_tweets CURSOR(ts TIMESTAMP WITH TIME ZONE) FOR
        SELECT tweet_id, reply_to_tweet_id 
        FROM tweets 
        WHERE (ts IS NULL OR updated_at >= ts)
        ORDER BY tweet_id
        LIMIT batch_size;
BEGIN
    start_time := clock_timestamp();
    
    lock_key := hashtext('private' || '.' || 'update_conversation_ids_since_v2')::BIGINT;
    
    IF NOT pg_try_advisory_lock(lock_key) THEN
        RAISE EXCEPTION 'Could not obtain lock - another conversation update is running';
    END IF;

    OPEN cursor_tweets(since_timestamp);
    
    LOOP
        FETCH cursor_tweets INTO current_tweet;
        EXIT WHEN NOT FOUND;
        
        IF current_tweet.reply_to_tweet_id IS NULL THEN
            current_conversation_id := current_tweet.tweet_id;
        ELSE
            SELECT conversation_id INTO current_conversation_id
            FROM conversations
            WHERE tweet_id = current_tweet.reply_to_tweet_id;
            
            IF current_conversation_id IS NULL THEN
                CONTINUE;
            END IF;
        END IF;
        
        INSERT INTO conversations (tweet_id, conversation_id)
        VALUES (current_tweet.tweet_id, current_conversation_id)
        ON CONFLICT (tweet_id) DO UPDATE
        SET conversation_id = EXCLUDED.conversation_id
        WHERE conversations.conversation_id IS DISTINCT FROM EXCLUDED.conversation_id;
        
        affected_rows := affected_rows + 1;
        
        IF affected_rows % 1000 = 0 THEN
            COMMIT;
        END IF;
    END LOOP;
    
    CLOSE cursor_tweets;
    processed_batches := 1;
    
    PERFORM pg_advisory_unlock(lock_key);
    
    end_time := clock_timestamp();
    
    RETURN json_build_object(
        'tweets_processed', affected_rows,
        'batches_processed', processed_batches,
        'duration_ms', EXTRACT(EPOCH FROM (end_time - start_time)) * 1000,
        'start_time', start_time,
        'end_time', end_time,
        'since_timestamp', since_timestamp,
        'batch_size', batch_size
    );
    
EXCEPTION
    WHEN OTHERS THEN
        IF cursor_tweets%ISOPEN THEN
            CLOSE cursor_tweets;
        END IF;
        
        PERFORM pg_advisory_unlock(lock_key);
        
        GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
        RAISE EXCEPTION 'An error occurred in update_conversation_ids_since_v2: %', error_message;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.update_conversation_ids_since_v3(since_timestamp timestamp with time zone DEFAULT NULL::timestamp with time zone, batch_size integer DEFAULT 10000)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    affected_rows INTEGER := 0;
    processed_tweets INTEGER := 0;
    current_tweet RECORD;
    current_conversation_id BIGINT;
    error_message TEXT;
    lock_key BIGINT;
    start_time TIMESTAMP WITH TIME ZONE;
    end_time TIMESTAMP WITH TIME ZONE;
BEGIN
    start_time := clock_timestamp();
    
    lock_key := hashtext('private' || '.' || 'update_conversation_ids_since_v3')::BIGINT;
    
    IF NOT pg_try_advisory_lock(lock_key) THEN
        RAISE EXCEPTION 'Could not obtain lock - another conversation update is running';
    END IF;

    FOR current_tweet IN
        SELECT tweet_id, reply_to_tweet_id 
        FROM tweets 
        WHERE (since_timestamp IS NULL OR updated_at >= since_timestamp)
        ORDER BY tweet_id
        LIMIT batch_size
    LOOP
        processed_tweets := processed_tweets + 1;
        
        IF current_tweet.reply_to_tweet_id IS NULL THEN
            current_conversation_id := current_tweet.tweet_id;
        ELSE
            SELECT conversation_id INTO current_conversation_id
            FROM conversations
            WHERE tweet_id = current_tweet.reply_to_tweet_id;
            
            IF current_conversation_id IS NULL THEN
                CONTINUE;
            END IF;
        END IF;
        
        INSERT INTO conversations (tweet_id, conversation_id)
        VALUES (current_tweet.tweet_id, current_conversation_id)
        ON CONFLICT (tweet_id) DO UPDATE
        SET conversation_id = EXCLUDED.conversation_id
        WHERE conversations.conversation_id IS DISTINCT FROM EXCLUDED.conversation_id;
        
        IF FOUND THEN
            affected_rows := affected_rows + 1;
        END IF;
    END LOOP;
    
    PERFORM pg_advisory_unlock(lock_key);
    
    end_time := clock_timestamp();
    
    RETURN json_build_object(
        'tweets_processed', processed_tweets,
        'conversations_updated', affected_rows,
        'duration_ms', EXTRACT(EPOCH FROM (end_time - start_time)) * 1000,
        'tweets_per_second', ROUND(processed_tweets / GREATEST(EXTRACT(EPOCH FROM (end_time - start_time)), 0.001)),
        'start_time', start_time,
        'end_time', end_time,
        'since_timestamp', since_timestamp,
        'batch_size', batch_size
    );
    
EXCEPTION
    WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(lock_key);
        
        GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
        RAISE EXCEPTION 'An error occurred in update_conversation_ids_since_v3: %', error_message;
END;
$function$
;


set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.apply_public_entities_rls_policies(schema_name text, table_name text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    policy_name TEXT;
BEGIN
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);
    FOR policy_name IN (
        SELECT policyname FROM pg_policies WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP;
    EXECUTE format('
        CREATE POLICY "Entities are publicly visible" ON %I.%I
        FOR SELECT
        USING (true)', schema_name, table_name);
    EXECUTE format('
        CREATE POLICY "Entities are modifiable by their users" ON %I.%I TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.tweets dt 
                WHERE dt.tweet_id = %I.tweet_id 
                AND dt.account_id = (SELECT auth.jwt() ->> ''sub'')
            )
        ) 
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.tweets dt 
                WHERE dt.tweet_id = %I.tweet_id 
                AND dt.account_id = (SELECT auth.jwt() ->> ''sub'')
            )
        )', schema_name, table_name, table_name, table_name);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_public_liked_tweets_rls_policies(schema_name text, table_name text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    policy_name TEXT;
BEGIN
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);
    FOR policy_name IN (
        SELECT policyname FROM pg_policies WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP;
    EXECUTE format('CREATE POLICY "Entities are publicly visible" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
    EXECUTE format('CREATE POLICY "Entities are modifiable by their users" ON %I.%I to authenticated  USING (EXISTS (SELECT 1 FROM public.account dt WHERE dt.account_id = (select auth.jwt()) -> ''app_metadata'' ->> ''provider_id'')) WITH CHECK (EXISTS (SELECT 1 FROM public.account dt WHERE dt.account_id = (select auth.jwt()) -> ''app_metadata'' ->> ''provider_id''))', schema_name, table_name, schema_name, table_name, schema_name, table_name);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_public_rls_policies(schema_name text, table_name text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    policy_name TEXT;
BEGIN
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);
    FOR policy_name IN (
        SELECT policyname FROM pg_policies WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP; 
    EXECUTE format('
        CREATE POLICY "Data is publicly visible" ON %I.%I
        FOR SELECT
        USING (true)', schema_name, table_name);
    EXECUTE format('
        CREATE POLICY "Data is modifiable by their users" ON %I.%I TO authenticated 
        USING (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        ) 
        WITH CHECK (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        )', schema_name, table_name);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_public_rls_policies_not_private(schema_name text, table_name text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    policy_name TEXT;
BEGIN
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);
    FOR policy_name IN (
        SELECT policyname FROM pg_policies WHERE schemaname = schema_name AND tablename = table_name
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
$function$
;

CREATE OR REPLACE FUNCTION public.apply_readonly_rls_policies(schema_name text, table_name text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    policy_name TEXT;
BEGIN
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);
    FOR policy_name IN (
        SELECT policyname FROM pg_policies WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP; 
    EXECUTE format('CREATE POLICY "Public read access" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_tweets(p_tweet_ids text[])
 RETURNS TABLE(deleted_tweets integer, deleted_conversations integer, deleted_tweet_media integer, deleted_user_mentions integer, deleted_tweet_urls integer, deleted_private_tweet_user integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '10min'
AS $function$
DECLARE
    v_deleted_tweets INTEGER := 0;
    v_deleted_conversations INTEGER := 0;
    v_deleted_tweet_media INTEGER := 0;
    v_deleted_user_mentions INTEGER := 0;
    v_deleted_tweet_urls INTEGER := 0;
    v_deleted_private_tweet_user INTEGER := 0;
    v_quote_tweets_affected BOOLEAN := FALSE;
BEGIN
    -- Validate input
    IF p_tweet_ids IS NULL OR array_length(p_tweet_ids, 1) = 0 THEN
        RAISE EXCEPTION 'tweet_ids array cannot be null or empty';
    END IF;

    -- Remove any null or empty values from the array
    p_tweet_ids := array_remove(p_tweet_ids, NULL);
    p_tweet_ids := array_remove(p_tweet_ids, '');
    
    IF array_length(p_tweet_ids, 1) = 0 THEN
        RAISE EXCEPTION 'No valid tweet IDs provided after filtering';
    END IF;

    -- Start transaction block for atomic operations
    BEGIN
        -- Check if any of the tweets to be deleted are referenced in quote_tweets
        -- This will help us decide if we need to refresh the materialized view
        SELECT EXISTS(
            SELECT 1 FROM public.quote_tweets 
            WHERE tweet_id = ANY(p_tweet_ids) OR quoted_tweet_id = ANY(p_tweet_ids)
        ) INTO v_quote_tweets_affected;

        -- Delete from dependent tables first (to handle foreign key constraints)
        
        -- 1. Delete from conversations
        WITH deleted AS (
            DELETE FROM public.conversations 
            WHERE tweet_id = ANY(p_tweet_ids)
            RETURNING 1
        )
        SELECT COUNT(*) INTO v_deleted_conversations FROM deleted;

        -- 2. Delete from tweet_media
        WITH deleted AS (
            DELETE FROM public.tweet_media 
            WHERE tweet_id = ANY(p_tweet_ids)
            RETURNING 1
        )
        SELECT COUNT(*) INTO v_deleted_tweet_media FROM deleted;

        -- 3. Delete from user_mentions
        WITH deleted AS (
            DELETE FROM public.user_mentions 
            WHERE tweet_id = ANY(p_tweet_ids)
            RETURNING 1
        )
        SELECT COUNT(*) INTO v_deleted_user_mentions FROM deleted;

        -- 4. Delete from tweet_urls
        WITH deleted AS (
            DELETE FROM public.tweet_urls 
            WHERE tweet_id = ANY(p_tweet_ids)
            RETURNING 1
        )
        SELECT COUNT(*) INTO v_deleted_tweet_urls FROM deleted;

        -- 5. Delete from private.tweet_user (if it exists and has data)
        BEGIN
            WITH deleted AS (
                DELETE FROM private.tweet_user 
                WHERE tweet_id = ANY(p_tweet_ids)
                RETURNING 1
            )
            SELECT COUNT(*) INTO v_deleted_private_tweet_user FROM deleted;
        EXCEPTION
            WHEN undefined_table THEN
                -- Table doesn't exist, that's fine
                v_deleted_private_tweet_user := 0;
            WHEN insufficient_privilege THEN
                -- No access to private schema, that's fine
                v_deleted_private_tweet_user := 0;
        END;

        -- 6. Finally delete from the main tweets table
        WITH deleted AS (
            DELETE FROM public.tweets 
            WHERE tweet_id = ANY(p_tweet_ids)
            RETURNING 1
        )
        SELECT COUNT(*) INTO v_deleted_tweets FROM deleted;

        -- 7. Refresh quote_tweets materialized view if needed (optional async)
        IF v_quote_tweets_affected THEN
            -- Optionally notify/refresh
            -- REFRESH MATERIALIZED VIEW CONCURRENTLY public.quote_tweets;
        END IF;

        -- Return the results
        RETURN QUERY SELECT 
            v_deleted_tweets,
            v_deleted_conversations,
            v_deleted_tweet_media,
            v_deleted_user_mentions,
            v_deleted_tweet_urls,
            v_deleted_private_tweet_user;

    EXCEPTION WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE NOTICE 'Error deleting tweets %: %', array_to_string(p_tweet_ids, ', '), SQLERRM;
        RAISE;
    END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_account_most_mentioned_accounts(username_ text, limit_ integer)
 RETURNS TABLE(user_id text, name text, screen_name text, mention_count bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
    user_id text;
BEGIN
    SELECT account_id INTO user_id
    FROM public.account
    WHERE username = username_;

    IF user_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH TopMentionedUsers AS (
        SELECT
            um.mentioned_user_id,
            COUNT(*) AS mention_count
        FROM
            public.user_mentions um
        JOIN
            public.tweets t ON um.tweet_id = t.tweet_id
        WHERE
            t.account_id = user_id
            AND um.mentioned_user_id <> '-1'
        GROUP BY
            um.mentioned_user_id
        ORDER BY
            mention_count DESC
        LIMIT limit_
    )
    SELECT
        t.mentioned_user_id as user_id,
        mu.name,
        mu.screen_name,
        t.mention_count
    FROM
        TopMentionedUsers t
    LEFT JOIN
        public.mentioned_users mu ON t.mentioned_user_id = mu.user_id
    ORDER BY
        t.mention_count DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_main_thread(p_conversation_id text)
 RETURNS TABLE(tweet_id text, conversation_id text, reply_to_tweet_id text, account_id text, depth integer, max_depth integer, favorite_count integer, retweet_count integer)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH RECURSIVE main_thread AS (
        SELECT tweets.tweet_id, c.conversation_id, tweets.reply_to_tweet_id,
               tweets.account_id,
               0 AS depth, tweets.favorite_count, tweets.retweet_count
        FROM tweets 
        LEFT JOIN conversations c ON tweets.tweet_id = c.tweet_id
        WHERE c.conversation_id = p_conversation_id
          AND tweets.reply_to_tweet_id IS NULL
       
        UNION ALL
       
        SELECT t.tweet_id, c.conversation_id, t.reply_to_tweet_id, t.account_id,
               mt.depth + 1, t.favorite_count, t.retweet_count
        FROM tweets t
        LEFT JOIN conversations c ON t.tweet_id = c.tweet_id
        JOIN main_thread mt ON t.reply_to_tweet_id = mt.tweet_id
        WHERE t.account_id = mt.account_id
          AND c.conversation_id = p_conversation_id
    ),
    thread_summary AS (
        SELECT main_thread.conversation_id,
               main_thread.account_id,
               MAX(main_thread.depth) AS max_depth
        FROM main_thread
        GROUP BY main_thread.conversation_id, main_thread.account_id
    )
    SELECT mt.tweet_id, mt.conversation_id, mt.reply_to_tweet_id, mt.account_id, 
           mt.depth, ts.max_depth, mt.favorite_count, mt.retweet_count
    FROM main_thread mt
    JOIN thread_summary ts ON mt.conversation_id = ts.conversation_id AND mt.account_id = ts.account_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_most_mentioned_accounts_by_username(username_ text)
 RETURNS TABLE(mentioned_user_id text, mentioned_username text, mention_count bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
    user_id text;
BEGIN
    SELECT account_id INTO user_id
    FROM public.account
    WHERE username = username_;
    IF user_id IS NULL THEN
        RETURN;
    END IF;
    RETURN QUERY
    WITH TopMentionedUsers AS (
        SELECT
            um.mentioned_user_id,
            COUNT(*) AS mention_count
        FROM
            public.user_mentions um
        JOIN
            public.tweets t ON um.tweet_id = t.tweet_id
        WHERE
            t.account_id = user_id
        GROUP BY
            um.mentioned_user_id
        ORDER BY
            mention_count DESC
        LIMIT 100
    )
    SELECT
        t.mentioned_user_id,
        mu.screen_name AS mentioned_username,
        t.mention_count
    FROM
        TopMentionedUsers t
    LEFT JOIN
        public.mentioned_users mu ON t.mentioned_user_id = mu.user_id
    ORDER BY
        t.mention_count DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_top_liked_users()
 RETURNS TABLE(tweet_id text, full_text text, like_count bigint, reply_to_tweet_id text, reply_to_user_id text, reply_to_username text)
 LANGUAGE plpgsql
 SET statement_timeout TO '30min'
AS $function$
BEGIN
    RETURN QUERY
    WITH TopLikedUsers AS (
        SELECT
            lt.tweet_id,
            lt.full_text,
            COUNT(*) AS like_count
        FROM
            public.likes l
        JOIN
            public.liked_tweets lt ON l.liked_tweet_id = lt.tweet_id
        GROUP BY
            lt.tweet_id
        ORDER BY
            like_count DESC
        LIMIT
            100
    )
    SELECT
        tl.tweet_id,
        tl.full_text,
        tl.like_count,
        t.reply_to_tweet_id,
        t.reply_to_user_id,
        t.reply_to_username
    FROM
        TopLikedUsers tl
    JOIN
        public.tweets t ON t.reply_to_tweet_id = tl.tweet_id
    JOIN
        public.mentioned_users um ON um.user_id = t.reply_to_user_id
    ORDER BY
        tl.like_count DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_tweets(search_query text, from_user text DEFAULT NULL::text, to_user text DEFAULT NULL::text, since_date date DEFAULT NULL::date, until_date date DEFAULT NULL::date, limit_ integer DEFAULT 50, offset_ integer DEFAULT 0)
 RETURNS TABLE(tweet_id text, account_id text, created_at timestamp with time zone, full_text text, retweet_count integer, favorite_count integer, reply_to_tweet_id text, avatar_media_url text, archive_upload_id bigint, username text, account_display_name text, media jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '5min'
AS $function$
DECLARE
    from_account_id TEXT;
    to_account_id TEXT;
    current_user_account_id TEXT;
BEGIN
    -- Get the current logged-in user's account_id
    BEGIN
        current_user_account_id := (SELECT (auth.jwt() -> 'app_metadata'::text) ->> 'account_id'::text);
    EXCEPTION
        WHEN OTHERS THEN
            current_user_account_id := NULL;
    END;

    -- Get account_id for from_user
    IF from_user IS NOT NULL THEN
        SELECT a.account_id INTO from_account_id
        FROM public.account AS a
        WHERE LOWER(a.username) = LOWER(from_user);

        IF from_account_id IS NULL THEN
            RETURN;
        END IF;
    END IF;

    -- Get account_id for to_user
    IF to_user IS NOT NULL THEN
        SELECT a.account_id INTO to_account_id
        FROM public.account AS a
        WHERE LOWER(a.username) = LOWER(to_user);

        IF to_account_id IS NULL THEN
            RETURN;
        END IF;
    END IF;

    RETURN QUERY
    WITH matching_tweets AS (
        SELECT t.tweet_id
        FROM public.tweets t
        JOIN public.archive_upload au ON t.archive_upload_id = au.id
        WHERE (search_query = '' OR search_query IS NULL OR t.fts @@ to_tsquery('english', search_query))
          AND (from_account_id IS NULL OR t.account_id = from_account_id)
          AND (to_account_id IS NULL OR t.reply_to_user_id = to_account_id)
          AND (since_date IS NULL OR t.created_at >= since_date)
          AND (until_date IS NULL OR t.created_at <= until_date)
          AND (au.keep_private IS FALSE OR t.account_id = current_user_account_id OR current_user_account_id IS NULL)
        ORDER BY t.created_at DESC
        OFFSET offset_
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
        p.archive_upload_id AS profile_archive_upload_id,
        a.username,
        a.account_display_name,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'media_url', tm.media_url,
                'media_type', tm.media_type,
                'width', tm.width,
                'height', tm.height
            ) ORDER BY tm.media_id)
            FROM public.tweet_media tm
            WHERE tm.tweet_id = t.tweet_id
        ) AS media
    FROM matching_tweets mt
    JOIN public.tweets t ON mt.tweet_id = t.tweet_id
    JOIN public.account a ON t.account_id = a.account_id
    LEFT JOIN LATERAL (
        SELECT prof.avatar_media_url, prof.archive_upload_id
        FROM public.profile AS prof
        WHERE prof.account_id = t.account_id
        ORDER BY prof.archive_upload_id DESC
        LIMIT 1
    ) p ON true
    ORDER BY t.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_foreign_keys(old_table_name text, new_table_name text, schema_name text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    constraint_record record;
BEGIN
    -- Begin transaction
    BEGIN
        FOR constraint_record IN 
            SELECT 
                tc.table_name,
                tc.constraint_name,
                kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND ccu.table_name = old_table_name
                AND tc.table_schema = schema_name
        LOOP
            -- Drop old constraint
            EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
                schema_name,
                constraint_record.table_name,
                constraint_record.constraint_name
            );
            -- Add new constraint without validation
            EXECUTE format(
                'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(%I) NOT VALID',
                schema_name,
                constraint_record.table_name,
                constraint_record.constraint_name,
                constraint_record.column_name,
                schema_name,
                new_table_name,
                constraint_record.column_name
            );
            -- Validate the constraint
            EXECUTE format(
                'ALTER TABLE %I.%I VALIDATE CONSTRAINT %I',
                schema_name,
                constraint_record.table_name,
                constraint_record.constraint_name
            );
            RAISE NOTICE 'Updated foreign key for table: %.%', schema_name, constraint_record.table_name;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        -- If there's an error, rollback everything
        RAISE NOTICE 'Error occurred: %', SQLERRM;
        RAISE;
    END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.word_occurrences(search_word text, start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, user_ids text[] DEFAULT NULL::text[])
 RETURNS TABLE(month text, word_count bigint)
 LANGUAGE plpgsql
AS $function$BEGIN
    RETURN QUERY
    SELECT
        to_char(t.created_at, 'YYYY-MM') AS month,
        COUNT(*) AS word_count
    FROM
        public.tweets t
    WHERE
        t.fts @@ to_tsquery(replace(search_word, ' ', '+'))
        AND (t.created_at BETWEEN start_date AND end_date OR start_date IS NULL OR end_date IS NULL)
        AND (t.account_id = ANY(user_ids) OR user_ids IS NULL)
    GROUP BY
        month
    ORDER BY
        month;
END;$function$
;


