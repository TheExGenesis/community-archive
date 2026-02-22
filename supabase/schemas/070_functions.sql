-- Functions split from prod.sql (kept behavior identical)

-- Queue jobs on archive changes
CREATE OR REPLACE FUNCTION "private"."queue_archive_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RAISE NOTICE 'queue_archive_changes: Queueing job: archive_changes';
    -- Insert with UUID key - no ON CONFLICT since UUIDs are unique
    INSERT INTO private.job_queue (key, job_name, status)
    VALUES (gen_random_uuid(), 'archive_changes', 'QUEUED');
    
    RETURN NEW;
END;
$$;

ALTER FUNCTION "private"."queue_archive_changes"() OWNER TO "postgres";


-- Queue materialized view refresh
CREATE OR REPLACE FUNCTION "private"."queue_refresh_activity_summary"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RAISE NOTICE 'queue_refresh_activity_summary: Queueing job: refresh_activity_summary';
    -- Insert with UUID key
    INSERT INTO private.job_queue (key, job_name, status)
    VALUES (gen_random_uuid(), 'refresh_activity_summary', 'QUEUED');
    
    RETURN NEW;
END;
$$;

ALTER FUNCTION "private"."queue_refresh_activity_summary"() OWNER TO "postgres";


-- Queue conversation id updates
CREATE OR REPLACE FUNCTION "private"."queue_update_conversation_ids"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RAISE NOTICE 'queue_update_conversation_ids: Queueing job: update_conversation_ids';
    -- Insert with UUID key
    INSERT INTO private.job_queue (key, job_name, status)
    VALUES (gen_random_uuid(), 'update_conversation_ids', 'QUEUED');
    
    RETURN NEW;
END;
$$;

ALTER FUNCTION "private"."queue_update_conversation_ids"() OWNER TO "postgres";


-- Trigger to queue commit_temp_data when archive upload is ready
CREATE OR REPLACE FUNCTION "public"."trigger_commit_temp_data"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Only trigger when upload_phase changes to 'ready_for_commit'
    IF NEW.upload_phase = 'ready_for_commit' AND 
       (OLD.upload_phase IS NULL OR OLD.upload_phase != 'ready_for_commit') THEN
        RAISE NOTICE 'trigger_commit_temp_data: Running for account_id %', NEW.account_id;
        -- Queue the commit job with UUID key
        INSERT INTO private.job_queue (key, job_name, status, args)
        VALUES (
            gen_random_uuid(),
            'commit_temp_data', 
            'QUEUED', 
            jsonb_build_object('account_id', NEW.account_id)
        );
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trigger_commit_temp_data"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."trigger_commit_temp_data"() IS 'Queue commit_temp_data job when archive upload is ready for commit';


-- Update updated_at and track opt-in/out timestamps on optin table
CREATE OR REPLACE FUNCTION "public"."update_optin_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Track opt-in/opt-out timestamps
    IF OLD.opted_in = false AND NEW.opted_in = true THEN
        NEW.opted_in_at = NOW();
        NEW.opted_out_at = NULL;
        NEW.explicit_optout = false; -- Clear explicit opt-out when opting in
        NEW.opt_out_reason = NULL;
    ELSIF OLD.opted_in = true AND NEW.opted_in = false THEN
        NEW.opted_out_at = NOW();
    END IF;
    
    -- Handle explicit opt-out
    IF OLD.explicit_optout = false AND NEW.explicit_optout = true THEN
        NEW.opted_in = false;
        NEW.opted_out_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_optin_updated_at"() OWNER TO "postgres";


-- Generic updated_at column maintainer
CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
   BEGIN
       NEW.updated_at = CURRENT_TIMESTAMP;
       RETURN NEW;
   END;
   $$;

ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

-- Minimal private auth helpers used by grants/policies
CREATE OR REPLACE FUNCTION "private"."get_provider_id"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return (
    select provider_id from auth.identities
    where (select auth.uid()) = user_id
  );
end;
$$;

ALTER FUNCTION "private"."get_provider_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "private"."get_provider_id_internal"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT provider_id
    FROM auth.identities
    WHERE user_id = auth.uid()
    LIMIT 1;
$$;

ALTER FUNCTION "private"."get_provider_id_internal"() OWNER TO "postgres";

-- =========================
-- Hourly scraping stats (ca_website + public wrapper)
-- =========================

CREATE OR REPLACE FUNCTION "ca_website"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("period_start" timestamp with time zone, "period_end" timestamp with time zone, "tweet_count" bigint, "unique_scrapers" integer)
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "ca_website"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("period_start" timestamp with time zone, "period_end" timestamp with time zone, "tweet_count" bigint, "unique_scrapers" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM ca_website.compute_hourly_scraping_stats(p_start_date, p_end_date);
END;
$$;

ALTER FUNCTION "public"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";

-- =========================
-- Conversation ID helpers
-- =========================

CREATE OR REPLACE FUNCTION "private"."update_conversation_ids"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "private"."update_conversation_ids"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."update_conversation_ids"() IS 'Updates conversation_ids for tweets';


CREATE OR REPLACE FUNCTION "private"."update_conversation_ids_since"("since_timestamp" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "private"."update_conversation_ids_since"("since_timestamp" timestamp with time zone) OWNER TO "postgres";

COMMENT ON FUNCTION "private"."update_conversation_ids_since"("since_timestamp" timestamp with time zone) IS 'Optimized version of update_conversation_ids that can process only tweets updated since a given timestamp. \nWhen since_timestamp is NULL, processes all tweets (same as original function).\nWhen since_timestamp is provided, only processes tweets with updated_at >= since_timestamp.\nThis allows for efficient incremental updates instead of reprocessing all tweets.';


CREATE OR REPLACE FUNCTION "private"."update_conversation_ids_since_v2"("since_timestamp" timestamp with time zone DEFAULT NULL::timestamp with time zone, "batch_size" integer DEFAULT 10000) RETURNS "json"
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "private"."update_conversation_ids_since_v2"("since_timestamp" timestamp with time zone, "batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."update_conversation_ids_since_v3"("since_timestamp" timestamp with time zone DEFAULT NULL::timestamp with time zone, "batch_size" integer DEFAULT 10000) RETURNS "json"
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "private"."update_conversation_ids_since_v3"("since_timestamp" timestamp with time zone, "batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."time_conversation_update"("since_timestamp" timestamp with time zone) RETURNS "json"
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "private"."time_conversation_update"("since_timestamp" timestamp with time zone) OWNER TO "postgres";

-- =========================
-- Temp tables + FK/policy utilities
-- =========================

CREATE OR REPLACE FUNCTION "public"."create_temp_tables"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    -- Check if the user is authenticated or is the postgres/service_role
    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Drop the temporary tables if they exist
    PERFORM public.drop_temp_tables(p_suffix);

    -- Create new tables
    EXECUTE format('CREATE TABLE temp.archive_upload_%s (LIKE public.archive_upload INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.account_%s (LIKE public.account INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.profile_%s (LIKE public.profile INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.tweets_%s (LIKE public.tweets INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.mentioned_users_%s (LIKE public.mentioned_users INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.user_mentions_%s (LIKE public.user_mentions INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.tweet_urls_%s (LIKE public.tweet_urls INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.tweet_media_%s (LIKE public.tweet_media INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.followers_%s (LIKE public.followers INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.following_%s (LIKE public.following INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.liked_tweets_%s (LIKE public.liked_tweets INCLUDING ALL)', p_suffix);
    EXECUTE format('CREATE TABLE temp.likes_%s (LIKE public.likes INCLUDING ALL)', p_suffix);
END;
$$;

ALTER FUNCTION "public"."create_temp_tables"("p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."drop_temp_tables"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Basic auth check
    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN
        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    RAISE NOTICE 'drop_temp_tables called with suffix: %', p_suffix;

    EXECUTE format('DROP TABLE IF EXISTS temp.account_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.archive_upload_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.profile_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.tweets_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.mentioned_users_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.user_mentions_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.tweet_urls_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.tweet_media_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.followers_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.following_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.liked_tweets_%s', p_suffix);
    EXECUTE format('DROP TABLE IF EXISTS temp.likes_%s', p_suffix);
END;
$$;

ALTER FUNCTION "public"."drop_temp_tables"("p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."drop_all_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    policy_name TEXT;
BEGIN
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP;
END;
$$;

ALTER FUNCTION "public"."drop_all_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_foreign_keys"("old_table_name" "text", "new_table_name" "text", "schema_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "public"."update_foreign_keys"("old_table_name" "text", "new_table_name" "text", "schema_name" "text") OWNER TO "postgres";

-- =========================
-- RLS helpers (moved from prod.sql)
-- =========================

CREATE OR REPLACE FUNCTION "public"."apply_public_entities_rls_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "public"."apply_public_entities_rls_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_public_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
$$;

ALTER FUNCTION "public"."apply_public_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_public_rls_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "public"."apply_public_rls_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_public_rls_policies_not_private"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "public"."apply_public_rls_policies_not_private"("schema_name" "text", "table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_readonly_rls_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "public"."apply_readonly_rls_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";

-- =========================
-- Commit + delete helpers
-- =========================

CREATE OR REPLACE FUNCTION "public"."commit_temp_data"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '30min'
    AS $_$
DECLARE
    v_archive_upload_id BIGINT;
    v_account_id TEXT;
    v_username TEXT;
    v_archive_at TIMESTAMP WITH TIME ZONE;
    v_keep_private BOOLEAN;
    v_upload_likes BOOLEAN;
    v_start_date DATE;
    v_end_date DATE;
    v_phase_start TIMESTAMP;
    v_total_start TIMESTAMP;
    v_provider_id TEXT;
    v_count BIGINT;
    v_inserted BIGINT;
    v_total BIGINT;
BEGIN
    v_total_start := clock_timestamp();
    
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Use p_suffix as account_id
    v_account_id := p_suffix;
    
    -- Verify the JWT provider_id matches the account_id
    IF (v_provider_id IS NULL OR v_provider_id != v_account_id) 
       AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Unauthorized: provider_id %, account_id %, user %', 
            v_provider_id, v_account_id, current_user::text;
    END IF;

    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    RAISE NOTICE 'commit_temp_data called with suffix: %', p_suffix;
    
    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 1: Getting account and archive data';
    -- Remove the account_id query since we already have it
    RAISE NOTICE 'Phase 1 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 2: Getting archive upload data';
    -- Get the archive upload that's ready for commit
    SELECT id, archive_at, keep_private, upload_likes, start_date, end_date, username
    INTO v_archive_upload_id, v_archive_at, v_keep_private, v_upload_likes, v_start_date, v_end_date, v_username
    FROM public.archive_upload
    WHERE account_id = v_account_id
    AND upload_phase = 'ready_for_commit'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_archive_upload_id IS NULL THEN
        RAISE EXCEPTION 'No archive_upload found in ready_for_commit state for account %', v_account_id ;
    END IF;

    -- Update the upload phase to committing
    UPDATE public.archive_upload
    SET upload_phase = 'committing'
    WHERE id = v_archive_upload_id;

    RAISE NOTICE 'Phase 2 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 4: Inserting profile data';
    -- Insert profile data
    EXECUTE format('
        INSERT INTO public.all_profile (bio, website, location, avatar_media_url, header_media_url, account_id, archive_upload_id)
        SELECT p.bio, p.website, p.location, p.avatar_media_url, p.header_media_url, p.account_id, $1
        FROM temp.profile_%s p
        ON CONFLICT (account_id) DO UPDATE SET
            bio = EXCLUDED.bio,
            website = EXCLUDED.website,
            location = EXCLUDED.location,
            avatar_media_url = EXCLUDED.avatar_media_url,
            header_media_url = EXCLUDED.header_media_url,
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE NOTICE 'Phase 4 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 5: Inserting tweets data';
    -- Log count before insert
    EXECUTE format('SELECT COUNT(*) FROM temp.tweets_%s', p_suffix) INTO v_count;
    RAISE NOTICE 'About to insert % tweets', v_count;
    
    -- Insert tweets data
    EXECUTE format('
        INSERT INTO public.tweets (tweet_id, account_id, created_at, full_text, retweet_count, favorite_count, reply_to_tweet_id, reply_to_user_id, reply_to_username, archive_upload_id)
        SELECT t.tweet_id, t.account_id, t.created_at, t.full_text, t.retweet_count, t.favorite_count, t.reply_to_tweet_id, t.reply_to_user_id, t.reply_to_username, $1
        FROM temp.tweets_%s t
        ON CONFLICT (tweet_id) DO UPDATE SET
            full_text = EXCLUDED.full_text,
            retweet_count = EXCLUDED.retweet_count,
            favorite_count = EXCLUDED.favorite_count,
            reply_to_tweet_id = EXCLUDED.reply_to_tweet_id,
            reply_to_user_id = EXCLUDED.reply_to_user_id,
            reply_to_username = EXCLUDED.reply_to_username,
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    
    -- Log how many were actually inserted/updated
    EXECUTE format('
        SELECT 
            COUNT(*) FILTER (WHERE tweets.archive_upload_id = $1) as inserted,
            COUNT(*) FILTER (WHERE tweets.tweet_id IN (SELECT tweet_id FROM temp.tweets_%s)) as total
        FROM public.tweets
    ', p_suffix) USING v_archive_upload_id INTO v_inserted, v_total;
    RAISE NOTICE 'Inserted/Updated % out of % tweets', v_inserted, v_total;
    RAISE NOTICE 'Phase 5 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 6: Inserting tweet media data';
    -- Insert tweet_media data
    EXECUTE format('
        INSERT INTO public.tweet_media (media_id, tweet_id, media_url, media_type, width, height, archive_upload_id)
        SELECT tm.media_id, tm.tweet_id, tm.media_url, tm.media_type, tm.width, tm.height, $1
        FROM temp.tweet_media_%s tm
        ON CONFLICT (media_id) DO UPDATE SET
            media_url = EXCLUDED.media_url,
            media_type = EXCLUDED.media_type,
            width = EXCLUDED.width,
            height = EXCLUDED.height,
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE NOTICE 'Phase 6 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 7: Inserting mentioned users data';
    -- Insert mentioned_users data
    EXECUTE format('
        INSERT INTO public.mentioned_users (user_id, name, screen_name, updated_at)
        SELECT user_id, name, screen_name, updated_at
        FROM temp.mentioned_users_%s
        ON CONFLICT (user_id) DO UPDATE SET
            name = EXCLUDED.name,
            screen_name = EXCLUDED.screen_name,
            updated_at = EXCLUDED.updated_at
    ', p_suffix);
    RAISE NOTICE 'Phase 7 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 8: Inserting user mentions data';
    -- Insert user_mentions data
    EXECUTE format('
        INSERT INTO public.user_mentions (mentioned_user_id, tweet_id)
        SELECT um.mentioned_user_id, um.tweet_id
        FROM temp.user_mentions_%s um
        JOIN public.mentioned_users mu ON um.mentioned_user_id = mu.user_id
        JOIN public.tweets t ON um.tweet_id = t.tweet_id
        ON CONFLICT (mentioned_user_id, tweet_id) DO NOTHING
    ', p_suffix);
    RAISE NOTICE 'Phase 8 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 9: Inserting tweet URLs data';
    -- Insert tweet_urls data
    EXECUTE format('
        INSERT INTO public.tweet_urls (url, expanded_url, display_url, tweet_id)
        SELECT tu.url, tu.expanded_url, tu.display_url, tu.tweet_id
        FROM temp.tweet_urls_%s tu
        JOIN public.tweets t ON tu.tweet_id = t.tweet_id
        ON CONFLICT (tweet_id, url) DO NOTHING
    ', p_suffix);
    RAISE NOTICE 'Phase 9 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 10: Inserting followers data';
    -- Insert followers data
    EXECUTE format('
        INSERT INTO public.followers (account_id, follower_account_id, archive_upload_id)
        SELECT f.account_id, f.follower_account_id, $1
        FROM temp.followers_%s f
        ON CONFLICT (account_id, follower_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE NOTICE 'Phase 10 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 11: Inserting following data';
    -- Insert following data
    EXECUTE format('
        INSERT INTO public.following (account_id, following_account_id, archive_upload_id)
        SELECT f.account_id, f.following_account_id, $1
        FROM temp.following_%s f
        ON CONFLICT (account_id, following_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE NOTICE 'Phase 11 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 12: Inserting liked tweets data';
    -- Insert liked_tweets data
    EXECUTE format('
        INSERT INTO public.liked_tweets (tweet_id, full_text)
        SELECT lt.tweet_id, lt.full_text
        FROM temp.liked_tweets_%s lt
        ON CONFLICT (tweet_id) DO NOTHING
    ', p_suffix);
    RAISE NOTICE 'Phase 12 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 13: Inserting likes data';
    -- Insert likes data
    EXECUTE format('
        INSERT INTO public.likes (account_id, liked_tweet_id, archive_upload_id)
        SELECT l.account_id, l.liked_tweet_id, $1
        FROM temp.likes_%s l
        ON CONFLICT (account_id, liked_tweet_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE NOTICE 'Phase 13 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 14: Dropping temporary tables';
    -- Drop temporary tables after committing
    PERFORM public.drop_temp_tables(p_suffix);
    RAISE NOTICE 'Phase 14 completed in %', clock_timestamp() - v_phase_start;

    v_phase_start := clock_timestamp();
    RAISE NOTICE 'Phase 15: Updating upload phase to completed';
    -- Update upload_phase to 'completed' after successful execution
    UPDATE public.archive_upload
    SET upload_phase = 'completed'
    WHERE id = v_archive_upload_id;
    RAISE NOTICE 'Phase 15 completed in %', clock_timestamp() - v_phase_start;

    RAISE NOTICE 'Total execution time: %', clock_timestamp() - v_total_start;
END;
$_$;

ALTER FUNCTION "public"."commit_temp_data"("p_suffix" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."commit_temp_data"("p_suffix" "text") IS 'Commits temporary data to permanent tables and handles upload options';


CREATE OR REPLACE FUNCTION "public"."delete_tweets"("p_tweet_ids" "text"[]) RETURNS TABLE("deleted_tweets" integer, "deleted_conversations" integer, "deleted_tweet_media" integer, "deleted_user_mentions" integer, "deleted_tweet_urls" integer, "deleted_private_tweet_user" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '10min'
    AS $$
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
$$;

ALTER FUNCTION "public"."delete_tweets"("p_tweet_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_archive"("p_account_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '20min'
    AS $_$
DECLARE
    v_schema_name TEXT := 'public';
    v_archive_upload_ids BIGINT[];
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the account_id being deleted, unless postgres/service_role
    IF (current_role NOT IN ('postgres', 'service_role')) AND 
       (v_provider_id IS NULL OR v_provider_id != p_account_id) THEN
        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_account_id;
    END IF;

    SELECT ARRAY_AGG(id) INTO v_archive_upload_ids
    FROM public.archive_upload
    WHERE account_id = p_account_id;

    BEGIN
        -- Delete tweets and related data in correct order to handle foreign key constraints
        EXECUTE format('
            -- First delete from conversations since it references tweets
            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1) OR account_id = $2
            )
            DELETE FROM %I.conversations WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);

            -- Then delete other tweet-related data
            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1) OR account_id = $2
            )
            DELETE FROM %I.tweet_media WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);

            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1) OR account_id = $2
            )
            DELETE FROM %I.user_mentions WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);

            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1) OR account_id = $2
            )
            DELETE FROM %I.tweet_urls WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);

            -- Now we can safely delete the tweets
            DELETE FROM %I.tweets WHERE archive_upload_id = ANY($1) OR account_id = $2;

            -- Delete other related data
            DELETE FROM %I.likes WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.followers WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.following WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.all_profile WHERE account_id = $2;
            DELETE FROM %I.archive_upload WHERE id = ANY($1);
            DELETE FROM %I.all_account WHERE account_id = $2;
        ', 
        v_schema_name, v_schema_name, v_schema_name, v_schema_name, 
        v_schema_name, v_schema_name, v_schema_name, v_schema_name, 
        v_schema_name, v_schema_name, v_schema_name, v_schema_name,
        v_schema_name, v_schema_name, v_schema_name, v_schema_name)
        USING v_archive_upload_ids, p_account_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error deleting archives for account %: %', p_account_id, SQLERRM;
        RAISE;
    END;
END;
$_$;

ALTER FUNCTION "public"."delete_user_archive"("p_account_id" "text") OWNER TO "postgres";

-- =========================
-- TES helpers (account + follower relations)
-- =========================

CREATE OR REPLACE FUNCTION "tes"."get_current_account_id"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    SELECT a.account_id INTO v_account_id
    FROM auth.users u
    JOIN account a ON a.account_id = u.raw_user_meta_data->>'provider_id'
    WHERE u.id = auth.uid();
    
    RETURN v_account_id;
END;
$$;

ALTER FUNCTION "tes"."get_current_account_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."get_followers"() RETURNS TABLE("account_id" "text", "username" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    -- Get the current user's account_id
    v_account_id := tes.get_current_account_id();

    RETURN QUERY
    SELECT 
        f1.follower_account_id AS account_id,
        mu.screen_name AS username
    FROM public.followers f1
    LEFT JOIN mentioned_users mu ON mu.user_id = f1.follower_account_id
    WHERE f1.account_id = v_account_id and mu.screen_name is not null;
END;
$$;

ALTER FUNCTION "tes"."get_followers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."get_followings"() RETURNS TABLE("account_id" "text", "username" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    -- Get the current user's account_id
    v_account_id := tes.get_current_account_id();

    RETURN QUERY
    SELECT 
        f2.following_account_id AS account_id,
        mu.screen_name AS username
    FROM public.following f2
    LEFT JOIN mentioned_users mu ON mu.user_id = f2.following_account_id
    WHERE f2.account_id = v_account_id and mu.screen_name is not null;
END;
$$;

ALTER FUNCTION "tes"."get_followings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."get_moots"() RETURNS TABLE("account_id" "text", "username" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    -- Get the current user's account_id
    v_account_id := tes.get_current_account_id();

    RETURN QUERY
    SELECT 
        f1.follower_account_id as account_id,
        mu.screen_name as username
    FROM public.followers f1
    INNER JOIN public.following f2 
        ON f1.account_id = f2.account_id 
        AND f1.follower_account_id = f2.following_account_id
    left join mentioned_users mu on mu.user_id = f1.follower_account_id
    where f1.account_id = v_account_id;
END;
$$;

ALTER FUNCTION "tes"."get_moots"() OWNER TO "postgres";

-- =========================
-- Streaming + scraper stats
-- =========================

CREATE OR REPLACE FUNCTION "public"."get_streaming_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_granularity" "text" DEFAULT 'hour'::"text", "p_streamed_only" boolean DEFAULT true) RETURNS TABLE("period_start" timestamp with time zone, "period_end" timestamp with time zone, "tweet_count" bigint, "unique_scrapers" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF p_streamed_only THEN
        -- Use streamed-only functions (exclude system)
        IF p_granularity = 'hour' THEN
            RETURN QUERY SELECT * FROM public.get_streaming_stats_hourly_streamed_only(p_start_date, p_end_date);
        ELSIF p_granularity = 'day' THEN
            RETURN QUERY SELECT * FROM public.get_streaming_stats_daily_streamed_only(p_start_date, p_end_date);
        ELSIF p_granularity = 'week' THEN
            RETURN QUERY SELECT * FROM public.get_streaming_stats_weekly_streamed_only(p_start_date, p_end_date);
        ELSE
            RAISE EXCEPTION 'Invalid granularity: %. Must be hour, day, or week', p_granularity;
        END IF;
    ELSE
        -- Use total functions (include all)
        IF p_granularity = 'hour' THEN
            RETURN QUERY SELECT * FROM public.get_streaming_stats_hourly(p_start_date, p_end_date);
        ELSIF p_granularity = 'day' THEN
            RETURN QUERY SELECT * FROM public.get_streaming_stats_daily(p_start_date, p_end_date);
        ELSIF p_granularity = 'week' THEN
            RETURN QUERY SELECT * FROM public.get_streaming_stats_weekly(p_start_date, p_end_date);
        ELSE
            RAISE EXCEPTION 'Invalid granularity: %. Must be hour, day, or week', p_granularity;
        END IF;
    END IF;
END;
$$;

ALTER FUNCTION "public"."get_streaming_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_granularity" "text", "p_streamed_only" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_streaming_stats_daily"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("period_start" timestamp with time zone, "period_end" timestamp with time zone, "tweet_count" bigint, "unique_scrapers" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    WITH days AS (
        SELECT 
            date_trunc('day', d) as day_start,
            date_trunc('day', d) + interval '1 day' as day_end
        FROM generate_series(
            date_trunc('day', p_start_date),
            date_trunc('day', p_end_date),
            interval '1 day'
        ) d
    ),
    stats AS (
        SELECT
            date_trunc('day', tu.created_at) as day,
            COUNT(*)::bigint as tweet_count,
            COUNT(DISTINCT tu.user_id)::integer as unique_scrapers
        FROM private.tweet_user tu
        WHERE tu.created_at >= p_start_date 
          AND tu.created_at < p_end_date
        GROUP BY date_trunc('day', tu.created_at)
    )
    SELECT
        d.day_start as period_start,
        d.day_end as period_end,
        COALESCE(s.tweet_count, 0) as tweet_count,
        COALESCE(s.unique_scrapers, 0) as unique_scrapers
    FROM days d
    LEFT JOIN stats s ON s.day = d.day_start
    ORDER BY d.day_start;
END;
$$;

ALTER FUNCTION "public"."get_streaming_stats_daily"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_streaming_stats_daily_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("period_start" timestamp with time zone, "period_end" timestamp with time zone, "tweet_count" bigint, "unique_scrapers" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    WITH days AS (
        SELECT 
            date_trunc('day', d) as day_start,
            date_trunc('day', d) + interval '1 day' as day_end
        FROM generate_series(
            date_trunc('day', p_start_date),
            date_trunc('day', p_end_date),
            interval '1 day'
        ) d
    ),
    stats AS (
        SELECT
            date_trunc('day', tu.created_at) as day,
            COUNT(*)::bigint as tweet_count,
            COUNT(DISTINCT tu.user_id)::integer as unique_scrapers
        FROM private.tweet_user tu
        WHERE tu.created_at >= p_start_date 
          AND tu.created_at < p_end_date
          AND tu.user_id != 'system'  -- Exclude archive uploads
        GROUP BY date_trunc('day', tu.created_at)
    )
    SELECT
        d.day_start as period_start,
        d.day_end as period_end,
        COALESCE(s.tweet_count, 0) as tweet_count,
        COALESCE(s.unique_scrapers, 0) as unique_scrapers
    FROM days d
    LEFT JOIN stats s ON s.day = d.day_start
    ORDER BY d.day_start;
END;
$$;

ALTER FUNCTION "public"."get_streaming_stats_daily_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_streaming_stats_hourly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("period_start" timestamp with time zone, "period_end" timestamp with time zone, "tweet_count" bigint, "unique_scrapers" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
            date_trunc('hour', tu.created_at) as hour,
            COUNT(*)::bigint as tweet_count,
            COUNT(DISTINCT tu.user_id)::integer as unique_scrapers
        FROM private.tweet_user tu
        WHERE tu.created_at >= p_start_date 
          AND tu.created_at < p_end_date
        GROUP BY date_trunc('hour', tu.created_at)
    )
    SELECT
        h.hour_start as period_start,
        h.hour_end as period_end,
        COALESCE(s.tweet_count, 0) as tweet_count,
        COALESCE(s.unique_scrapers, 0) as unique_scrapers
    FROM hours h
    LEFT JOIN stats s ON s.hour = h.hour_start
    ORDER BY h.hour_start;
END;
$$;

ALTER FUNCTION "public"."get_streaming_stats_hourly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_streaming_stats_hourly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("period_start" timestamp with time zone, "period_end" timestamp with time zone, "tweet_count" bigint, "unique_scrapers" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
            date_trunc('hour', tu.created_at) as hour,
            COUNT(*)::bigint as tweet_count,
            COUNT(DISTINCT tu.user_id)::integer as unique_scrapers
        FROM private.tweet_user tu
        WHERE tu.created_at >= p_start_date 
          AND tu.created_at < p_end_date
          AND tu.user_id != 'system'  -- Exclude archive uploads
        GROUP BY date_trunc('hour', tu.created_at)
    )
    SELECT
        h.hour_start as period_start,
        h.hour_end as period_end,
        COALESCE(s.tweet_count, 0) as tweet_count,
        COALESCE(s.unique_scrapers, 0) as unique_scrapers
    FROM hours h
    LEFT JOIN stats s ON s.hour = h.hour_start
    ORDER BY h.hour_start;
END;
$$;

ALTER FUNCTION "public"."get_streaming_stats_hourly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_streaming_stats_weekly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("period_start" timestamp with time zone, "period_end" timestamp with time zone, "tweet_count" bigint, "unique_scrapers" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    WITH weeks AS (
        SELECT 
            date_trunc('week', w) as week_start,
            date_trunc('week', w) + interval '1 week' as week_end
        FROM generate_series(
            date_trunc('week', p_start_date),
            date_trunc('week', p_end_date),
            interval '1 week'
        ) w
    ),
    stats AS (
        SELECT
            date_trunc('week', tu.created_at) as week,
            COUNT(*)::bigint as tweet_count,
            COUNT(DISTINCT tu.user_id)::integer as unique_scrapers
        FROM private.tweet_user tu
        WHERE tu.created_at >= p_start_date 
          AND tu.created_at < p_end_date
        GROUP BY date_trunc('week', tu.created_at)
    )
    SELECT
        w.week_start as period_start,
        w.week_end as period_end,
        COALESCE(s.tweet_count, 0) as tweet_count,
        COALESCE(s.unique_scrapers, 0) as unique_scrapers
    FROM weeks w
    LEFT JOIN stats s ON s.week = w.week_start
    ORDER BY w.week_start;
END;
$$;

ALTER FUNCTION "public"."get_streaming_stats_weekly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_streaming_stats_weekly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("period_start" timestamp with time zone, "period_end" timestamp with time zone, "tweet_count" bigint, "unique_scrapers" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    WITH weeks AS (
        SELECT 
            date_trunc('week', w) as week_start,
            date_trunc('week', w) + interval '1 week' as week_end
        FROM generate_series(
            date_trunc('week', p_start_date),
            date_trunc('week', p_end_date),
            interval '1 week'
        ) w
    ),
    stats AS (
        SELECT
            date_trunc('week', tu.created_at) as week,
            COUNT(*)::bigint as tweet_count,
            COUNT(DISTINCT tu.user_id)::integer as unique_scrapers
        FROM private.tweet_user tu
        WHERE tu.created_at >= p_start_date 
          AND tu.created_at < p_end_date
          AND tu.user_id != 'system'  -- Exclude archive uploads
        GROUP BY date_trunc('week', tu.created_at)
    )
    SELECT
        w.week_start as period_start,
        w.week_end as period_end,
        COALESCE(s.tweet_count, 0) as tweet_count,
        COALESCE(s.unique_scrapers, 0) as unique_scrapers
    FROM weeks w
    LEFT JOIN stats s ON s.week = w.week_start
    ORDER BY w.week_start;
END;
$$;

ALTER FUNCTION "public"."get_streaming_stats_weekly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_scraper_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") RETURNS TABLE("scraper_date" timestamp without time zone, "unique_scrapers" bigint)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    RAISE NOTICE 'Executing get_scraper_counts_by_granularity with start_date %, end_date %, and granularity %', start_date, end_date, granularity;
    
    -- Validate granularity parameter
    IF granularity NOT IN ('minute', 'hour', 'day', 'week', 'month', 'year') THEN
        RAISE EXCEPTION 'Invalid granularity. Must be "minute", "hour", "day", "week", "month", or "year".';
    END IF;

    -- Query private.tweet_user to get unique scraper counts by time interval
    -- Exclude system users and group by the specified time granularity
    RETURN QUERY EXECUTE format('
    SELECT 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'') AS scraper_date, 
        COUNT(DISTINCT user_id) AS unique_scrapers
    FROM 
        private.tweet_user 
    WHERE
        created_at >= $1
        AND created_at < $2
        AND user_id != ''system''
    GROUP BY 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'')
    ORDER BY 
        scraper_date
    ', granularity, granularity)
    USING start_date, end_date;
END;
$_$;

ALTER FUNCTION "public"."get_scraper_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_simple_streamed_tweet_counts"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") RETURNS TABLE("tweet_date" timestamp without time zone, "tweet_count" bigint)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    -- Only support hour granularity for last day view
    IF granularity != 'hour' THEN
        RAISE EXCEPTION 'Only hour granularity is supported for simplified stream monitor';
    END IF;

    -- Only allow queries for the last 25 hours to keep it simple and fast
    IF start_date < (now() - interval '25 hours') THEN
        RAISE EXCEPTION 'Only queries for the last 25 hours are supported';
    END IF;

    RETURN QUERY EXECUTE format('
        SELECT 
            date_trunc(%L, created_at AT TIME ZONE ''UTC'') AS tweet_date, 
            COUNT(*) AS tweet_count 
        FROM 
            public.tweets 
        WHERE
            created_at >= $1
            AND created_at < $2
            AND archive_upload_id IS NULL
        GROUP BY 
            date_trunc(%L, created_at AT TIME ZONE ''UTC'')
        ORDER BY 
            tweet_date
        ', granularity, granularity)
        USING start_date, end_date;
END;
$_$;

ALTER FUNCTION "public"."get_simple_streamed_tweet_counts"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") OWNER TO "postgres";

-- =========================
-- Time-window tweet stats
-- =========================

CREATE OR REPLACE FUNCTION "public"."get_hourly_scraping_stats"("p_hours_back" integer DEFAULT 24) RETURNS TABLE("period_start" timestamp with time zone, "period_end" timestamp with time zone, "tweet_count" bigint, "unique_scrapers" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_start_date timestamp with time zone;
    v_end_date timestamp with time zone;
BEGIN
    -- Calculate date range
    v_end_date := now();
    v_start_date := v_end_date - (p_hours_back || ' hours')::interval;
    
    -- Limit hours to prevent timeout
    IF p_hours_back > 168 THEN  -- Max 1 week
        RAISE EXCEPTION 'Maximum 168 hours (1 week) allowed';
    END IF;
    
    -- Optimized query with limited date range
    RETURN QUERY
    WITH hours AS (
        SELECT 
            date_trunc('hour', h) as hour_start,
            date_trunc('hour', h) + interval '1 hour' as hour_end
        FROM generate_series(
            date_trunc('hour', v_start_date),
            date_trunc('hour', v_end_date),
            interval '1 hour'
        ) h
    ),
    tweet_counts AS (
        SELECT
            date_trunc('hour', t.created_at) as hour,
            COUNT(*) as cnt
        FROM public.tweets t
        WHERE 
            t.created_at >= v_start_date AND 
            t.created_at < v_end_date AND
            t.archive_upload_id IS NULL
        GROUP BY date_trunc('hour', t.created_at)
    )
    SELECT
        h.hour_start as period_start,
        h.hour_end as period_end,
        COALESCE(tc.cnt, 0)::bigint as tweet_count,
        0::integer as unique_scrapers
    FROM hours h
    LEFT JOIN tweet_counts tc ON tc.hour = h.hour_start
    ORDER BY h.hour_start;
END;
$$;

ALTER FUNCTION "public"."get_hourly_scraping_stats"("p_hours_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_hourly_stats_simple"("p_hours_back" integer DEFAULT 24) RETURNS TABLE("period_start" timestamp with time zone, "tweet_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
    SELECT
        date_trunc('hour', created_at) as period_start,
        COUNT(*)::bigint as tweet_count
    FROM public.tweets
    WHERE 
        created_at >= now() - (p_hours_back || ' hours')::interval AND
        archive_upload_id IS NULL
    GROUP BY date_trunc('hour', created_at)
    ORDER BY period_start;
$$;

ALTER FUNCTION "public"."get_hourly_stats_simple"("p_hours_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_tweet_counts"() RETURNS TABLE("month" timestamp with time zone, "tweet_count" bigint)
    LANGUAGE "plpgsql"
    SET "statement_timeout" TO '5min'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE_TRUNC('month', created_at) AS month,
        COUNT(tweet_id) AS tweet_count
    FROM 
        public.tweets
    GROUP BY 
        month
    ORDER BY 
        month;
END;
$$;

ALTER FUNCTION "public"."get_monthly_tweet_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_tweet_counts_fast"("p_account_id" "text" DEFAULT NULL::"text", "p_start_date" "date" DEFAULT NULL::"date", "p_end_date" "date" DEFAULT NULL::"date") RETURNS TABLE("month" "date", "account_id" "text", "tweet_count" bigint, "days_active" bigint, "avg_favorites" numeric, "avg_retweets" numeric)
    LANGUAGE "sql" STABLE
    AS $$
    SELECT 
        month::date,
        account_id,
        tweet_count,
        days_active,
        avg_favorites,
        avg_retweets
    FROM public.monthly_tweet_counts_mv
    WHERE 
        (p_account_id IS NULL OR account_id = p_account_id)
        AND (p_start_date IS NULL OR month >= p_start_date)
        AND (p_end_date IS NULL OR month <= p_end_date)
    ORDER BY month DESC, account_id;
$$;

ALTER FUNCTION "public"."get_monthly_tweet_counts_fast"("p_account_id" "text", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone) RETURNS TABLE("tweet_date" timestamp with time zone, "tweet_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (DATE(created_at) AT TIME ZONE 'UTC')::timestamp with time zone AS tweet_date, 
        COUNT(*) AS tweet_count 
    FROM 
        public.tweets 
    WHERE
        created_at >= start_date
        AND created_at < end_date + INTERVAL '1 day'
    GROUP BY 
        DATE(created_at) 
    ORDER BY 
        tweet_date;
END;
$$;

ALTER FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") RETURNS TABLE("tweet_date" timestamp without time zone, "tweet_count" bigint)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    IF granularity NOT IN ('day', 'week', 'month', 'year') THEN
        RAISE EXCEPTION 'Invalid granularity. Must be "day", "week", "month", or "year".';
    END IF;

    RETURN QUERY EXECUTE format('
    SELECT 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'') AS tweet_date, 
        COUNT(*) AS tweet_count 
    FROM 
        public.tweets 
    WHERE
        created_at >= $1
        AND created_at < $2 + INTERVAL ''1 %s''
    GROUP BY 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'')
    ORDER BY 
        tweet_date
    ', granularity, granularity, granularity)
    USING start_date, end_date;
END;
$_$;

ALTER FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_trending_tweets"("hours_back" integer DEFAULT 24, "limit_count" integer DEFAULT 20) RETURNS TABLE("tweet_id" "text", "account_id" "text", "full_text" "text", "created_at" timestamp with time zone, "favorite_count" integer, "retweet_count" integer, "engagement_score" integer)
    LANGUAGE "sql" STABLE PARALLEL SAFE
    AS $$
    SELECT 
        tweet_id,
        account_id,
        full_text,
        created_at,
        favorite_count,
        retweet_count,
        (favorite_count + retweet_count) as engagement_score
    FROM public.tweets
    WHERE created_at >= now() - (hours_back || ' hours')::interval
    ORDER BY (favorite_count + retweet_count) DESC, created_at DESC
    LIMIT limit_count;
$$;

ALTER FUNCTION "public"."get_trending_tweets"("hours_back" integer, "limit_count" integer) OWNER TO "postgres";

-- =========================
-- Account-centric stats
-- =========================

CREATE OR REPLACE FUNCTION "public"."get_account_most_liked_tweets_archive_users"("username_" "text", "limit_" integer DEFAULT NULL::integer) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "reply_to_user_id" "text", "reply_to_username" "text", "archive_upload_id" bigint, "num_likes" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tweet_id, 
        t.account_id, 
        t.created_at, 
        t.full_text, 
        t.retweet_count, 
        t.favorite_count, 
        t.reply_to_tweet_id, 
        t.reply_to_user_id, 
        t.reply_to_username, 
        t.archive_upload_id, 
        COUNT(l.liked_tweet_id) AS num_likes 
    FROM 
        public.tweets t 
    JOIN 
        public.account a ON t.account_id = a.account_id 
    LEFT JOIN 
        public.likes l ON t.tweet_id = l.liked_tweet_id 
    WHERE 
        a.username = username_ 
    GROUP BY 
        t.tweet_id, 
        t.full_text 
    ORDER BY 
        num_likes DESC
    LIMIT limit_;
END;
$$;

ALTER FUNCTION "public"."get_account_most_liked_tweets_archive_users"("username_" "text", "limit_" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_most_mentioned_accounts"("username_" "text", "limit_" integer) RETURNS TABLE("user_id" "text", "name" "text", "screen_name" "text", "mention_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "public"."get_account_most_mentioned_accounts"("username_" "text", "limit_" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_most_replied_tweets_by_archive_users"("username_" "text", "limit_" integer) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "reply_to_user_id" "text", "reply_to_username" "text", "archive_upload_id" bigint, "num_replies" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tweet_id, 
        t.account_id, 
        t.created_at, 
        t.full_text, 
        t.retweet_count, 
        t.favorite_count, 
        t.reply_to_tweet_id, 
        t.reply_to_user_id, 
        t.reply_to_username, 
        t.archive_upload_id , 
        COUNT(r.reply_to_tweet_id) AS num_replies 
    FROM 
        public.tweets t 
    JOIN 
        public.account a ON t.account_id = a.account_id 
    LEFT JOIN 
        public.tweets r ON t.tweet_id = r.reply_to_tweet_id 
    WHERE 
        a.username = username_
    GROUP BY 
        t.tweet_id, 
        t.full_text 
    ORDER BY 
        num_replies DESC 
    LIMIT 
        limit_;
END;
$$;

ALTER FUNCTION "public"."get_account_most_replied_tweets_by_archive_users"("username_" "text", "limit_" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_top_favorite_count_tweets"("username_" "text", "limit_" integer) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "reply_to_user_id" "text", "reply_to_username" "text", "archive_upload_id" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tweet_id, 
        t.account_id, 
        t.created_at, 
        t.full_text, 
        t.retweet_count, 
        t.favorite_count, 
        t.reply_to_tweet_id, 
        t.reply_to_user_id, 
        t.reply_to_username, 
        t.archive_upload_id 
    FROM 
        public.tweets t 
    JOIN 
        public.account a ON t.account_id = a.account_id 
    WHERE 
        a.username = username_
    ORDER BY 
        t.favorite_count DESC 
    LIMIT 
        limit_;
END;
$$;

ALTER FUNCTION "public"."get_account_top_favorite_count_tweets"("username_" "text", "limit_" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_top_retweet_count_tweets"("username_" "text", "limit_" integer) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "reply_to_user_id" "text", "reply_to_username" "text", "archive_upload_id" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tweet_id, 
        t.account_id, 
        t.created_at, 
        t.full_text, 
        t.retweet_count, 
        t.favorite_count, 
        t.reply_to_tweet_id, 
        t.reply_to_user_id, 
        t.reply_to_username, 
        t.archive_upload_id 
    FROM 
        public.tweets t 
    JOIN 
        public.account a ON t.account_id = a.account_id 
    WHERE 
        a.username = username_
    ORDER BY 
        t.retweet_count DESC 
    LIMIT 
        limit_;
END;
$$;

ALTER FUNCTION "public"."get_account_top_retweet_count_tweets"("username_" "text", "limit_" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_liked_users"() RETURNS TABLE("tweet_id" "text", "full_text" "text", "like_count" bigint, "reply_to_tweet_id" "text", "reply_to_user_id" "text", "reply_to_username" "text")
    LANGUAGE "plpgsql"
    SET "statement_timeout" TO '30min'
    AS $$
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
$$;

ALTER FUNCTION "public"."get_top_liked_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_retweeted_tweets_by_username"("username_" "text", "limit_" integer) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "reply_to_user_id" "text", "reply_to_username" "text", "archive_upload_id" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tweet_id, 
        t.account_id, 
        t.created_at, 
        t.full_text, 
        t.retweet_count, 
        t.favorite_count, 
        t.reply_to_tweet_id, 
        t.reply_to_user_id, 
        t.reply_to_username, 
        t.archive_upload_id 
    FROM 
        public.tweets t 
    JOIN 
        public.account a ON t.account_id = a.account_id 
    WHERE 
        a.username = username_
    ORDER BY 
        t.retweet_count DESC 
    LIMIT 
        limit_;
END;
$$;

ALTER FUNCTION "public"."get_top_retweeted_tweets_by_username"("username_" "text", "limit_" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_most_liked_tweets_by_username"("username_" "text") RETURNS TABLE("tweet_id" "text", "full_text" "text", "num_likes" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tweet_id, 
        t.full_text, 
        COUNT(l.liked_tweet_id) AS num_likes 
    FROM 
        public.tweets t 
    JOIN 
        public.account a ON t.account_id = a.account_id 
    LEFT JOIN 
        public.likes l ON t.tweet_id = l.liked_tweet_id 
    WHERE 
        a.username = username_ 
    GROUP BY 
        t.tweet_id, 
        t.full_text 
    ORDER BY 
        num_likes DESC;
END;
$$;

ALTER FUNCTION "public"."get_most_liked_tweets_by_username"("username_" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_most_mentioned_accounts_by_username"("username_" "text") RETURNS TABLE("mentioned_user_id" "text", "mentioned_username" "text", "mention_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "public"."get_most_mentioned_accounts_by_username"("username_" "text") OWNER TO "postgres";

-- =========================
-- Search and thread helpers
-- =========================

CREATE OR REPLACE FUNCTION "public"."word_occurrences"("search_word" "text", "start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "end_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "user_ids" "text"[] DEFAULT NULL::"text"[]) RETURNS TABLE("month" "text", "word_count" bigint)
    LANGUAGE "plpgsql"
    AS $$BEGIN
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
END;$$;

ALTER FUNCTION "public"."word_occurrences"("search_word" "text", "start_date" timestamp with time zone, "end_date" timestamp with time zone, "user_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_tweets"("search_query" "text", "limit_count" integer DEFAULT 20, "account_filter" "text" DEFAULT NULL::"text", "date_from" timestamp without time zone DEFAULT NULL::timestamp without time zone, "date_to" timestamp without time zone DEFAULT NULL::timestamp without time zone) RETURNS TABLE("tweet_id" "text", "account_id" "text", "full_text" "text", "created_at" timestamp with time zone, "favorite_count" integer, "retweet_count" integer, "relevance" real)
    LANGUAGE "sql" STABLE PARALLEL SAFE
    AS $$
    SELECT 
        t.tweet_id,
        t.account_id,
        t.full_text,
        t.created_at,
        t.favorite_count,
        t.retweet_count,
        ts_rank(t.fts, query) as relevance
    FROM 
        public.tweets t,
        plainto_tsquery(search_query) query
    WHERE 
        t.fts @@ query
        AND (account_filter IS NULL OR t.account_id = account_filter)
        AND (date_from IS NULL OR t.created_at >= date_from)
        AND (date_to IS NULL OR t.created_at <= date_to)
    ORDER BY 
        ts_rank(t.fts, query) DESC,
        t.created_at DESC
    LIMIT limit_count;
$$;

ALTER FUNCTION "public"."search_tweets"("search_query" "text", "limit_count" integer, "account_filter" "text", "date_from" timestamp without time zone, "date_to" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_tweets"("search_query" "text", "from_user" "text" DEFAULT NULL::"text", "to_user" "text" DEFAULT NULL::"text", "since_date" "date" DEFAULT NULL::"date", "until_date" "date" DEFAULT NULL::"date", "limit_" integer DEFAULT 50, "offset_" integer DEFAULT 0) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "avatar_media_url" "text", "archive_upload_id" bigint, "username" "text", "account_display_name" "text", "media" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '5min'
    AS $$
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
        FROM public.all_account AS a
        WHERE LOWER(a.username) = LOWER(from_user);

        IF from_account_id IS NULL THEN
            RETURN;
        END IF;
    END IF;

    -- Get account_id for to_user
    IF to_user IS NOT NULL THEN
        SELECT a.account_id INTO to_account_id
        FROM public.all_account AS a
        WHERE LOWER(a.username) = LOWER(to_user);

        IF to_account_id IS NULL THEN
            RETURN;
        END IF;
    END IF;

    RETURN QUERY
    WITH matching_tweets AS (
        SELECT t.tweet_id
        FROM public.tweets t
        LEFT JOIN public.archive_upload au ON t.archive_upload_id = au.id
        WHERE (search_query = '' OR search_query IS NULL OR t.fts @@ to_tsquery('english', search_query))
          AND (from_account_id IS NULL OR t.account_id = from_account_id)
          AND (to_account_id IS NULL OR t.reply_to_user_id = to_account_id)
          AND (since_date IS NULL OR t.created_at >= since_date)
          AND (until_date IS NULL OR t.created_at <= until_date)
          AND (au.id IS NULL OR au.keep_private IS FALSE OR t.account_id = current_user_account_id OR current_user_account_id IS NULL)
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
    JOIN public.all_account a ON t.account_id = a.account_id
    LEFT JOIN LATERAL (
        SELECT prof.avatar_media_url, prof.archive_upload_id
        FROM public.all_profile AS prof
        WHERE prof.account_id = t.account_id
        ORDER BY prof.archive_upload_id DESC NULLS LAST, prof.updated_at DESC
        LIMIT 1
    ) p ON true
    ORDER BY t.created_at DESC;
END;
$$;

ALTER FUNCTION "public"."search_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "limit_" integer, "offset_" integer) OWNER TO "postgres";


-- Exact phrase search using ILIKE (bypasses PostgREST 8s timeout with 5min limit).
-- PostgreSQL FTS drops English stop words, so ILIKE is the only reliable way to
-- find exact substrings in full_text for phrases like "you can just do things".
-- The pg_trgm GIN index on full_text makes the ILIKE fast.
CREATE OR REPLACE FUNCTION "public"."search_tweets_exact_phrase"("exact_phrase" "text", "from_user" "text" DEFAULT NULL::"text", "to_user" "text" DEFAULT NULL::"text", "since_date" "date" DEFAULT NULL::"date", "until_date" "date" DEFAULT NULL::"date", "limit_" integer DEFAULT 50, "offset_" integer DEFAULT 0) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "avatar_media_url" "text", "archive_upload_id" bigint, "username" "text", "account_display_name" "text", "media" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '5min'
    AS $$
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
        FROM public.all_account AS a
        WHERE LOWER(a.username) = LOWER(from_user);

        IF from_account_id IS NULL THEN
            RETURN;
        END IF;
    END IF;

    -- Get account_id for to_user
    IF to_user IS NOT NULL THEN
        SELECT a.account_id INTO to_account_id
        FROM public.all_account AS a
        WHERE LOWER(a.username) = LOWER(to_user);

        IF to_account_id IS NULL THEN
            RETURN;
        END IF;
    END IF;

    RETURN QUERY
    WITH matching_tweets AS (
        SELECT t.tweet_id
        FROM public.tweets t
        LEFT JOIN public.archive_upload au ON t.archive_upload_id = au.id
        WHERE to_tsvector('simple'::regconfig, t.full_text) @@ phraseto_tsquery('simple'::regconfig, exact_phrase)
          AND (from_account_id IS NULL OR t.account_id = from_account_id)
          AND (to_account_id IS NULL OR t.reply_to_user_id = to_account_id)
          AND (since_date IS NULL OR t.created_at >= since_date)
          AND (until_date IS NULL OR t.created_at <= until_date)
          AND (au.id IS NULL OR au.keep_private IS FALSE OR t.account_id = current_user_account_id OR current_user_account_id IS NULL)
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
    JOIN public.all_account a ON t.account_id = a.account_id
    LEFT JOIN LATERAL (
        SELECT prof.avatar_media_url, prof.archive_upload_id
        FROM public.all_profile AS prof
        WHERE prof.account_id = t.account_id
        ORDER BY prof.archive_upload_id DESC NULLS LAST, prof.updated_at DESC
        LIMIT 1
    ) p ON true
    ORDER BY t.created_at DESC;
END;
$$;

ALTER FUNCTION "public"."search_tweets_exact_phrase"("exact_phrase" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "limit_" integer, "offset_" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text" DEFAULT NULL::"text") RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "avatar_media_url" "text", "username" "text", "account_display_name" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tweet_id,
        t.account_id,
        t.created_at,
        t.full_text,
        t.retweet_count,
        t.favorite_count,
        t.reply_to_tweet_id,
        p.avatar_media_url,
        a.username,
        a.account_display_name
    FROM 
        public.tweets t
    INNER JOIN 
        public.account a ON t.account_id = a.account_id
    INNER JOIN 
        (SELECT DISTINCT ON (p.account_id)
            p.account_id,
            p.avatar_media_url
         FROM public.profile p
         ORDER BY p.account_id, p.archive_upload_id DESC
        ) p ON a.account_id = p.account_id
    WHERE 
        t.reply_to_tweet_id IS NULL
        AND (p_account_id IS NULL OR t.account_id = p_account_id)
    ORDER BY 
        t.created_at DESC
    LIMIT COUNT;
END;
$$;

ALTER FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_main_thread"("p_conversation_id" "text") RETURNS TABLE("tweet_id" "text", "conversation_id" "text", "reply_to_tweet_id" "text", "account_id" "text", "depth" integer, "max_depth" integer, "favorite_count" integer, "retweet_count" integer)
    LANGUAGE "plpgsql"
    AS $$
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
$$;

ALTER FUNCTION "public"."get_main_thread"("p_conversation_id" "text") OWNER TO "postgres";


-- =========================
-- Tweet page data (single RPC to replace ~24 HTTP calls)
-- =========================

CREATE OR REPLACE FUNCTION "public"."get_tweet_page_data"("p_tweet_id" "text")
RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY INVOKER
AS $$
DECLARE
    v_result jsonb;
    v_tweet_row record;
    v_conversation_id text;
    v_conversation_tweet_ids text[];
BEGIN
    -- 1. Get the main tweet from enriched_tweets view
    SELECT * INTO v_tweet_row
    FROM public.enriched_tweets
    WHERE tweet_id = p_tweet_id;

    IF v_tweet_row IS NULL THEN
        RETURN jsonb_build_object(
            'tweet', NULL,
            'media', '[]'::jsonb,
            'mentioned_users', '[]'::jsonb,
            'conversation_tweets', '[]'::jsonb,
            'conversation_media', '[]'::jsonb,
            'quoted_tweets', '[]'::jsonb
        );
    END IF;

    -- Get conversation_id
    v_conversation_id := v_tweet_row.conversation_id;

    -- 2. Collect conversation tweet IDs once (used by multiple subqueries)
    SELECT array_agg(sub.tweet_id) INTO v_conversation_tweet_ids
    FROM (
        SELECT et.tweet_id
        FROM public.enriched_tweets et
        WHERE (
            (v_conversation_id IS NOT NULL AND et.conversation_id = v_conversation_id)
            OR
            (v_conversation_id IS NULL AND (
                et.tweet_id = p_tweet_id
                OR et.reply_to_tweet_id = p_tweet_id
            ))
        )
        ORDER BY et.created_at ASC
        LIMIT 500
    ) sub;

    -- 3. Build the complete result in a single query
    SELECT jsonb_build_object(
        'tweet', to_jsonb(v_tweet_row),
        'media', COALESCE((
            SELECT jsonb_agg(to_jsonb(tm))
            FROM public.tweet_media tm
            WHERE tm.tweet_id = p_tweet_id
        ), '[]'::jsonb),
        'mentioned_users', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'tweet_id', um.tweet_id,
                'user_id', mu.user_id,
                'name', mu.name,
                'screen_name', mu.screen_name,
                'account_id', aa.account_id,
                'account_username', aa.username,
                'account_display_name', aa.account_display_name,
                'avatar_media_url', ap.avatar_media_url
            ))
            FROM public.user_mentions um
            JOIN public.mentioned_users mu ON um.mentioned_user_id = mu.user_id
            LEFT JOIN public.all_account aa ON aa.username = mu.screen_name
            LEFT JOIN LATERAL (
                SELECT all_profile.avatar_media_url
                FROM public.all_profile
                WHERE all_profile.account_id = aa.account_id
                ORDER BY all_profile.archive_upload_id DESC
                LIMIT 1
            ) ap ON true
            WHERE um.tweet_id = p_tweet_id
        ), '[]'::jsonb),
        'conversation_tweets', COALESCE((
            SELECT jsonb_agg(to_jsonb(ct) ORDER BY ct.created_at)
            FROM public.enriched_tweets ct
            WHERE ct.tweet_id = ANY(v_conversation_tweet_ids)
        ), '[]'::jsonb),
        'conversation_media', COALESCE((
            SELECT jsonb_agg(to_jsonb(cm))
            FROM public.tweet_media cm
            WHERE cm.tweet_id = ANY(v_conversation_tweet_ids)
        ), '[]'::jsonb),
        'quoted_tweets', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'tweet_id', qt_tweet.tweet_id,
                'source_tweet_id', qt.tweet_id,
                'account_id', qt_tweet.account_id,
                'created_at', qt_tweet.created_at,
                'full_text', qt_tweet.full_text,
                'retweet_count', qt_tweet.retweet_count,
                'favorite_count', qt_tweet.favorite_count,
                'username', qt_tweet.username,
                'account_display_name', qt_tweet.account_display_name,
                'avatar_media_url', qt_tweet.avatar_media_url,
                'media', COALESCE((
                    SELECT jsonb_agg(to_jsonb(qtm))
                    FROM public.tweet_media qtm
                    WHERE qtm.tweet_id = qt_tweet.tweet_id
                ), '[]'::jsonb)
            ))
            FROM public.quote_tweets qt
            JOIN public.enriched_tweets qt_tweet ON qt_tweet.tweet_id = qt.quoted_tweet_id
            WHERE qt.tweet_id = ANY(v_conversation_tweet_ids)
            AND qt.quoted_tweet_id IS NOT NULL
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."get_tweet_page_data"("p_tweet_id" "text") OWNER TO "postgres";
