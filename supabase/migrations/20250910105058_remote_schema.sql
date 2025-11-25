

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "ca_website";


ALTER SCHEMA "ca_website" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE SCHEMA IF NOT EXISTS "dev";


ALTER SCHEMA "dev" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgsodium";






CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "temp";


ALTER SCHEMA "temp" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "tes";


ALTER SCHEMA "tes" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgaudit" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'upload_phase_enum'
          AND n.nspname = 'public'
    ) THEN
        CREATE TYPE "public"."upload_phase_enum" AS ENUM (
            'uploading',
            'ready_for_commit',
            'committing',
            'completed',
            'failed'
        );
        ALTER TYPE "public"."upload_phase_enum" OWNER TO "postgres";
    END IF;
END$$;


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
            0 as unique_scrapers  -- For now, we don't track scrapers for streamed tweets
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


CREATE OR REPLACE FUNCTION "dev"."apply_dev_entities_rls_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    policy_name TEXT;
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP;

    EXECUTE format('CREATE POLICY "Entities are publicly visible" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
    EXECUTE format('
        CREATE POLICY "Entities are modifiable by their users" ON %I.%I to authenticated
        USING (
            EXISTS (
                SELECT 1 
                FROM dev.tweets dt 
                WHERE dt.tweet_id = %I.tweet_id 
                AND dt.account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
            )
        ) 
        WITH CHECK (
            EXISTS (
                SELECT 1 
                FROM dev.tweets dt 
                WHERE dt.tweet_id = %I.tweet_id 
                AND dt.account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
            )
        )', schema_name, table_name, table_name, table_name);
END;
$$;


ALTER FUNCTION "dev"."apply_dev_entities_rls_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."apply_dev_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    policy_name TEXT;
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP;

    EXECUTE format('CREATE POLICY "Entities are publicly visible" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
    EXECUTE format('CREATE POLICY "Entities are modifiable by their users" ON %I.%I to authenticated  USING (EXISTS (SELECT 1 FROM dev.account dt WHERE dt.account_id = (select auth.jwt()) -> ''app_metadata'' ->> ''provider_id'')) WITH CHECK (EXISTS (SELECT 1 FROM dev.account dt WHERE dt.account_id = (select auth.jwt()) -> ''app_metadata'' ->> ''provider_id''))', schema_name, table_name, schema_name, table_name, schema_name, table_name);
END;
$$;


ALTER FUNCTION "dev"."apply_dev_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."apply_dev_rls_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    policy_name TEXT;
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP; 

    EXECUTE format('CREATE POLICY "Tweets are publicly visible" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
    EXECUTE format('
        CREATE POLICY "Tweets are modifiable by their users" ON %I.%I to authenticated 
        USING (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        ) 
        WITH CHECK (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        )', schema_name, table_name);
END;
$$;


ALTER FUNCTION "dev"."apply_dev_rls_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."commit_temp_data"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    SET "statement_timeout" TO '10min'
    AS $_$
  DECLARE
      v_archive_upload_id BIGINT;
      v_account_id TEXT;
      v_archive_at TIMESTAMP WITH TIME ZONE;
  BEGIN
      IF auth.uid() IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

      -- 1. Insert account data first
      EXECUTE format('
          INSERT INTO dev.account (created_via, username, account_id, created_at, account_display_name)
          SELECT created_via, username, account_id, created_at, account_display_name 
          FROM temp.account_%s
          ON CONFLICT (account_id) DO UPDATE SET 
              username = EXCLUDED.username, 
              account_display_name = EXCLUDED.account_display_name, 
              created_via = EXCLUDED.created_via, 
              created_at = EXCLUDED.created_at
          RETURNING account_id
      ', p_suffix) INTO v_account_id;

      -- 2. Get the latest archive_at from temp.archive_upload
      EXECUTE format('
          SELECT archive_at 
          FROM temp.archive_upload_%s 
          ORDER BY archive_at DESC 
          LIMIT 1
      ', p_suffix) INTO v_archive_at;

      -- 3. Insert or update archive_upload and get the ID
      INSERT INTO dev.archive_upload (account_id, archive_at, created_at)
      VALUES (v_account_id, v_archive_at, CURRENT_TIMESTAMP)
      ON CONFLICT (account_id, archive_at) 
      DO UPDATE SET 
          account_id = EXCLUDED.account_id, -- This effectively does nothing, but allows us to use RETURNING
          created_at = CURRENT_TIMESTAMP
      RETURNING id INTO v_archive_upload_id;

      -- Insert profile data
      EXECUTE format('
          INSERT INTO dev.profile (bio, website, location, avatar_media_url, header_media_url, account_id, archive_upload_id)
          SELECT p.bio, p.website, p.location, p.avatar_media_url, p.header_media_url, p.account_id, $1
          FROM temp.profile_%s p
          ON CONFLICT (account_id, archive_upload_id) DO UPDATE SET
              bio = EXCLUDED.bio,
              website = EXCLUDED.website,
              location = EXCLUDED.location,
              avatar_media_url = EXCLUDED.avatar_media_url,
              header_media_url = EXCLUDED.header_media_url,
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;

      -- Insert tweets data
      EXECUTE format('
          INSERT INTO dev.tweets (tweet_id, account_id, created_at, full_text, retweet_count, favorite_count, reply_to_tweet_id, reply_to_user_id, reply_to_username, archive_upload_id)
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

      -- raise exception 'check tweets and media suffix: % tweets:  % media: %', p_suffix, (select tweet_id from dev.tweets where archive_upload_id = v_archive_upload_id), (select tweet_id from temp.tweet_media_322603863);


      -- Insert tweet_media data
      EXECUTE format('
          INSERT INTO dev.tweet_media (media_id, tweet_id, media_url, media_type, width, height, archive_upload_id)
          SELECT tm.media_id, tm.tweet_id, tm.media_url, tm.media_type, tm.width, tm.height, $1
          FROM temp.tweet_media_%s tm
          ON CONFLICT (media_id) DO UPDATE SET
              media_url = EXCLUDED.media_url,
              media_type = EXCLUDED.media_type,
              width = EXCLUDED.width,
              height = EXCLUDED.height,
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;


      -- Insert mentioned_users data (no archive_upload_id needed)
      EXECUTE format('
          INSERT INTO dev.mentioned_users (user_id, name, screen_name, updated_at)
          SELECT user_id, name, screen_name, updated_at
          FROM temp.mentioned_users_%s
          ON CONFLICT (user_id) DO UPDATE SET 
              name = EXCLUDED.name, 
              screen_name = EXCLUDED.screen_name, 
              updated_at = EXCLUDED.updated_at
      ', p_suffix);

      -- Insert user_mentions data (no archive_upload_id needed)
      EXECUTE format('
          INSERT INTO dev.user_mentions (mentioned_user_id, tweet_id)
          SELECT um.mentioned_user_id, um.tweet_id
          FROM temp.user_mentions_%s um
          JOIN dev.mentioned_users mu ON um.mentioned_user_id = mu.user_id
          JOIN dev.tweets t ON um.tweet_id = t.tweet_id
          ON CONFLICT (mentioned_user_id, tweet_id) DO NOTHING
      ', p_suffix);

      -- Insert tweet_urls data (no archive_upload_id needed)
      EXECUTE format('
          INSERT INTO dev.tweet_urls (url, expanded_url, display_url, tweet_id)
          SELECT tu.url, tu.expanded_url, tu.display_url, tu.tweet_id
          FROM temp.tweet_urls_%s tu
          JOIN dev.tweets t ON tu.tweet_id = t.tweet_id
          ON CONFLICT (tweet_id, url) DO NOTHING
      ', p_suffix);

      -- Insert followers data
      EXECUTE format('
          INSERT INTO dev.followers (account_id, follower_account_id, archive_upload_id)
          SELECT f.account_id, f.follower_account_id, $1
          FROM temp.followers_%s f
          ON CONFLICT (account_id, follower_account_id) DO UPDATE SET
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;

      -- Insert following data
      EXECUTE format('
          INSERT INTO dev.following (account_id, following_account_id, archive_upload_id)
          SELECT f.account_id, f.following_account_id, $1
          FROM temp.following_%s f
          ON CONFLICT (account_id, following_account_id) DO UPDATE SET
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;

      -- Insert liked_tweets data (no archive_upload_id needed)
      EXECUTE format('
          INSERT INTO dev.liked_tweets (tweet_id, full_text)
          SELECT lt.tweet_id, lt.full_text
          FROM temp.liked_tweets_%s lt
          ON CONFLICT (tweet_id) DO NOTHING
      ', p_suffix);

      -- Insert likes data
      EXECUTE format('
          INSERT INTO dev.likes (account_id, liked_tweet_id, archive_upload_id)
          SELECT l.account_id, l.liked_tweet_id, $1
          FROM temp.likes_%s l
          ON CONFLICT (account_id, liked_tweet_id) DO UPDATE SET
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;

      -- Call the function to drop temporary tables
      PERFORM dev.drop_temp_tables(p_suffix);
  END;
  $_$;


ALTER FUNCTION "dev"."commit_temp_data"("p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."create_temp_tables"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  BEGIN
      -- Check if the user is authenticated or is the postgres role
      IF auth.uid() IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF p_suffix != ((select auth.jwt()) -> 'app_metadata' ->> 'provider_id') AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authorized to process this archive';
      END IF;

      -- Drop the temporary tables if they exist
      PERFORM dev.drop_temp_tables(p_suffix);
      
      -- Create new tables
      EXECUTE format('CREATE TABLE temp.archive_upload_%s (LIKE dev.archive_upload INCLUDING ALL)', p_suffix);
      EXECUTE format('CREATE TABLE temp.account_%s (LIKE dev.account INCLUDING ALL)', p_suffix);
      EXECUTE format('CREATE TABLE temp.profile_%s (LIKE dev.profile INCLUDING ALL)', p_suffix);
      EXECUTE format('CREATE TABLE temp.tweets_%s (LIKE dev.tweets INCLUDING ALL)', p_suffix);
      EXECUTE format('CREATE TABLE temp.mentioned_users_%s (LIKE dev.mentioned_users INCLUDING ALL)', p_suffix);
      EXECUTE format('CREATE TABLE temp.user_mentions_%s (LIKE dev.user_mentions INCLUDING ALL)', p_suffix);
      EXECUTE format('CREATE TABLE temp.tweet_urls_%s (LIKE dev.tweet_urls INCLUDING ALL)', p_suffix);
      EXECUTE format('CREATE TABLE temp.tweet_media_%s (LIKE dev.tweet_media INCLUDING ALL)', p_suffix);
      EXECUTE format('CREATE TABLE temp.followers_%s (LIKE dev.followers INCLUDING ALL)', p_suffix);
      EXECUTE format('CREATE TABLE temp.following_%s (LIKE dev.following INCLUDING ALL)', p_suffix);
      EXECUTE format('CREATE TABLE temp.liked_tweets_%s (LIKE dev.liked_tweets INCLUDING ALL)', p_suffix);
      EXECUTE format('CREATE TABLE temp.likes_%s (LIKE dev.likes INCLUDING ALL)', p_suffix);
  END;
  $$;


ALTER FUNCTION "dev"."create_temp_tables"("p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."delete_all_archives"("p_account_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    SET "statement_timeout" TO '20min'
    AS $_$
DECLARE
    v_schema_name TEXT := 'dev';
BEGIN
    -- Use a single transaction for all operations
    BEGIN
        EXECUTE format('
            -- Delete from dependent tables first
            DELETE FROM %I.user_mentions WHERE tweet_id IN (SELECT tweet_id FROM %I.tweets WHERE account_id = $1);
            DELETE FROM %I.tweet_urls WHERE tweet_id IN (SELECT tweet_id FROM %I.tweets WHERE account_id = $1);
            DELETE FROM %I.tweet_media WHERE tweet_id IN (SELECT tweet_id FROM %I.tweets WHERE account_id = $1);
            DELETE FROM %I.likes WHERE account_id = $1;
            DELETE FROM %I.tweets WHERE account_id = $1;
            DELETE FROM %I.followers WHERE account_id = $1;
            DELETE FROM %I.following WHERE account_id = $1;
            DELETE FROM %I.profile WHERE account_id = $1;
            DELETE FROM %I.archive_upload WHERE account_id = $1;
            DELETE FROM %I.account WHERE account_id = $1;
        ', v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name, 
           v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name)
        USING p_account_id;

    EXCEPTION WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE NOTICE 'Error deleting archives for account %: %', p_account_id, SQLERRM;
        RAISE;
    END;
END;
$_$;


ALTER FUNCTION "dev"."delete_all_archives"("p_account_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."drop_function_if_exists"("function_name" "text", "function_args" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    full_function_name text;
    func_oid oid;
BEGIN
    -- Find the function OID
    SELECT p.oid INTO func_oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'dev'
      AND p.proname = function_name
      AND array_length(p.proargtypes, 1) = array_length(function_args, 1)
      AND array_to_string(p.proargtypes::regtype[], ',') = array_to_string(function_args::regtype[], ',');

    -- If the function exists, drop it
    IF func_oid IS NOT NULL THEN
        full_function_name := 'dev.' || function_name || '(' || array_to_string(function_args, ', ') || ')';
        EXECUTE 'DROP FUNCTION ' || full_function_name;
    END IF;
END;
$$;


ALTER FUNCTION "dev"."drop_function_if_exists"("function_name" "text", "function_args" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."drop_temp_tables"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  BEGIN
      IF auth.uid() IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

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


ALTER FUNCTION "dev"."drop_temp_tables"("p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."get_top_accounts_with_followers"("limit_count" integer) RETURNS TABLE("account_id" "text", "created_via" "text", "username" "text", "created_at" timestamp with time zone, "account_display_name" "text", "avatar_media_url" "text", "bio" "text", "website" "text", "location" "text", "header_media_url" "text", "follower_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.account_id,
        a.created_via,
        a.username,
        a.created_at,
        a.account_display_name,
        p.avatar_media_url,
        p.bio,
        p.website,
        p.location,
        p.header_media_url,
        COUNT(f.follower_account_id) AS follower_count
    FROM 
        public.account a
    LEFT JOIN 
        public.followers f ON a.account_id = f.account_id
    LEFT JOIN 
        public.profile p ON a.account_id = p.account_id
    GROUP BY 
        a.account_id, 
        a.created_via, 
        a.username, 
        a.created_at, 
        a.account_display_name, 
        p.avatar_media_url, 
        p.bio, 
        p.website, 
        p.location, 
        p.header_media_url
    ORDER BY 
        follower_count DESC
    LIMIT 
        limit_count;
END;
$$;


ALTER FUNCTION "dev"."get_top_accounts_with_followers"("limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
  BEGIN
      IF auth.uid() IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

      EXECUTE format('
          INSERT INTO temp.account_%s (account_id, created_via, username, created_at, account_display_name)
          SELECT
              $1->>''accountId'',
              $1->>''createdVia'',
              $1->>''username'',
              ($1->>''createdAt'')::TIMESTAMP WITH TIME ZONE,
              $1->>''accountDisplayName''
      ', p_suffix)
      USING p_account;
  END;
  $_$;


ALTER FUNCTION "dev"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_suffix" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
  DECLARE
    v_id BIGINT;
  BEGIN
    
    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
      INSERT INTO temp.archive_upload_%s (account_id, archive_at)
      VALUES ($1, $2)
      RETURNING id
    ', p_suffix) 
    USING p_account_id, p_archive_at
    INTO v_id;

    RETURN v_id;
  END;
  $_$;


ALTER FUNCTION "dev"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
  BEGIN
      IF auth.uid() IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

      EXECUTE format('
          INSERT INTO temp.followers_%s (account_id, follower_account_id, archive_upload_id)
          SELECT
              $2,
              (follower->''follower''->>''accountId'')::TEXT,
              -1
          FROM jsonb_array_elements($1) AS follower
      ', p_suffix)
      USING p_followers, p_account_id;
  END;
  $_$;


ALTER FUNCTION "dev"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
  BEGIN
      IF auth.uid() IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

      EXECUTE format('
          INSERT INTO temp.following_%s (account_id, following_account_id, archive_upload_id)
          SELECT
              $2,
              (following->''following''->>''accountId'')::TEXT,
              -1
          FROM jsonb_array_elements($1) AS following
      ', p_suffix)
      USING p_following, p_account_id;
  END;
  $_$;


ALTER FUNCTION "dev"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
  BEGIN
    set search_path TO '';
    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
      INSERT INTO temp.liked_tweets_%s (tweet_id, full_text)
      SELECT 
        (likes->''like''->>''tweetId'')::TEXT,
        (likes->''like''->>''fullText'')::TEXT
      FROM jsonb_array_elements($1) AS likes
      ON CONFLICT (tweet_id) DO NOTHING
    ', p_suffix) USING p_likes;

    EXECUTE format('
      INSERT INTO temp.likes_%s (account_id, liked_tweet_id, archive_upload_id)
      SELECT 
        $2,
        (likes->''like''->>''tweetId'')::TEXT,
        -1
      FROM jsonb_array_elements($1) AS likes
      ON CONFLICT (account_id, liked_tweet_id) DO NOTHING
    ', p_suffix) USING p_likes, p_account_id;
  END;
  $_$;


ALTER FUNCTION "dev"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
  BEGIN
    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
      INSERT INTO temp.profile_%s (bio, website, location, avatar_media_url, header_media_url, account_id, archive_upload_id)
      SELECT 
        ($1->''description''->>''bio'')::TEXT,
        ($1->''description''->>''website'')::TEXT,
        ($1->''description''->>''location'')::TEXT,
        ($1->>''avatarMediaUrl'')::TEXT,
        ($1->>''headerMediaUrl'')::TEXT,
        $2,
        -1
    ', p_suffix) USING p_profile, p_account_id;
  END;
  $_$;


ALTER FUNCTION "dev"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
  BEGIN
    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
      INSERT INTO temp.tweets_%s (
        tweet_id, account_id, created_at, full_text, retweet_count, favorite_count,
        reply_to_tweet_id, reply_to_user_id, reply_to_username, archive_upload_id
      )
      SELECT 
        (tweet->>''id_str'')::TEXT,
        (tweet->>''user_id'')::TEXT,
        (tweet->>''created_at'')::TIMESTAMP WITH TIME ZONE,
        (tweet->>''full_text'')::TEXT,
        (tweet->>''retweet_count'')::INTEGER,
        (tweet->>''favorite_count'')::INTEGER,
        (tweet->>''in_reply_to_status_id_str'')::TEXT,
        (tweet->>''in_reply_to_user_id_str'')::TEXT,
        (tweet->>''in_reply_to_screen_name'')::TEXT,
        -1
      FROM jsonb_array_elements($1) AS tweet
    ', p_suffix) USING p_tweets;
  END;
  $_$;


ALTER FUNCTION "dev"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
  BEGIN
      IF auth.uid() IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

      -- Insert mentioned users
      EXECUTE format('
          INSERT INTO temp.mentioned_users_%s (user_id, name, screen_name, updated_at)
          SELECT DISTINCT
              (mentioned_user->>''id_str'')::TEXT,
              (mentioned_user->>''name'')::TEXT,
              (mentioned_user->>''screen_name'')::TEXT,
              NOW()
          FROM jsonb_array_elements($1) AS tweet,
              jsonb_array_elements(tweet->''entities''->''user_mentions'') AS mentioned_user
      ', p_suffix) USING p_tweets;

      -- Insert user mentions
      EXECUTE format('
          INSERT INTO temp.user_mentions_%s (mentioned_user_id, tweet_id)
          SELECT
              (mentioned_user->>''id_str'')::TEXT,
              (tweet->>''id_str'')::TEXT
          FROM jsonb_array_elements($1) AS tweet,
              jsonb_array_elements(tweet->''entities''->''user_mentions'') AS mentioned_user
      ', p_suffix) USING p_tweets;

      -- Insert tweet media
      EXECUTE format('
          INSERT INTO temp.tweet_media_%s (media_id, tweet_id, media_url, media_type, width, height, archive_upload_id)
          SELECT
              (media->>''id_str'')::BIGINT,
              (tweet->>''id_str'')::TEXT,
              (media->>''media_url_https'')::TEXT,
              (media->>''type'')::TEXT,
              (media->''sizes''->''large''->>''w'')::INTEGER,
              (media->''sizes''->''large''->>''h'')::INTEGER,
              -1
          FROM jsonb_array_elements($1) AS tweet,
              jsonb_array_elements(tweet->''entities''->''media'') AS media
      ', p_suffix) USING p_tweets;

      -- Insert tweet URLs
      EXECUTE format('
          INSERT INTO temp.tweet_urls_%s (url, expanded_url, display_url, tweet_id)
          SELECT
              (url->>''url'')::TEXT,
              (url->>''expanded_url'')::TEXT,
              (url->>''display_url'')::TEXT,
              (tweet->>''id_str'')::TEXT
          FROM jsonb_array_elements($1) AS tweet,
              jsonb_array_elements(tweet->''entities''->''urls'') AS url
      ', p_suffix) USING p_tweets;
  END;
  $_$;


ALTER FUNCTION "dev"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "dev"."process_archive"("archive_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    SET "statement_timeout" TO '10min'
    AS $$
  DECLARE
      v_account_id TEXT;
      v_suffix TEXT;
      v_archive_upload_id BIGINT;
      v_latest_tweet_date TIMESTAMP WITH TIME ZONE;
      v_prepared_tweets JSONB;
      v_user_id UUID;
  BEGIN
      -- Check if the user is authenticated or is the postgres role
      v_user_id := auth.uid();
      IF v_user_id IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

      -- Get the account_id from the archive data
      v_account_id := (archive_data->'account'->0->'account'->>'accountId')::TEXT;

      -- Check if the authenticated user has permission to process this archive
      IF v_suffix != ((select auth.jwt()) -> 'app_metadata' ->> 'provider_id') AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authorized to process this archive';
      END IF;

      v_suffix := v_account_id;
      
      v_prepared_tweets := (
          SELECT jsonb_agg(
              jsonb_set(
                  tweet->'tweet', 
                  '{user_id}', 
                  to_jsonb(v_account_id)
              )
          )
          FROM jsonb_array_elements(archive_data->'tweets') AS tweet
      );

      SELECT MAX((tweet->>'created_at')::TIMESTAMP WITH TIME ZONE) INTO v_latest_tweet_date 
      FROM jsonb_array_elements(v_prepared_tweets) AS tweet;
      
      -- Create temporary tables
      PERFORM dev.create_temp_tables(v_suffix);

      -- Insert into temporary account table
      PERFORM dev.insert_temp_account(archive_data->'account'->0->'account', v_suffix);
      
      -- Insert into temporary archive_upload table
      SELECT dev.insert_temp_archive_upload(v_account_id, v_latest_tweet_date, v_suffix) INTO v_archive_upload_id;

      -- Insert into temporary profiles table
      PERFORM dev.insert_temp_profiles(
        archive_data->'profile'->0->'profile',
        v_account_id,
        v_suffix
      );

      -- Insert tweets data
      PERFORM dev.insert_temp_tweets(v_prepared_tweets, v_suffix);

      -- Process tweet entities and insert related data
      PERFORM dev.process_and_insert_tweet_entities(v_prepared_tweets, v_suffix);

      -- Insert followers data
      PERFORM dev.insert_temp_followers(
          archive_data->'follower',
          v_account_id,
          v_suffix
      );

      -- Insert following data
      PERFORM dev.insert_temp_following(
          archive_data->'following',
          v_account_id,
          v_suffix
      );

      -- Insert likes data
      PERFORM dev.insert_temp_likes(
          archive_data->'like',
          v_account_id,
          v_suffix
      );

      -- Commit to dev tables
      PERFORM dev.commit_temp_data(v_suffix);
  END;
  $$;


ALTER FUNCTION "dev"."process_archive"("archive_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."archive_temp_data"("batch_size" integer DEFAULT 10000, "max_runtime_seconds" integer DEFAULT 300, "age_interval" interval DEFAULT '7 days'::interval) RETURNS TABLE("archived_count" bigint, "remaining_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    total_archived BIGINT := 0;
    batch_archived INT;
    remaining BIGINT;
    current_id INT := 0;
BEGIN
    -- Record start time for runtime limit enforcement
    start_time := clock_timestamp();
    end_time := start_time + (max_runtime_seconds * interval '1 second');
    
    -- Get initial count of records to archive
    SELECT COUNT(*) INTO remaining
    FROM public.temporary_data
    WHERE inserted IS NOT NULL 
      AND timestamp < NOW() - age_interval;
    
    -- Stop if nothing to archive
    IF remaining = 0 THEN
        archived_count := 0;
        remaining_count := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Process in batches until done or time limit reached
    LOOP
        -- Exit if runtime limit reached
        IF clock_timestamp() > end_time THEN
            EXIT;
        END IF;
        
        -- Temporarily store IDs to process in this batch
        CREATE TEMPORARY TABLE IF NOT EXISTS temp_batch_ids ON COMMIT DROP AS
        SELECT id 
        FROM public.temporary_data
        WHERE inserted IS NOT NULL 
          AND timestamp < NOW() - age_interval
          AND id > current_id
        ORDER BY id
        LIMIT batch_size;
        
        -- Get number of records in this batch
        SELECT COUNT(*) INTO batch_archived FROM temp_batch_ids;
        
        -- Exit loop if no more records to process
        IF batch_archived = 0 THEN
            EXIT;
        END IF;
        
        -- Get max ID in this batch to track progress
        SELECT MAX(id) INTO current_id FROM temp_batch_ids;
        
        -- Insert batch into archive table
        INSERT INTO private.archived_temporary_data
        SELECT t.*
        FROM public.temporary_data t
        JOIN temp_batch_ids b ON t.id = b.id
        ON CONFLICT (type, originator_id, item_id, timestamp) DO NOTHING;
        
        -- Delete the archived records
        DELETE FROM public.temporary_data t
        USING temp_batch_ids b
        WHERE t.id = b.id;
        
        -- Update running total
        total_archived := total_archived + batch_archived;
        
        -- Clean up the temporary table (will be dropped on COMMIT anyway)
        DROP TABLE temp_batch_ids;
    END LOOP;
    
    -- Get remaining count
    SELECT COUNT(*) INTO remaining
    FROM public.temporary_data
    WHERE inserted IS NOT NULL 
      AND timestamp < NOW() - age_interval;
    
    -- Return statistics
    archived_count := total_archived;
    remaining_count := remaining;
    RETURN NEXT;
    
    RETURN;
END;
$$;


ALTER FUNCTION "private"."archive_temp_data"("batch_size" integer, "max_runtime_seconds" integer, "age_interval" interval) OWNER TO "postgres";


COMMENT ON FUNCTION "private"."archive_temp_data"("batch_size" integer, "max_runtime_seconds" integer, "age_interval" interval) IS 'Archives records from public.temporary_data to private.archived_temporary_data where inserted IS NOT NULL and timestamp is older than the specified interval. Processes data in batches using ID ranges for efficiency.';



CREATE OR REPLACE FUNCTION "private"."commit_temp_data_test"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '30min'
    AS $_$
DECLARE
    v_archive_upload_id BIGINT;
    v_account_id TEXT;
    v_archive_at TIMESTAMP WITH TIME ZONE;
    v_keep_private BOOLEAN;
    v_upload_likes BOOLEAN;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    RAISE NOTICE 'commit_temp_data called with suffix: %', p_suffix;
    
    RAISE NOTICE 'Phase 1: Inserting account data';
    -- 1. Insert account data first
    EXECUTE format('
        INSERT INTO public.all_account (
            created_via, username, account_id, created_at, account_display_name,
            num_tweets, num_following, num_followers, num_likes
        )
        SELECT 
            created_via, username, account_id, created_at, account_display_name,
            num_tweets, num_following, num_followers, num_likes
        FROM temp.account_%s
        ON CONFLICT (account_id) DO UPDATE SET
            username = EXCLUDED.username,
            account_display_name = EXCLUDED.account_display_name,
            created_via = EXCLUDED.created_via,
            created_at = EXCLUDED.created_at,
            num_tweets = EXCLUDED.num_tweets,
            num_following = EXCLUDED.num_following,
            num_followers = EXCLUDED.num_followers,
            num_likes = EXCLUDED.num_likes
        RETURNING account_id
    ', p_suffix) INTO v_account_id;

    RAISE NOTICE 'Phase 2: Getting archive upload data';
    -- 2. Get the latest archive upload data from temp.archive_upload
    EXECUTE format('
        SELECT archive_at, keep_private, upload_likes, start_date, end_date
        FROM temp.archive_upload_%s
        ORDER BY archive_at DESC
        LIMIT 1
    ', p_suffix) INTO v_archive_at, v_keep_private, v_upload_likes, v_start_date, v_end_date;

    RAISE NOTICE 'Phase 3: Inserting archive upload data';
    -- 3. Insert or update archive_upload and get the ID
    INSERT INTO public.archive_upload (
        account_id, 
        archive_at, 
        created_at, 
        keep_private, 
        upload_likes, 
        start_date, 
        end_date,
        upload_phase
    )
    VALUES (
        v_account_id, 
        v_archive_at, 
        CURRENT_TIMESTAMP, 
        v_keep_private, 
        v_upload_likes, 
        v_start_date, 
        v_end_date,
        'uploading'
    )
    ON CONFLICT (account_id, archive_at)
    DO UPDATE SET
        account_id = EXCLUDED.account_id,
        created_at = CURRENT_TIMESTAMP,
        keep_private = EXCLUDED.keep_private,
        upload_likes = EXCLUDED.upload_likes,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        upload_phase = 'uploading'
    RETURNING id INTO v_archive_upload_id;

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

    RAISE NOTICE 'Phase 5: Inserting tweets data';
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

    RAISE NOTICE 'Phase 9: Inserting tweet URLs data';
    -- Insert tweet_urls data
    EXECUTE format('
        INSERT INTO public.tweet_urls (url, expanded_url, display_url, tweet_id)
        SELECT tu.url, tu.expanded_url, tu.display_url, tu.tweet_id
        FROM temp.tweet_urls_%s tu
        JOIN public.tweets t ON tu.tweet_id = t.tweet_id
        ON CONFLICT (tweet_id, url) DO NOTHING
    ', p_suffix);

    RAISE NOTICE 'Phase 10: Inserting followers data';
    -- Insert followers data
    EXECUTE format('
        INSERT INTO public.followers (account_id, follower_account_id, archive_upload_id)
        SELECT f.account_id, f.follower_account_id, $1
        FROM temp.followers_%s f
        ON CONFLICT (account_id, follower_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;

    RAISE NOTICE 'Phase 11: Inserting following data';
    -- Insert following data
    EXECUTE format('
        INSERT INTO public.following (account_id, following_account_id, archive_upload_id)
        SELECT f.account_id, f.following_account_id, $1
        FROM temp.following_%s f
        ON CONFLICT (account_id, following_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;

    RAISE NOTICE 'Phase 12: Inserting liked tweets data';
    -- Insert liked_tweets data
    EXECUTE format('
        INSERT INTO public.liked_tweets (tweet_id, full_text)
        SELECT lt.tweet_id, lt.full_text
        FROM temp.liked_tweets_%s lt
        ON CONFLICT (tweet_id) DO NOTHING
    ', p_suffix);

    RAISE NOTICE 'Phase 13: Inserting likes data';
    -- Insert likes data
    EXECUTE format('
        INSERT INTO public.likes (account_id, liked_tweet_id, archive_upload_id)
        SELECT l.account_id, l.liked_tweet_id, $1
        FROM temp.likes_%s l
        ON CONFLICT (account_id, liked_tweet_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;

    RAISE NOTICE 'Phase 14: Dropping temporary tables';
    -- Drop temporary tables after committing
    PERFORM public.drop_temp_tables(p_suffix);

    RAISE NOTICE 'Phase 15: Updating upload phase to completed';
    -- Update upload_phase to 'completed' after successful execution
    UPDATE public.archive_upload
    SET upload_phase = 'completed'
    WHERE id = v_archive_upload_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Update upload_phase to 'failed' if an error occurs
        UPDATE public.archive_upload
        SET upload_phase = 'failed'
        WHERE id = v_archive_upload_id;
        RAISE;
END;
$_$;


ALTER FUNCTION "private"."commit_temp_data_test"("p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."count_liked_tweets_in_replies"() RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    liked_tweets_count BIGINT;
BEGIN
    -- This function counts how many of the tweets in the liked_tweets table
    -- are present in the reply_to_tweet_id column of the tweet_replies_view.
    
    SELECT
        COUNT(*) INTO liked_tweets_count
    FROM
        public.liked_tweets lt
    JOIN
        public.tweet_replies_view tr ON lt.tweet_id = tr.reply_to_tweet_id;

    RETURN liked_tweets_count;
END;
$$;


ALTER FUNCTION "private"."count_liked_tweets_in_replies"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "private"."get_reply_to_user_counts"() RETURNS TABLE("unique_reply_to_users" bigint, "mentioned_users_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- This function returns the count of unique users in the reply_to_user_id column
    -- of the public.tweets table and the count of those users that exist in the
    -- public.mentioned_users table.
    
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT t.reply_to_user_id) AS unique_reply_to_users,
        COUNT(DISTINCT mu.user_id) AS mentioned_users_count
    FROM 
        public.tweets t
    LEFT JOIN 
        public.mentioned_users mu ON t.reply_to_user_id = mu.user_id
    WHERE 
        t.reply_to_user_id IS NOT NULL;
END;
$$;


ALTER FUNCTION "private"."get_reply_to_user_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_tweets_in_user_conversations"("username_" "text") RETURNS TABLE("conversation_id" "text", "tweet_id" "text", "created_at" timestamp with time zone, "full_text" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT c.conversation_id, 
           t.tweet_id, 
           t.created_at, 
           t.full_text
    FROM tweets t
    JOIN conversations c ON t.tweet_id = c.tweet_id
    WHERE c.conversation_id IN (
        SELECT c.conversation_id
        FROM tweets t
        JOIN account a ON t.account_id = a.account_id
        JOIN conversations c ON t.tweet_id = c.tweet_id
        WHERE a.username = username_
    );
END;
$$;


ALTER FUNCTION "private"."get_tweets_in_user_conversations"("username_" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_user_conversations"("username_" "text") RETURNS TABLE("conversation_id" "text", "tweet_id" "text", "created_at" timestamp with time zone, "full_text" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT c.conversation_id, 
           t.tweet_id, 
           t.created_at, 
           t.full_text
    FROM tweets t
    JOIN account a ON t.account_id = a.account_id
    JOIN conversations c ON t.tweet_id = c.tweet_id
    WHERE a.username = username_;
END;
$$;


ALTER FUNCTION "private"."get_user_conversations"("username_" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."post_upload_update_conversation_ids"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    
    RAISE NOTICE 'Updating conversation ids';
    PERFORM private.update_conversation_ids();
   
END;
$$;


ALTER FUNCTION "private"."post_upload_update_conversation_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."pretty_tweet_info"("input_tweet_id" "text") RETURNS TABLE("section" "text", "info" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    tweet_record RECORD;
    media_record RECORD;
    url_record RECORD;
    mention_record RECORD;
    quoted_tweet_record RECORD;
    reply_to_record RECORD;
    conversation_tweets_count INTEGER;
BEGIN
    -- Get main tweet information
    SELECT 
        t.tweet_id,
        t.account_id,
        a.username,
        a.account_display_name,
        a.num_followers,
        a.num_following,
        a.num_tweets,
        p.bio,
        p.location,
        p.website,
        p.avatar_media_url,
        t.created_at,
        t.full_text,
        t.retweet_count,
        t.favorite_count,
        t.reply_to_tweet_id,
        t.reply_to_user_id,
        t.reply_to_username,
        c.conversation_id
    INTO tweet_record
    FROM tweets t
    JOIN all_account a ON t.account_id = a.account_id
    LEFT JOIN all_profile p ON t.account_id = p.account_id
    LEFT JOIN conversations c ON t.tweet_id = c.tweet_id
    WHERE t.tweet_id = input_tweet_id;
    
    -- Check if tweet exists
    IF NOT FOUND THEN
        section := 'ERROR';
        info := 'Tweet not found: ' || input_tweet_id;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Tweet Header
    section := '🐦 TWEET';
    info := '==========================================';
    RETURN NEXT;
    
    -- Tweet Basic Info
    section := 'Tweet ID';
    info := tweet_record.tweet_id;
    RETURN NEXT;
    
    section := 'Created';
    info := to_char(tweet_record.created_at, 'YYYY-MM-DD HH24:MI:SS TZ');
    RETURN NEXT;
    
    section := 'Text';
    info := tweet_record.full_text;
    RETURN NEXT;
    
    section := 'Retweets';
    info := tweet_record.retweet_count::TEXT;
    RETURN NEXT;
    
    section := 'Likes';
    info := tweet_record.favorite_count::TEXT;
    RETURN NEXT;
    
    -- Author Header
    section := '👤 AUTHOR';
    info := '==========================================';
    RETURN NEXT;
    
    section := 'Username';
    info := '@' || tweet_record.username;
    RETURN NEXT;
    
    section := 'Display Name';
    info := tweet_record.account_display_name;
    RETURN NEXT;
    
    section := 'Account ID';
    info := tweet_record.account_id;
    RETURN NEXT;
    
    section := 'Followers';
    info := coalesce(tweet_record.num_followers::TEXT, 'N/A');
    RETURN NEXT;
    
    section := 'Following';
    info := coalesce(tweet_record.num_following::TEXT, 'N/A');
    RETURN NEXT;
    
    section := 'Total Tweets';
    info := coalesce(tweet_record.num_tweets::TEXT, 'N/A');
    RETURN NEXT;
    
    IF tweet_record.bio IS NOT NULL THEN
        section := 'Bio';
        info := tweet_record.bio;
        RETURN NEXT;
    END IF;
    
    IF tweet_record.location IS NOT NULL THEN
        section := 'Location';
        info := tweet_record.location;
        RETURN NEXT;
    END IF;
    
    IF tweet_record.website IS NOT NULL THEN
        section := 'Website';
        info := tweet_record.website;
        RETURN NEXT;
    END IF;
    
    -- Reply Information
    IF tweet_record.reply_to_tweet_id IS NOT NULL THEN
        section := '💬 REPLY TO';
        info := '==========================================';
        RETURN NEXT;
        
        section := 'Reply to Tweet ID';
        info := tweet_record.reply_to_tweet_id;
        RETURN NEXT;
        
        section := 'Reply to Username';
        info := '@' || coalesce(tweet_record.reply_to_username, 'unknown');
        RETURN NEXT;
        
        section := 'Reply to User ID';
        info := coalesce(tweet_record.reply_to_user_id, 'unknown');
        RETURN NEXT;
        
        -- Get original tweet text
        SELECT full_text INTO reply_to_record
        FROM tweets 
        WHERE tweet_id = tweet_record.reply_to_tweet_id;
        
        IF FOUND THEN
            section := 'Original Tweet Text';
            info := reply_to_record.full_text;
            RETURN NEXT;
        END IF;
    END IF;
    
    -- Conversation Information
    IF tweet_record.conversation_id IS NOT NULL THEN
        SELECT COUNT(*) INTO conversation_tweets_count
        FROM conversations 
        WHERE conversation_id = tweet_record.conversation_id;
        
        section := '🧵 THREAD';
        info := '==========================================';
        RETURN NEXT;
        
        section := 'Conversation ID';
        info := tweet_record.conversation_id;
        RETURN NEXT;
        
        section := 'Thread Size';
        info := conversation_tweets_count::TEXT || ' tweets';
        RETURN NEXT;
    END IF;
    
    -- Quote Tweet Information
    SELECT quoted_tweet_id INTO quoted_tweet_record
    FROM quote_tweets 
    WHERE tweet_id = input_tweet_id;
    
    IF FOUND THEN
        section := '🔁 QUOTE TWEET';
        info := '==========================================';
        RETURN NEXT;
        
        section := 'Quoted Tweet ID';
        info := quoted_tweet_record.quoted_tweet_id;
        RETURN NEXT;
        
        -- Get quoted tweet details
        SELECT t.full_text, a.username, a.account_display_name
        INTO quoted_tweet_record
        FROM tweets t
        JOIN all_account a ON t.account_id = a.account_id
        WHERE t.tweet_id = quoted_tweet_record.quoted_tweet_id;
        
        IF FOUND THEN
            section := 'Quoted Author';
            info := quoted_tweet_record.account_display_name || ' (@' || quoted_tweet_record.username || ')';
            RETURN NEXT;
            
            section := 'Quoted Text';
            info := quoted_tweet_record.full_text;
            RETURN NEXT;
        END IF;
    END IF;
    
    -- Media Information
    IF EXISTS (SELECT 1 FROM tweet_media WHERE tweet_id = input_tweet_id) THEN
        section := '🖼️ MEDIA';
        info := '==========================================';
        RETURN NEXT;
        
        FOR media_record IN 
            SELECT media_id, media_url, media_type, width, height
            FROM tweet_media 
            WHERE tweet_id = input_tweet_id
            ORDER BY media_id
        LOOP
            section := 'Media ' || media_record.media_id::TEXT;
            info := media_record.media_type || ' (' || media_record.width || 'x' || media_record.height || ') - ' || media_record.media_url;
            RETURN NEXT;
        END LOOP;
    END IF;
    
    -- URLs Information
    IF EXISTS (SELECT 1 FROM tweet_urls WHERE tweet_id = input_tweet_id) THEN
        section := '🔗 LINKS';
        info := '==========================================';
        RETURN NEXT;
        
        FOR url_record IN 
            SELECT url, expanded_url, display_url
            FROM tweet_urls 
            WHERE tweet_id = input_tweet_id
            ORDER BY id
        LOOP
            section := 'Link';
            info := url_record.display_url || ' → ' || url_record.expanded_url;
            RETURN NEXT;
        END LOOP;
    END IF;
    
    -- User Mentions
    IF EXISTS (SELECT 1 FROM user_mentions WHERE tweet_id = input_tweet_id) THEN
        section := '👥 MENTIONS';
        info := '==========================================';
        RETURN NEXT;
        
        FOR mention_record IN 
            SELECT mu.name, mu.screen_name, mu.user_id
            FROM user_mentions um
            JOIN mentioned_users mu ON um.mentioned_user_id = mu.user_id
            WHERE um.tweet_id = input_tweet_id
            ORDER BY mu.screen_name
        LOOP
            section := 'Mention';
            info := '@' || mention_record.screen_name || ' (' || mention_record.name || ') - ID: ' || mention_record.user_id;
            RETURN NEXT;
        END LOOP;
    END IF;
    
    RETURN;
END;
$$;


ALTER FUNCTION "private"."pretty_tweet_info"("input_tweet_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."process_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_job RECORD;
    v_start_time TIMESTAMP;
BEGIN
    RAISE NOTICE 'Starting process_jobs';

    -- Check for a job using job_name
    SELECT * INTO v_job
    FROM private.job_queue
    WHERE status = 'QUEUED'
    ORDER BY timestamp
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- If no job, exit
    IF NOT FOUND THEN
        RAISE NOTICE 'No jobs found, exiting';
        RETURN;
    END IF;

    RAISE NOTICE 'Processing job: % (key: %)', COALESCE(v_job.job_name, 'unknown'), v_job.key;

    -- Update job status to PROCESSING
    UPDATE private.job_queue
    SET status = 'PROCESSING'
    WHERE key = v_job.key;

    BEGIN  -- Start exception block
        -- Set 30 minute timeout for this job's execution
        SET LOCAL statement_timeout TO '1800000';  -- 30 minutes in milliseconds

        -- Do the job based on job_name instead of key
        IF v_job.job_name = 'archive_changes' THEN
            RAISE NOTICE 'Refreshing materialized views concurrently';
            v_start_time := clock_timestamp();
            REFRESH MATERIALIZED VIEW CONCURRENTLY public.global_activity_summary;
            RAISE NOTICE 'Refreshing materialized view took: %', clock_timestamp() - v_start_time;
            
        END IF;

        IF v_job.job_name = 'update_conversation_ids' THEN
            RAISE NOTICE 'Not updating conversation ids, update_conversation_ids needs optimization to not time out';
            -- v_start_time := clock_timestamp();
            -- PERFORM private.post_upload_update_conversation_ids();
            -- RAISE NOTICE 'Updating conversation IDs took: %', clock_timestamp() - v_start_time;
        END IF;

        IF v_job.job_name = 'commit_temp_data' THEN
            RAISE NOTICE 'Committing temp data for account: %', v_job.args->>'account_id';
            v_start_time := clock_timestamp();
            
            PERFORM public.commit_temp_data(cast(v_job.args->>'account_id' as text));
            
            RAISE NOTICE 'Commit processing took: %', clock_timestamp() - v_start_time;
        END IF;

        -- Update status using key
        UPDATE private.job_queue 
        SET status = 'DONE'
        WHERE key = v_job.key;
        RAISE NOTICE 'Job completed and marked as done: % (key: %)', COALESCE(v_job.job_name, 'unknown'), v_job.key;

    EXCEPTION WHEN OTHERS THEN
        -- On any error, mark the job as failed
        UPDATE private.job_queue 
        SET status = 'FAILED'
        WHERE key = v_job.key;
        
        RAISE NOTICE 'Job failed with error: %', SQLERRM;
        RAISE;
    END;
END;
$$;


ALTER FUNCTION "private"."process_jobs"() OWNER TO "postgres";


COMMENT ON FUNCTION "private"."process_jobs"() IS 'Process queued jobs with job_name-based routing and proper error handling';



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


CREATE OR REPLACE FUNCTION "private"."refresh_account_activity_summary"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    start_time timestamptz;
    end_time timestamptz;
BEGIN
    start_time := CURRENT_TIMESTAMP;
    
    INSERT INTO private.materialized_view_refresh_logs (view_name)
    VALUES ('account_activity_summary2');

    REFRESH MATERIALIZED VIEW public.account_activity_summary2;
    
    end_time := CURRENT_TIMESTAMP;
    
    UPDATE private.materialized_view_refresh_logs
    SET refresh_completed_at = end_time,
        duration_ms = EXTRACT(EPOCH FROM (end_time - start_time)) * 1000
    WHERE view_name = 'account_activity_summary2'
    AND refresh_started_at = start_time;
END;
$$;


ALTER FUNCTION "private"."refresh_account_activity_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."snapshot_pg_stat_statements"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO daily_pg_stat_statements (
    userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time, max_plan_time,
    mean_plan_time, stddev_plan_time, calls, total_exec_time, min_exec_time, max_exec_time,
    mean_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied,
    shared_blks_written, local_blks_hit, local_blks_read, local_blks_dirtied, local_blks_written,
    temp_blks_read, temp_blks_written, blk_read_time, blk_write_time, temp_blk_read_time,
    temp_blk_write_time, wal_records, wal_fpi, wal_bytes, jit_functions, jit_generation_time,
    jit_inlining_count, jit_inlining_time, jit_optimization_count, jit_optimization_time,
    jit_emission_count, jit_emission_time
  )
  SELECT
    userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time, max_plan_time,
    mean_plan_time, stddev_plan_time, calls, total_exec_time, min_exec_time, max_exec_time,
    mean_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied,
    shared_blks_written, local_blks_hit, local_blks_read, local_blks_dirtied, local_blks_written,
    temp_blks_read, temp_blks_written, blk_read_time, blk_write_time, temp_blk_read_time,
    temp_blk_write_time, wal_records, wal_fpi, wal_bytes, jit_functions, jit_generation_time,
    jit_inlining_count, jit_inlining_time, jit_optimization_count, jit_optimization_time,
    jit_emission_count, jit_emission_time
  FROM pg_stat_statements;

  -- reset stats after snapshot
  PERFORM pg_stat_statements_reset();
END;
$$;


ALTER FUNCTION "private"."snapshot_pg_stat_statements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_complete_group_insertions"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("completed" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    completed_count INTEGER := 0;
BEGIN
    BEGIN
        -- Identify originator_ids with only api% rows and inserted IS NULL
        WITH eligible_groups AS (
            SELECT originator_id
            FROM temporary_data
            WHERE inserted IS NULL
            AND timestamp < process_cutoff_time
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
            AND td.timestamp < process_cutoff_time
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
$$;


ALTER FUNCTION "private"."tes_complete_group_insertions"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_import_temporary_data_into_tables"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    start_time TIMESTAMP;
    total_time INTERVAL;
    step_start TIMESTAMP;
    step_time INTERVAL;
    process_cutoff_time TIMESTAMP;
    account_result RECORD;
    profile_result RECORD;
    tweet_result RECORD;
    media_result RECORD;
    url_result RECORD;
    mention_result RECORD;
BEGIN
    -- Set aggressive memory settings for this function
    SET LOCAL work_mem = '32MB';  -- Increase from 5MB for better sorts
    SET LOCAL maintenance_work_mem = '256MB';  -- For any index operations
    SET LOCAL temp_buffers = '32MB';  -- For temporary tables
    
    start_time := clock_timestamp();
    RAISE NOTICE 'Starting tes_import_temporary_data_into_tables at %', start_time;
    
    -- Define a timestamp to ensure we only process records that existed when the function was called
    process_cutoff_time := clock_timestamp();
    
    step_start := clock_timestamp();
    SELECT * INTO account_result FROM private.tes_process_account_records(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'Account processing completed in %. Processed % records with % errors', 
        step_time, account_result.processed, array_length(account_result.errors, 1);

    step_start := clock_timestamp();
    SELECT * INTO profile_result FROM private.tes_process_profile_records(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'Profile processing completed in %. Processed % records with % errors', 
        step_time, profile_result.processed, array_length(profile_result.errors, 1);

    step_start := clock_timestamp();
    SELECT * INTO tweet_result FROM private.tes_process_tweet_records(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'Tweet processing completed in %. Processed % records with % errors', 
        step_time, tweet_result.processed, array_length(tweet_result.errors, 1);

    step_start := clock_timestamp();
    SELECT * INTO media_result FROM private.tes_process_media_records(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'Media processing completed in %. Processed % records with % errors', 
        step_time, media_result.processed, array_length(media_result.errors, 1);

    step_start := clock_timestamp();
    SELECT * INTO url_result FROM private.tes_process_url_records(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'URL processing completed in %. Processed % records with % errors', 
        step_time, url_result.processed, array_length(url_result.errors, 1);

    step_start := clock_timestamp();
    SELECT * INTO mention_result FROM private.tes_process_mention_records(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'Mention processing completed in %. Processed % records with % errors', 
        step_time, mention_result.processed, array_length(mention_result.errors, 1);

    step_start := clock_timestamp();
    PERFORM private.tes_complete_group_insertions(process_cutoff_time);
    step_time := clock_timestamp() - step_start;
    RAISE NOTICE 'Group completion finished in %', step_time;

    total_time := clock_timestamp() - start_time;
    RAISE NOTICE 'Total job completed in %', total_time;

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in tes_import_temporary_data_into_tables: %', SQLERRM;
END;
$$;


ALTER FUNCTION "private"."tes_import_temporary_data_into_tables"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_invoke_edge_function_move_data_to_storage"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    request_id TEXT;
    response_status INTEGER;
    start_time TIMESTAMP;
    elapsed_seconds NUMERIC;
BEGIN
    PERFORM net.http_post(
        url:='https://fabxmporizzqflnftavs.supabase.co/functions/v1/schedule_data_moving'
    );
END;
$$;


ALTER FUNCTION "private"."tes_invoke_edge_function_move_data_to_storage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_account_records"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN

        WITH latest_records AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'account_id')::text 
                    ORDER BY (data->>'created_at')::timestamp with time zone DESC
                ) as rn
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
            RETURNING account_id
        )
        SELECT array_agg(account_id) INTO processed_ids FROM insertions;

        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);

        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as account_id
        )
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        FROM processed_ids_table pit
        WHERE td.type = 'import_account' 
        AND (td.data->>'account_id')::text = pit.account_id
        AND td.timestamp < process_cutoff_time;
        
        -- Get error records
        SELECT array_agg((data->>'account_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_account'
        AND (data->>'account_id')::text IS NOT NULL
        AND inserted IS NULL
        AND timestamp < process_cutoff_time;

        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$;


ALTER FUNCTION "private"."tes_process_account_records"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_media_records"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "private"."tes_process_media_records"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_mention_records"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
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
            AND td.timestamp < process_cutoff_time
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
        AND (td.data->>'mentioned_user_id')::text = pit.mentioned_user_id
        AND td.timestamp < process_cutoff_time;
        
        -- Get error records
        SELECT array_agg((data->>'mentioned_user_id')::text || ':' || (data->>'tweet_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_mention'
        AND (data->>'mentioned_user_id')::text IS NOT NULL
        AND inserted IS NULL
        AND timestamp < process_cutoff_time;
        
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
            AND td.timestamp < process_cutoff_time
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
$$;


ALTER FUNCTION "private"."tes_process_mention_records"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_profile_records"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "private"."tes_process_profile_records"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_tweet_records"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "private"."tes_process_tweet_records"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_unique_mention_record"("process_cutoff_time" timestamp without time zone, "target_originator_id" "text") RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
    total_records_found INTEGER := 0;
    latest_records_count INTEGER := 0;
    user_insertion_count INTEGER := 0;
    mention_insertion_count INTEGER := 0;
    update_count INTEGER := 0;
    error_insertion_count INTEGER := 0;
BEGIN
    -- Log function start
    RAISE NOTICE 'Starting tes_process_mention_records for originator_id: %, cutoff_time: %', 
        target_originator_id, process_cutoff_time;

    BEGIN
        -- Log initial record count for this originator
        SELECT COUNT(*) INTO total_records_found
        FROM temporary_data td
        LEFT JOIN private.import_errors ie ON 
            ie.type = 'import_mention' and ie.type = td.type
            AND ie.originator_id = td.originator_id
            AND ie.item_id = td.item_id
        WHERE td.type = 'import_mention'
        AND (td.data->>'mentioned_user_id')::text IS NOT NULL
        AND td.inserted IS NULL
        AND td.timestamp < process_cutoff_time
        AND td.originator_id = target_originator_id
        AND ie.id IS NULL;
        
        RAISE NOTICE 'Found % total unprocessed mention records for originator_id: %', 
            total_records_found, target_originator_id;
        
        -- If no records found, exit early
        IF total_records_found = 0 THEN
            RAISE NOTICE 'No mention records found for processing, returning early';
            RETURN QUERY SELECT 0, ARRAY[]::TEXT[];
            RETURN;
        END IF;

        -- Log start of processing
        RAISE NOTICE 'Starting mention processing for originator_id: %', target_originator_id;

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
            AND td.timestamp < process_cutoff_time
            AND td.originator_id = target_originator_id
            AND ie.id IS NULL
        ),
        count_latest AS (
            SELECT COUNT(*) as cnt FROM latest_records WHERE rn = 1
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
            RETURNING user_id
        ),
        count_user_insertions AS (
            SELECT COUNT(*) as cnt FROM user_insertions
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
        SELECT 
            array_agg(mi.mentioned_user_id),
            (SELECT cnt FROM count_latest),
            (SELECT cnt FROM count_user_insertions),
            COUNT(*)
        INTO processed_ids, latest_records_count, user_insertion_count, mention_insertion_count
        FROM mention_insertions mi;
        
        RAISE NOTICE 'Found % latest records (after deduplication) for originator_id: %', 
            latest_records_count, target_originator_id;
        RAISE NOTICE 'Processed % mentioned_users for originator_id: %', 
            user_insertion_count, target_originator_id;
        RAISE NOTICE 'Processed % user_mentions for originator_id: %', 
            mention_insertion_count, target_originator_id;

        -- Handle case where no records were processed
        IF processed_ids IS NULL THEN
            RAISE NOTICE 'No mention records were inserted/updated for originator_id: %', 
                target_originator_id;
            processed_ids := ARRAY[]::TEXT[];
            processed_count := 0;
        ELSE
            SELECT COUNT(*) INTO processed_count FROM unnest(processed_ids);
            RAISE NOTICE 'Successfully processed % mention records for originator_id: %', 
                processed_count, target_originator_id;
        END IF;
        
        -- Log update operation start
        RAISE NOTICE 'Starting to mark % records as processed for originator_id: %', 
            processed_count, target_originator_id;

        -- Update inserted timestamp
        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as mentioned_user_id
        )
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        FROM processed_ids_table pit
        WHERE td.type = 'import_mention' 
        AND (td.data->>'mentioned_user_id')::text = pit.mentioned_user_id
        AND td.timestamp < process_cutoff_time
        AND td.originator_id = target_originator_id;

        GET DIAGNOSTICS update_count = ROW_COUNT;
        RAISE NOTICE 'Marked % temporary_data records as processed for originator_id: %', 
            update_count, target_originator_id;
        
        -- Log error scan start
        RAISE NOTICE 'Starting error scan for remaining unprocessed mention records for originator_id: %', 
            target_originator_id;

        -- Get error records
        SELECT array_agg((data->>'mentioned_user_id')::text || ':' || (data->>'tweet_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_mention'
        AND (data->>'mentioned_user_id')::text IS NOT NULL
        AND inserted IS NULL
        AND timestamp < process_cutoff_time
        AND originator_id = target_originator_id;
        
        IF error_records IS NOT NULL THEN
            RAISE NOTICE 'Found % error records for originator_id: %', 
                array_length(error_records, 1), target_originator_id;
        ELSE
            RAISE NOTICE 'No error records found for originator_id: %', target_originator_id;
            error_records := ARRAY[]::TEXT[];
        END IF;

        RAISE NOTICE 'Completing tes_process_mention_records for originator_id: % - processed: %, errors: %', 
            target_originator_id, processed_count, COALESCE(array_length(error_records, 1), 0);
        
        RETURN QUERY SELECT processed_count, error_records;
    
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'ERROR in tes_process_mention_records for originator_id: % - SQLSTATE: %, SQLERRM: %', 
            target_originator_id, SQLSTATE, SQLERRM;

        -- Insert failed records into import_errors table, but only for specific conditions
        WITH failed_records AS (
            SELECT 
                td.data->>'mentioned_user_id' AS mentioned_user_id,
                td.data->>'tweet_id' AS tweet_id,
                td.item_id, 
                td.originator_id
            FROM temporary_data td 
            LEFT JOIN private.import_errors ie ON 
                ie.type = 'import_mention' AND
                ie.originator_id = td.originator_id AND 
                ie.item_id = td.item_id
            WHERE td.type = 'import_mention'
            AND td.data->>'mentioned_user_id' IS NOT NULL
            AND td.inserted IS NULL
            AND td.timestamp < process_cutoff_time
            AND td.originator_id = target_originator_id
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
        ),
        error_insertions AS (
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
            WHERE missing_tweet
            RETURNING id
        )
        SELECT COUNT(*) INTO error_insertion_count FROM error_insertions;

        RAISE NOTICE 'Inserted % error records into import_errors for originator_id: %', 
            error_insertion_count, target_originator_id;
        
        RETURN QUERY SELECT -1, ARRAY[format('SQLSTATE: %s, Error: %s', SQLSTATE, SQLERRM)];
    END;
END;
$$;


ALTER FUNCTION "private"."tes_process_unique_mention_record"("process_cutoff_time" timestamp without time zone, "target_originator_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_unique_tweet_record"("process_cutoff_time" timestamp without time zone, "target_originator_id" "text") RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
    total_records_found INTEGER := 0;
    latest_records_count INTEGER := 0;
    insertion_count INTEGER := 0;
    update_count INTEGER := 0;
BEGIN
    -- Log function start
    RAISE NOTICE 'Starting tes_process_tweet_records for originator_id: %, cutoff_time: %', 
        target_originator_id, process_cutoff_time;
    
    BEGIN
        -- Log initial record count for this originator
        SELECT COUNT(*) INTO total_records_found
        FROM temporary_data 
        WHERE type = 'import_tweet' 
        AND (data->>'tweet_id')::text IS NOT NULL
        AND inserted IS NULL
        AND timestamp < process_cutoff_time
        AND originator_id = target_originator_id;
        
        RAISE NOTICE 'Found % total unprocessed tweet records for originator_id: %', 
            total_records_found, target_originator_id;
        
        -- If no records found, exit early
        IF total_records_found = 0 THEN
            RAISE NOTICE 'No records found for processing, returning early';
            RETURN QUERY SELECT 0, ARRAY[]::TEXT[];
            RETURN;
        END IF;
       
        WITH latest_records AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'tweet_id')::text 
                    ORDER BY (data->>'created_at')::timestamp with time zone DESC
                ) as rn
            FROM temporary_data 
            WHERE type = 'import_tweet' 
            AND (data->>'tweet_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
            AND originator_id = target_originator_id
        ),
        count_latest AS (
            SELECT COUNT(*) as cnt FROM latest_records WHERE rn = 1
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
            RETURNING tweet_id
        )
        SELECT 
            array_agg(i.tweet_id), 
            (SELECT cnt FROM count_latest)
        INTO processed_ids, latest_records_count
        FROM insertions i;

        RAISE NOTICE 'Found % latest records (after deduplication) for originator_id: %', 
            latest_records_count, target_originator_id;

        -- Log insertion results
        IF processed_ids IS NOT NULL THEN
            SELECT COUNT(*) INTO insertion_count FROM unnest(processed_ids);
            RAISE NOTICE 'Successfully inserted/updated % tweet records for originator_id: %', 
                insertion_count, target_originator_id;
        ELSE
            RAISE NOTICE 'No tweet records were inserted/updated for originator_id: %', 
                target_originator_id;
            processed_ids := ARRAY[]::TEXT[];
            insertion_count := 0;
        END IF;

        processed_count := insertion_count;

        -- Log update operation start
        RAISE NOTICE 'Starting to mark % records as processed for originator_id: %', 
            processed_count, target_originator_id;

        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as tweet_id
        )
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        FROM processed_ids_table pit
        WHERE td.type = 'import_tweet' 
        AND (td.data->>'tweet_id')::text = pit.tweet_id
        AND td.timestamp < process_cutoff_time
        AND td.originator_id = target_originator_id;

        GET DIAGNOSTICS update_count = ROW_COUNT;
        RAISE NOTICE 'Marked % temporary_data records as processed for originator_id: %', 
            update_count, target_originator_id;

        -- Log error scan start
        RAISE NOTICE 'Starting error scan for remaining unprocessed records for originator_id: %', 
            target_originator_id;

        WITH error_scan AS (
            SELECT (data->>'tweet_id')::text as error_id,
                   count(*) OVER () as total_scanned
            FROM temporary_data
            WHERE type = 'import_tweet'
            AND (data->>'tweet_id')::text IS NOT NULL
            AND inserted IS NULL
            AND timestamp < process_cutoff_time
            AND originator_id = target_originator_id
        )
        SELECT array_agg(error_id)
        INTO error_records
        FROM error_scan;
        
        IF error_records IS NOT NULL THEN
            RAISE NOTICE 'Found % error records for originator_id: %', 
                array_length(error_records, 1), target_originator_id;
        ELSE
            RAISE NOTICE 'No error records found for originator_id: %', target_originator_id;
            error_records := ARRAY[]::TEXT[];
        END IF;

        RAISE NOTICE 'Completing tes_process_tweet_records for originator_id: % - processed: %, errors: %', 
            target_originator_id, processed_count, COALESCE(array_length(error_records, 1), 0);
        
        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'ERROR in tes_process_tweet_records for originator_id: % - SQLSTATE: %, SQLERRM: %', 
            target_originator_id, SQLSTATE, SQLERRM;
        RETURN QUERY SELECT -1, ARRAY[format('SQLSTATE: %s, Error: %s', SQLSTATE, SQLERRM)];
    END;
END;
$$;


ALTER FUNCTION "private"."tes_process_unique_tweet_record"("process_cutoff_time" timestamp without time zone, "target_originator_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."tes_process_url_records"("process_cutoff_time" timestamp without time zone) RETURNS TABLE("processed" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "private"."tes_process_url_records"("process_cutoff_time" timestamp without time zone) OWNER TO "postgres";


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
    
    -- Call the optimized function
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
            -- This tweet is not a reply, so it starts its own conversation
            current_conversation_id := current_tweet.tweet_id;
        ELSE
            -- Check if the tweet this is replying to has been processed
            SELECT conversation_id INTO current_conversation_id
            FROM temp_processed_tweets
            WHERE tweet_id = current_tweet.reply_to_tweet_id;

            IF current_conversation_id IS NULL THEN
                -- The tweet this is replying to hasn't been processed yet, so skip this tweet
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
    -- Release the advisory lock
    PERFORM pg_advisory_unlock(lock_key);

    RETURN affected_rows;
EXCEPTION
    WHEN OTHERS THEN
        -- Clean up the temporary table if it exists
        DROP TABLE IF EXISTS temp_processed_tweets;

        -- Release the advisory lock
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
    
    -- Obtain an advisory lock using the calculated key
    PERFORM pg_advisory_lock(lock_key);
    
    -- Create a temporary table to store processed tweets
    CREATE TEMPORARY TABLE temp_processed_tweets (
        tweet_id text PRIMARY KEY,
        conversation_id text
    );

    -- Create an index on the temporary table
    CREATE INDEX idx_temp_conversation_id ON temp_processed_tweets(conversation_id);

    -- Build the WHERE clause based on timestamp parameter
    where_clause := CASE 
        WHEN since_timestamp IS NOT NULL THEN 
            'WHERE updated_at >= ''' || since_timestamp || ''''
        ELSE 
            ''
    END;

    -- Process tweets in order, optionally filtering by timestamp
    FOR current_tweet IN 
        EXECUTE format('SELECT tweet_id, reply_to_tweet_id FROM tweets %s ORDER BY tweet_id', where_clause)
    LOOP
        IF current_tweet.reply_to_tweet_id IS NULL THEN
            -- This tweet is not a reply, so it starts its own conversation
            current_conversation_id := current_tweet.tweet_id;
        ELSE
            -- Check if the tweet this is replying to has been processed in this run
            SELECT conversation_id INTO current_conversation_id
            FROM temp_processed_tweets
            WHERE tweet_id = current_tweet.reply_to_tweet_id;

            -- If not in temp table, check existing conversations table
            IF current_conversation_id IS NULL THEN
                SELECT conversation_id INTO current_conversation_id
                FROM conversations
                WHERE tweet_id = current_tweet.reply_to_tweet_id;
            END IF;

            IF current_conversation_id IS NULL THEN
                -- The tweet this is replying to hasn't been processed yet, so skip this tweet
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
    -- Release the advisory lock
    PERFORM pg_advisory_unlock(lock_key);

    RETURN affected_rows;
EXCEPTION
    WHEN OTHERS THEN
        -- Clean up the temporary table if it exists
        DROP TABLE IF EXISTS temp_processed_tweets;

        -- Release the advisory lock
        PERFORM pg_advisory_unlock(lock_key);

        GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
        RAISE EXCEPTION 'An error occurred in update_conversation_ids_since: %', error_message;
END;
$$;


ALTER FUNCTION "private"."update_conversation_ids_since"("since_timestamp" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "private"."update_conversation_ids_since"("since_timestamp" timestamp with time zone) IS 'Optimized version of update_conversation_ids that can process only tweets updated since a given timestamp. 
When since_timestamp is NULL, processes all tweets (same as original function).
When since_timestamp is provided, only processes tweets with updated_at >= since_timestamp.
This allows for efficient incremental updates instead of reprocessing all tweets.';



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
    
    -- Use a different lock key to avoid conflicts with the old function
    lock_key := hashtext('private' || '.' || 'update_conversation_ids_since_v2')::BIGINT;
    
    -- Try to obtain an advisory lock with timeout (don't wait forever)
    IF NOT pg_try_advisory_lock(lock_key) THEN
        RAISE EXCEPTION 'Could not obtain lock - another conversation update is running';
    END IF;

    -- Use a simpler approach without temp tables for small batches
    -- Process tweets in batches to avoid memory issues
    OPEN cursor_tweets(since_timestamp);
    
    LOOP
        FETCH cursor_tweets INTO current_tweet;
        EXIT WHEN NOT FOUND;
        
        IF current_tweet.reply_to_tweet_id IS NULL THEN
            -- This tweet is not a reply, so it starts its own conversation
            current_conversation_id := current_tweet.tweet_id;
        ELSE
            -- Look up the conversation ID directly from the conversations table
            SELECT conversation_id INTO current_conversation_id
            FROM conversations
            WHERE tweet_id = current_tweet.reply_to_tweet_id;
            
            IF current_conversation_id IS NULL THEN
                -- If parent tweet doesn't have a conversation ID yet, skip for now
                -- This is a simplified approach - in practice you might want to handle this differently
                CONTINUE;
            END IF;
        END IF;
        
        -- Insert or update the conversation record
        INSERT INTO conversations (tweet_id, conversation_id)
        VALUES (current_tweet.tweet_id, current_conversation_id)
        ON CONFLICT (tweet_id) DO UPDATE
        SET conversation_id = EXCLUDED.conversation_id
        WHERE conversations.conversation_id IS DISTINCT FROM EXCLUDED.conversation_id;
        
        affected_rows := affected_rows + 1;
        
        -- Commit periodically to avoid long transactions
        IF affected_rows % 1000 = 0 THEN
            COMMIT;
        END IF;
    END LOOP;
    
    CLOSE cursor_tweets;
    processed_batches := 1;
    
    -- Release the advisory lock
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
        -- Make sure to close cursor and release lock on error
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
    
    -- Use a different lock key to avoid conflicts
    lock_key := hashtext('private' || '.' || 'update_conversation_ids_since_v3')::BIGINT;
    
    -- Try to obtain an advisory lock with timeout (don't wait forever)
    IF NOT pg_try_advisory_lock(lock_key) THEN
        RAISE EXCEPTION 'Could not obtain lock - another conversation update is running';
    END IF;

    -- Process tweets using FOR loop (simpler than cursors)
    FOR current_tweet IN
        SELECT tweet_id, reply_to_tweet_id 
        FROM tweets 
        WHERE (since_timestamp IS NULL OR updated_at >= since_timestamp)
        ORDER BY tweet_id
        LIMIT batch_size
    LOOP
        processed_tweets := processed_tweets + 1;
        
        IF current_tweet.reply_to_tweet_id IS NULL THEN
            -- This tweet is not a reply, so it starts its own conversation
            current_conversation_id := current_tweet.tweet_id;
        ELSE
            -- Look up the conversation ID directly from the conversations table
            SELECT conversation_id INTO current_conversation_id
            FROM conversations
            WHERE tweet_id = current_tweet.reply_to_tweet_id;
            
            IF current_conversation_id IS NULL THEN
                -- If parent tweet doesn't have a conversation ID yet, skip for now
                CONTINUE;
            END IF;
        END IF;
        
        -- Insert or update the conversation record
        INSERT INTO conversations (tweet_id, conversation_id)
        VALUES (current_tweet.tweet_id, current_conversation_id)
        ON CONFLICT (tweet_id) DO UPDATE
        SET conversation_id = EXCLUDED.conversation_id
        WHERE conversations.conversation_id IS DISTINCT FROM EXCLUDED.conversation_id;
        
        IF FOUND THEN
            affected_rows := affected_rows + 1;
        END IF;
    END LOOP;
    
    -- Release the advisory lock
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
        -- Release lock on error
        PERFORM pg_advisory_unlock(lock_key);
        
        GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
        RAISE EXCEPTION 'An error occurred in update_conversation_ids_since_v3: %', error_message;
END;
$$;


ALTER FUNCTION "private"."update_conversation_ids_since_v3"("since_timestamp" timestamp with time zone, "batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_public_entities_rls_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    policy_name TEXT;
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP;

    -- Create public read policy
    EXECUTE format('
        CREATE POLICY "Entities are publicly visible" ON %I.%I
        FOR SELECT
        USING (true)', schema_name, table_name);

    -- Create authenticated write policy
    EXECUTE format('
        CREATE POLICY "Entities are modifiable by their users" ON %I.%I TO authenticated
        USING (
            EXISTS (
                SELECT 1 
                FROM public.tweets dt 
                WHERE dt.tweet_id = %I.tweet_id 
                AND dt.account_id = (SELECT auth.jwt() ->> ''sub'')
            )
        ) 
        WITH CHECK (
            EXISTS (
                SELECT 1 
                FROM public.tweets dt 
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
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
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
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP; 

    -- Update the public visibility policy to check for keep_private more efficiently
    EXECUTE format('
        CREATE POLICY "Data is publicly visible" ON %I.%I
        FOR SELECT
        USING (true)', schema_name, table_name);

    -- The modification policy remains unchanged
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
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
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
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP; 

    -- Only create read policy, writes will be handled by service role/postgres
    EXECUTE format('CREATE POLICY "Public read access" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
END;
$$;


ALTER FUNCTION "public"."apply_readonly_rls_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."commit_temp_data"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '30min'
    AS $_$
DECLARE
    v_archive_upload_id BIGINT;
    v_account_id TEXT;
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
    SELECT id, archive_at, keep_private, upload_likes, start_date, end_date
    INTO v_archive_upload_id, v_archive_at, v_keep_private, v_upload_likes, v_start_date, v_end_date
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



CREATE OR REPLACE FUNCTION "public"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS TABLE("period_start" timestamp with time zone, "period_end" timestamp with time zone, "tweet_count" bigint, "unique_scrapers" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM ca_website.compute_hourly_scraping_stats(p_start_date, p_end_date);
END;
$$;


ALTER FUNCTION "public"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


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

        -- 7. Refresh quote_tweets materialized view if needed
        -- This is done asynchronously to avoid blocking the main operation
        IF v_quote_tweets_affected THEN
            -- Use a background refresh to avoid blocking
            --PERFORM pg_notify('refresh_quote_tweets', 'needed');
            -- For immediate consistency, you could uncomment the next line:
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
    -- Get the user_id based on the provided username
    SELECT account_id INTO user_id
    FROM public.account
    WHERE username = username_;

    -- If the user_id is not found, return an empty result
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
        -- Base case: Select the initial tweet of the thread by the user
        SELECT tweets.tweet_id, c.conversation_id, tweets.reply_to_tweet_id,
               tweets.account_id,
               0 AS depth, tweets.favorite_count, tweets.retweet_count
        FROM tweets 
        LEFT JOIN conversations c ON tweets.tweet_id = c.tweet_id
        WHERE c.conversation_id = p_conversation_id
          AND tweets.reply_to_tweet_id IS NULL  -- This ensures we start with the first tweet in the thread
       
        UNION ALL
       
        -- Recursive case: Select direct replies by the same user to their own tweets in the main thread
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


COMMENT ON FUNCTION "public"."get_main_thread"("p_conversation_id" "text") IS 'Returns the main thread view for a given conversation_id';



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
    -- Get the user_id based on the provided username
    SELECT account_id INTO user_id
    FROM public.account
    WHERE username = username_;

    -- If the user_id is not found, return an empty result
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


CREATE OR REPLACE FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) RETURNS TABLE("account_id" "text", "created_via" "text", "username" "text", "created_at" timestamp with time zone, "account_display_name" "text", "avatar_media_url" "text", "bio" "text", "website" "text", "location" "text", "header_media_url" "text", "num_followers" integer, "num_tweets" integer)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.account_id,
        a.created_via,
        a.username,
        a.created_at,
        a.account_display_name,
        p.avatar_media_url,
        p.bio,
        p.website,
        p.location,
        p.header_media_url,
        a.num_followers,
        a.num_tweets
    FROM 
        public.account a
    LEFT JOIN 
        public.profile p ON a.account_id = p.account_id
    WHERE 
        p.archive_upload_id = (
            SELECT MAX(p2.archive_upload_id)
            FROM public.profile p2
            WHERE p2.account_id = a.account_id
        )
    ORDER BY 
        a.num_followers DESC
    LIMIT 
        limit_count;
END; 
$$;


ALTER FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_liked_users"() RETURNS TABLE("tweet_id" "text", "full_text" "text", "like_count" bigint, "reply_to_tweet_id" "text", "reply_to_user_id" "text", "reply_to_username" "text")
    LANGUAGE "plpgsql"
    SET "statement_timeout" TO '30min'
    AS $$
BEGIN
    -- Set the statement timeout to 5 minutes

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


CREATE OR REPLACE FUNCTION "public"."get_top_mentioned_users"("limit_" integer) RETURNS TABLE("user_id" "text", "name" "text", "screen_name" "text", "mention_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    WITH TopMentionedUsers AS (
        SELECT
            um.mentioned_user_id,
            COUNT(*) AS mention_count
        FROM
            public.user_mentions um
        WHERE
            um.mentioned_user_id <> '-1'
        GROUP BY
            um.mentioned_user_id
        ORDER BY
            mention_count DESC
        LIMIT
            limit_
    )
    SELECT
        t.mentioned_user_id as user_id,
        mu.name,
        mu.screen_name,
        t.mention_count
    FROM
        TopMentionedUsers t
        JOIN public.mentioned_users mu ON t.mentioned_user_id = mu.user_id
        LEFT JOIN public.profile u ON t.mentioned_user_id = u.account_id
    ORDER BY
        t.mention_count DESC;
END;
$$;


ALTER FUNCTION "public"."get_top_mentioned_users"("limit_" integer) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_tweet_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") RETURNS TABLE("tweet_date" timestamp without time zone, "tweet_count" bigint)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    RAISE NOTICE 'Executing get_tweet_counts_by_granularity with start_date %, end_date %, and granularity %', start_date, end_date, granularity;
    
    -- Updated to support minute and hour granularity
    IF granularity NOT IN ('minute', 'hour', 'day', 'week', 'month', 'year') THEN
        RAISE EXCEPTION 'Invalid granularity. Must be "minute", "hour", "day", "week", "month", or "year".';
    END IF;

    -- Fixed date range filtering to not add interval to end_date
    RETURN QUERY EXECUTE format('
    SELECT 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'') AS tweet_date, 
        COUNT(*) AS tweet_count 
    FROM 
        public.tweets 
    WHERE
        created_at >= $1
        AND created_at < $2
    GROUP BY 
        date_trunc(%L, created_at AT TIME ZONE ''UTC'')
    ORDER BY 
        tweet_date
    ', granularity, granularity)
    USING start_date, end_date;
END;
$_$;


ALTER FUNCTION "public"."get_tweet_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unique_scraper_count"("start_date" timestamp with time zone, "end_date" timestamp with time zone) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'private', 'public'
    AS $$
DECLARE
  scraper_count bigint;
BEGIN
  -- Count unique user_ids from private.tweet_user table, excluding 'system'
  SELECT COUNT(DISTINCT user_id)
  INTO scraper_count
  FROM private.tweet_user
  WHERE created_at >= start_date
    AND created_at < end_date
    AND user_id != 'system';
  
  RETURN COALESCE(scraper_count, 0);
END;
$$;


ALTER FUNCTION "public"."get_unique_scraper_count"("start_date" timestamp with time zone, "end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
INSERT INTO temp.account_%s (
    account_id, created_via, username, created_at, account_display_name,
    num_tweets, num_following, num_followers, num_likes
)
SELECT
$1->>''accountId'',
$1->>''createdVia'',
$1->>''username'',
($1->>''createdAt'')::TIMESTAMP WITH TIME ZONE,
$1->>''accountDisplayName'',
COALESCE(($1->>''num_tweets'')::INTEGER, 0),
COALESCE(($1->>''num_following'')::INTEGER, 0),
COALESCE(($1->>''num_followers'')::INTEGER, 0),
COALESCE(($1->>''num_likes'')::INTEGER, 0)
', p_suffix)
USING p_account;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_keep_private" boolean, "p_upload_likes" boolean, "p_start_date" "date", "p_end_date" "date", "p_suffix" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_id BIGINT;
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
        INSERT INTO temp.archive_upload_%s (
            account_id,
            archive_at,
            keep_private,
            upload_likes,
            start_date,
            end_date
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
    ', p_suffix)
    USING
        p_account_id,
        p_archive_at,
        p_keep_private,
        p_upload_likes,
        p_start_date,
        p_end_date
    INTO v_id;

    RETURN v_id;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_keep_private" boolean, "p_upload_likes" boolean, "p_start_date" "date", "p_end_date" "date", "p_suffix" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_keep_private" boolean, "p_upload_likes" boolean, "p_start_date" "date", "p_end_date" "date", "p_suffix" "text") IS 'Inserts upload options into temporary archive_upload table';



CREATE OR REPLACE FUNCTION "public"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
INSERT INTO temp.followers_%s (account_id, follower_account_id, archive_upload_id)
SELECT
$2,
(follower->''follower''->>''accountId'')::TEXT,
-1
FROM jsonb_array_elements($1) AS follower
', p_suffix)
USING p_followers, p_account_id;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
INSERT INTO temp.following_%s (account_id, following_account_id, archive_upload_id)
SELECT
$2,
(following->''following''->>''accountId'')::TEXT,
-1
FROM jsonb_array_elements($1) AS following
', p_suffix)
USING p_following, p_account_id;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
INSERT INTO temp.liked_tweets_%s (tweet_id, full_text)
SELECT
(likes->''like''->>''tweetId'')::TEXT,
(likes->''like''->>''fullText'')::TEXT
FROM jsonb_array_elements($1) AS likes
ON CONFLICT (tweet_id) DO NOTHING
', p_suffix) USING p_likes;
    EXECUTE format('
INSERT INTO temp.likes_%s (account_id, liked_tweet_id, archive_upload_id)
SELECT
$2,
(likes->''like''->>''tweetId'')::TEXT,
-1
FROM jsonb_array_elements($1) AS likes
ON CONFLICT (account_id, liked_tweet_id) DO NOTHING
', p_suffix) USING p_likes, p_account_id;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
INSERT INTO temp.profile_%s (bio, website, location, avatar_media_url, header_media_url, account_id, archive_upload_id)
SELECT
($1->''description''->>''bio'')::TEXT,
($1->''description''->>''website'')::TEXT,
($1->''description''->>''location'')::TEXT,
($1->>''avatarMediaUrl'')::TEXT,
($1->>''headerMediaUrl'')::TEXT,
$2,
-1
', p_suffix) USING p_profile, p_account_id;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
INSERT INTO temp.tweets_%s (
tweet_id, account_id, created_at, full_text, retweet_count, favorite_count,
reply_to_tweet_id, reply_to_user_id, reply_to_username, archive_upload_id
)
SELECT
(tweet->>''id_str'')::TEXT,
(tweet->>''user_id'')::TEXT,
(tweet->>''created_at'')::TIMESTAMP WITH TIME ZONE,
(tweet->>''full_text'')::TEXT,
(tweet->>''retweet_count'')::INTEGER,
(tweet->>''favorite_count'')::INTEGER,
(tweet->>''in_reply_to_status_id_str'')::TEXT,
(tweet->>''in_reply_to_user_id_str'')::TEXT,
(tweet->>''in_reply_to_screen_name'')::TEXT,
-1
FROM jsonb_array_elements($1) AS tweet
', p_suffix) USING p_tweets;
END;
$_$;


ALTER FUNCTION "public"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    v_provider_id TEXT;
BEGIN
    -- Get provider_id from JWT
    SELECT ((auth.jwt()->'app_metadata'->>'provider_id')::text) INTO v_provider_id;
    
    -- Verify the JWT provider_id matches the suffix
    IF current_user NOT IN ('postgres', 'service_role') AND (v_provider_id IS NULL OR v_provider_id != p_suffix) THEN

        RAISE EXCEPTION 'Unauthorized: provider_id % does not match account_id %', v_provider_id, p_suffix;
    END IF;

    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Insert mentioned users
    EXECUTE format('
INSERT INTO temp.mentioned_users_%s (user_id, name, screen_name, updated_at)
SELECT DISTINCT
(mentioned_user->>''id_str'')::TEXT,
(mentioned_user->>''name'')::TEXT,
(mentioned_user->>''screen_name'')::TEXT,
NOW()
FROM jsonb_array_elements($1) AS tweet,
jsonb_array_elements(tweet->''entities''->''user_mentions'') AS mentioned_user
', p_suffix) USING p_tweets;
    -- Insert user mentions
    EXECUTE format('
INSERT INTO temp.user_mentions_%s (mentioned_user_id, tweet_id)
SELECT
(mentioned_user->>''id_str'')::TEXT,
(tweet->>''id_str'')::TEXT
FROM jsonb_array_elements($1) AS tweet,
jsonb_array_elements(tweet->''entities''->''user_mentions'') AS mentioned_user
', p_suffix) USING p_tweets;
    -- Insert tweet media
    EXECUTE format('
INSERT INTO temp.tweet_media_%s (media_id, tweet_id, media_url, media_type, width, height, archive_upload_id)
SELECT
(media->>''id_str'')::BIGINT,
(tweet->>''id_str'')::TEXT,
(media->>''media_url_https'')::TEXT,
(media->>''type'')::TEXT,
(media->''sizes''->''large''->>''w'')::INTEGER,
(media->''sizes''->''large''->>''h'')::INTEGER,
-1
FROM jsonb_array_elements($1) AS tweet,
jsonb_array_elements(tweet->''entities''->''media'') AS media
', p_suffix) USING p_tweets;
    -- Insert tweet URLs
    EXECUTE format('
INSERT INTO temp.tweet_urls_%s (url, expanded_url, display_url, tweet_id)
SELECT
(url->>''url'')::TEXT,
(url->>''expanded_url'')::TEXT,
(url->>''display_url'')::TEXT,
(tweet->>''id_str'')::TEXT
FROM jsonb_array_elements($1) AS tweet,
jsonb_array_elements(tweet->''entities''->''urls'') AS url
', p_suffix) USING p_tweets;
END;
$_$;


ALTER FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_archive"("archive_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '10min'
    AS $$
  DECLARE
      v_account_id TEXT;
      v_suffix TEXT;
      v_archive_upload_id BIGINT;
      v_latest_tweet_date TIMESTAMP WITH TIME ZONE;
      v_prepared_tweets JSONB;
      v_user_id UUID;
  BEGIN
      -- Check if the user is authenticated or is the postgres role
      v_user_id := auth.uid();
      IF v_user_id IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

      -- Get the account_id from the archive data
      v_account_id := (archive_data->'account'->0->'account'->>'accountId')::TEXT;

      -- Check if the authenticated user has permission to process this archive
      IF v_suffix != (auth.jwt() -> 'app_metadata' ->> 'provider_id') AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authorized to process this archive';
      END IF;

      -- v_suffix := (archive_data->'account'->0->'account'->>'username')::TEXT;
      v_suffix := v_account_id;
      
      v_prepared_tweets := (
          SELECT jsonb_agg(
              jsonb_set(
                  tweet->'tweet', 
                  '{user_id}', 
                  to_jsonb(v_account_id)
              )
          )
          FROM jsonb_array_elements(archive_data->'tweets') AS tweet
      );

      SELECT MAX((tweet->>'created_at')::TIMESTAMP WITH TIME ZONE) INTO v_latest_tweet_date 
      FROM jsonb_array_elements(v_prepared_tweets) AS tweet;
      
      -- Create temporary tables
      PERFORM public.create_temp_tables(v_suffix);

      -- Insert into temporary account table
      PERFORM public.insert_temp_account(archive_data->'account'->0->'account', v_suffix);
      
      -- Insert into temporary archive_upload table
      SELECT public.insert_temp_archive_upload(v_account_id, v_latest_tweet_date, v_suffix) INTO v_archive_upload_id;

      -- Insert into temporary profiles table
      PERFORM public.insert_temp_profiles(
        archive_data->'profile'->0->'profile',
        v_account_id,
        v_suffix
      );

      -- Insert tweets data
      PERFORM public.insert_temp_tweets(v_prepared_tweets, v_suffix);

      -- Process tweet entities and insert related data
      PERFORM public.process_and_insert_tweet_entities(v_prepared_tweets, v_suffix);

      -- Insert followers data
      PERFORM public.insert_temp_followers(
          archive_data->'follower',
          v_account_id,
          v_suffix
      );

      -- Insert following data
      PERFORM public.insert_temp_following(
          archive_data->'following',
          v_account_id,
          v_suffix
      );

      -- Insert likes data
      PERFORM public.insert_temp_likes(
          archive_data->'like',
          v_account_id,
          v_suffix
      );

      -- Commit to public tables
      PERFORM public.commit_temp_data(v_suffix);
  END;
  $$;


ALTER FUNCTION "public"."process_archive"("archive_data" "jsonb") OWNER TO "postgres";


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
        FROM public.account AS a
        WHERE LOWER(a.username) = LOWER(from_user);

        -- Return empty if from_user not found
        IF from_account_id IS NULL THEN
            RETURN;
        END IF;
    END IF;

    -- Get account_id for to_user
    IF to_user IS NOT NULL THEN
        SELECT a.account_id INTO to_account_id
        FROM public.account AS a
        WHERE LOWER(a.username) = LOWER(to_user);

        -- Return empty if to_user not found
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
$$;


ALTER FUNCTION "public"."search_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "limit_" integer, "offset_" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_meta_data"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.raw_app_meta_data = jsonb_set(
        jsonb_set(
            COALESCE(NEW.raw_app_meta_data::jsonb, '{}'::jsonb),
            '{user_name}',
            NEW.raw_user_meta_data::jsonb->'user_name'
        ),
        '{provider_id}',
        NEW.raw_user_meta_data::jsonb->'provider_id'
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_meta_data"() OWNER TO "postgres";


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
                --AND tc.table_name != 'archive_upload'  -- Skip archive_upload table
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


CREATE OR REPLACE FUNCTION "public"."update_optin_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Track opt-in/opt-out timestamps
    IF OLD.opted_in = false AND NEW.opted_in = true THEN
        NEW.opted_in_at = NOW();
        NEW.opted_out_at = NULL;
    ELSIF OLD.opted_in = true AND NEW.opted_in = false THEN
        NEW.opted_out_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_optin_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
   BEGIN
       NEW.updated_at = CURRENT_TIMESTAMP;
       RETURN NEW;
   END;
   $$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


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
        t.fts @@ to_tsquery(replace(search_word, ' ', '+'))  -- Full-text search
        AND (t.created_at BETWEEN start_date AND end_date OR start_date IS NULL OR end_date IS NULL)  -- Date range filtering
        AND (t.account_id = ANY(user_ids) OR user_ids IS NULL)  -- User filtering
    GROUP BY
        month
    ORDER BY
        month;
END;$$;


ALTER FUNCTION "public"."word_occurrences"("search_word" "text", "start_date" timestamp with time zone, "end_date" timestamp with time zone, "user_ids" "text"[]) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "tes"."get_tweet_counts_by_date"() RETURNS TABLE("tweet_date" "date", "tweet_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    -- Get the current user's account_id
    v_account_id := tes.get_current_account_id();

    RETURN QUERY
    SELECT 
        DATE(created_at) AS tweet_date,
        COUNT(*) AS tweet_count
    FROM 
        public.tweets
    WHERE 
        account_id = v_account_id
    GROUP BY 
        DATE(created_at)
    ORDER BY 
        tweet_date;
END;
$$;


ALTER FUNCTION "tes"."get_tweet_counts_by_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."get_tweets_on_this_day"("p_limit" integer DEFAULT NULL::integer) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "reply_to_user_id" "text", "reply_to_username" "text", "username" "text", "account_display_name" "text", "avatar_media_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_month INTEGER;
    current_day INTEGER;
    v_account_id TEXT;
BEGIN
    -- Get the current user's account_id
    v_account_id := tes.get_current_account_id();

    -- Get the current month and day
    SELECT EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(DAY FROM CURRENT_DATE)
    INTO current_month, current_day;

    RETURN QUERY
    SELECT 
        t.tweet_id, t.account_id, t.created_at, t.full_text, t.retweet_count,
        t.favorite_count, t.reply_to_tweet_id, t.reply_to_user_id, t.reply_to_username,
        a.username, a.account_display_name, p.avatar_media_url
    FROM 
        public.tweets t
        inner join account a on t.account_id = a.account_id
        inner join profile p on t.account_id = p.account_id
    WHERE 
        EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'UTC') = current_month
        AND EXTRACT(DAY FROM t.created_at AT TIME ZONE 'UTC') = current_day
        AND EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'UTC') < EXTRACT(YEAR FROM CURRENT_DATE)
        AND t.account_id = v_account_id
    ORDER BY 
        t.favorite_count DESC, t.retweet_count DESC
    LIMIT p_limit;
END;
$$;


ALTER FUNCTION "tes"."get_tweets_on_this_day"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."get_user_intercepted_stats"("days_back" integer DEFAULT 30) RETURNS TABLE("date" "date", "type" "text", "count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
    current_user_id text;
begin
    -- Get the current authenticated user's account_id
    SELECT auth.jwt() -> 'user_metadata' ->> 'sub' into current_user_id ;
    
    -- Verify user is authenticated
    if current_user_id is null then
        raise exception 'User must be authenticated';
    end if;
    
    -- Return data only for the authenticated user within the specified date range
    return query
    select 
        uis.date,
        uis.type,
        uis.count
    from private.user_intercepted_stats uis
    where uis.user_id = current_user_id
      and uis.date >= current_date - interval '1 day' * days_back
    order by uis.date desc, uis.type;
end;
$$;


ALTER FUNCTION "tes"."get_user_intercepted_stats"("days_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."hash_user_id"("user_id" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Convert the input to text if not already, hash it using SHA-256,
    -- and return as a hex string
    RETURN encode(digest(user_id::text, 'sha256'), 'hex');
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error hashing user_id: %', SQLERRM;
END;
$$;


ALTER FUNCTION "tes"."hash_user_id"("user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."search_liked_tweets"("search_query" "text", "from_user" "text" DEFAULT NULL::"text", "to_user" "text" DEFAULT NULL::"text", "since_date" "date" DEFAULT NULL::"date", "until_date" "date" DEFAULT NULL::"date", "min_likes" integer DEFAULT 0, "min_retweets" integer DEFAULT 0, "max_likes" integer DEFAULT 100000000, "max_retweets" integer DEFAULT 100000000, "limit_" integer DEFAULT 50) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "avatar_media_url" "text", "archive_upload_id" bigint, "username" "text", "account_display_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  from_account_id TEXT;
  to_account_id TEXT;
  v_account_id TEXT;
BEGIN
  -- Get the current user's account_id
  v_account_id := tes.get_current_account_id();

  -- Get account_id for from_user
  IF from_user IS NOT NULL THEN
    SELECT a.account_id INTO from_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(from_user);
    
    -- Return empty if from_user not found
    IF from_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  -- Get account_id for to_user
  IF to_user IS NOT NULL THEN
    SELECT a.account_id INTO to_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(to_user);
    
    -- Return empty if to_user not found
    IF to_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH combined_tweets AS (
    SELECT 
      COALESCE(t.tweet_id,lt.tweet_id) as tweet_id,
      t.account_id,
      t.created_at,
      COALESCE(t.full_text, lt.full_text) as full_text,
      t.retweet_count,
      t.favorite_count,
      t.reply_to_user_id,
      t.reply_to_tweet_id,
      COALESCE(t.fts, lt.fts) as fts
    FROM (
      SELECT lt.tweet_id, lt.full_text, lt.fts
      FROM liked_tweets lt
      left JOIN likes l ON lt.tweet_id = l.liked_tweet_id 
      WHERE l.account_id = v_account_id
    ) lt
    LEFT JOIN tweets t ON lt.tweet_id = t.tweet_id
  ),
  matching_tweets AS (
    SELECT ct.tweet_id,ct.full_text
    FROM combined_tweets ct
    WHERE (search_query = '' OR ct.fts @@ websearch_to_tsquery('english', search_query))
      AND (from_account_id IS NULL OR ct.account_id = from_account_id)
      AND (to_account_id IS NULL OR ct.reply_to_user_id = to_account_id)
      AND (since_date IS NULL OR ct.created_at >= since_date OR ct.created_at IS NULL)
      AND (until_date IS NULL OR ct.created_at <= until_date OR ct.created_at IS NULL)
      AND (min_likes IS NULL OR ct.favorite_count >= min_likes OR ct.favorite_count IS NULL)
      AND (max_likes IS NULL OR ct.favorite_count <= max_likes OR ct.favorite_count IS NULL)
      AND (min_retweets IS NULL OR ct.retweet_count >= min_retweets OR ct.retweet_count IS NULL)
      AND (max_retweets IS NULL OR ct.retweet_count <= max_retweets OR ct.retweet_count IS NULL)
    ORDER BY COALESCE(ct.created_at, '2099-12-31'::timestamp) DESC
    LIMIT limit_
  )
  SELECT 
    COALESCE (mt.tweet_id,t.tweet_id), 
    t.account_id, 
    t.created_at, 
    COALESCE (mt.full_text,t.full_text), 
    t.retweet_count, 
    t.favorite_count,
    t.reply_to_tweet_id,
    p.avatar_media_url,
    p.archive_upload_id,
    a.username,
    a.account_display_name
  FROM matching_tweets mt
  LEFT JOIN tweets t ON mt.tweet_id = t.tweet_id
  LEFT JOIN account a ON t.account_id = a.account_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(p.avatar_media_url,'none.com') as avatar_media_url, p.archive_upload_id
    FROM profile as p
    WHERE p.account_id = t.account_id
    ORDER BY p.archive_upload_id DESC
    LIMIT 1
  ) p ON true
  ORDER BY t.created_at DESC;
END;
$$;


ALTER FUNCTION "tes"."search_liked_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "min_likes" integer, "min_retweets" integer, "max_likes" integer, "max_retweets" integer, "limit_" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tes"."search_tweets"("search_query" "text", "from_user" "text" DEFAULT NULL::"text", "to_user" "text" DEFAULT NULL::"text", "since_date" "date" DEFAULT NULL::"date", "until_date" "date" DEFAULT NULL::"date", "min_likes" integer DEFAULT 0, "min_retweets" integer DEFAULT 0, "max_likes" integer DEFAULT 100000000, "max_retweets" integer DEFAULT 100000000, "limit_" integer DEFAULT 50) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "avatar_media_url" "text", "archive_upload_id" bigint, "username" "text", "account_display_name" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  from_account_id TEXT;
  to_account_id TEXT;
BEGIN
  -- Get account_id for from_user
  IF from_user IS NOT NULL THEN
    SELECT a.account_id INTO from_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(from_user);
    
    -- Return empty if from_user not found
    IF from_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  -- Get account_id for to_user
  IF to_user IS NOT NULL THEN
    SELECT a.account_id INTO to_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(to_user);
    
    -- Return empty if to_user not found
    IF to_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH matching_tweets AS (
    SELECT t.tweet_id
    FROM tweets t
    WHERE (search_query = '' OR t.fts @@ websearch_to_tsquery('english', search_query))
      AND (from_account_id IS NULL OR t.account_id = from_account_id)
      AND (to_account_id IS NULL OR t.reply_to_user_id = to_account_id)
      AND (since_date IS NULL OR t.created_at >= since_date)
      AND (until_date IS NULL OR t.created_at <= until_date)
      AND (min_likes IS NULL OR t.favorite_count >= min_likes)
      AND (max_likes IS NULL OR t.favorite_count <= max_likes)
      AND (min_retweets IS NULL OR t.retweet_count >= min_retweets)
      AND (max_retweets IS NULL OR t.retweet_count <= max_retweets)
      --temporary change due to circle tweets
      AND (t.created_at < '2022-08-01'::DATE OR t.created_at > '2023-11-30'::DATE)  
    ORDER BY t.created_at DESC
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
    p.archive_upload_id,
    a.username,
    a.account_display_name
  FROM matching_tweets mt
  JOIN tweets t ON mt.tweet_id = t.tweet_id
  JOIN account a ON t.account_id = a.account_id
  LEFT JOIN LATERAL (
    SELECT p.avatar_media_url, p.archive_upload_id
    FROM profile as p
    WHERE p.account_id = t.account_id
    ORDER BY p.archive_upload_id DESC
    LIMIT 1
  ) p ON true
  ORDER BY t.created_at DESC;
END;
$$;


ALTER FUNCTION "tes"."search_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "min_likes" integer, "min_retweets" integer, "max_likes" integer, "max_retweets" integer, "limit_" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "ca_website"."scraping_stats" (
    "period_type" "text" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "tweet_count" bigint DEFAULT 0 NOT NULL,
    "unique_scrapers" integer DEFAULT 0 NOT NULL,
    "last_updated" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_complete" boolean DEFAULT false NOT NULL,
    CONSTRAINT "scraping_stats_period_type_check" CHECK (("period_type" = ANY (ARRAY['hour'::"text", 'day'::"text", 'week'::"text", 'month'::"text"])))
);


ALTER TABLE "ca_website"."scraping_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."archived_temporary_data" (
    "type" character varying(255) NOT NULL,
    "item_id" character varying(255) NOT NULL,
    "originator_id" character varying(255) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data" "jsonb" NOT NULL,
    "user_id" character varying(255) DEFAULT 'anon'::character varying NOT NULL,
    "inserted" timestamp with time zone,
    "stored" boolean DEFAULT false,
    "id" integer NOT NULL
);


ALTER TABLE "private"."archived_temporary_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."daily_pg_stat_statements" (
    "id" integer NOT NULL,
    "snapshot_time" timestamp without time zone DEFAULT "now"(),
    "userid" "oid",
    "dbid" "oid",
    "toplevel" boolean,
    "queryid" bigint,
    "query" "text",
    "plans" bigint,
    "total_plan_time" double precision,
    "min_plan_time" double precision,
    "max_plan_time" double precision,
    "mean_plan_time" double precision,
    "stddev_plan_time" double precision,
    "calls" bigint,
    "total_exec_time" double precision,
    "min_exec_time" double precision,
    "max_exec_time" double precision,
    "mean_exec_time" double precision,
    "stddev_exec_time" double precision,
    "rows" bigint,
    "shared_blks_hit" bigint,
    "shared_blks_read" bigint,
    "shared_blks_dirtied" bigint,
    "shared_blks_written" bigint,
    "local_blks_hit" bigint,
    "local_blks_read" bigint,
    "local_blks_dirtied" bigint,
    "local_blks_written" bigint,
    "temp_blks_read" bigint,
    "temp_blks_written" bigint,
    "blk_read_time" double precision,
    "blk_write_time" double precision,
    "temp_blk_read_time" double precision,
    "temp_blk_write_time" double precision,
    "wal_records" bigint,
    "wal_fpi" bigint,
    "wal_bytes" numeric,
    "jit_functions" bigint,
    "jit_generation_time" double precision,
    "jit_inlining_count" bigint,
    "jit_inlining_time" double precision,
    "jit_optimization_count" bigint,
    "jit_optimization_time" double precision,
    "jit_emission_count" bigint,
    "jit_emission_time" double precision
);


ALTER TABLE "private"."daily_pg_stat_statements" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "private"."daily_pg_stat_statements_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "private"."daily_pg_stat_statements_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."daily_pg_stat_statements_id_seq" OWNED BY "private"."daily_pg_stat_statements"."id";



CREATE TABLE IF NOT EXISTS "private"."import_errors" (
    "id" integer NOT NULL,
    "type" "text" NOT NULL,
    "originator_id" "text" NOT NULL,
    "item_id" "text" NOT NULL,
    "error_message" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "private"."import_errors" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "private"."import_errors_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "private"."import_errors_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."import_errors_id_seq" OWNED BY "private"."import_errors"."id";



CREATE TABLE IF NOT EXISTS "private"."job_queue" (
    "key" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_name" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "status" "text",
    "args" "jsonb",
    CONSTRAINT "job_queue_status_check" CHECK (("status" = ANY (ARRAY['QUEUED'::"text", 'PROCESSING'::"text", 'DONE'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "private"."job_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."logs" (
    "log_id" integer NOT NULL,
    "log_timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error_type" "text",
    "error_message" "text",
    "error_code" "text",
    "context" "jsonb"
);


ALTER TABLE "private"."logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "private"."logs_log_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "private"."logs_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."logs_log_id_seq" OWNED BY "private"."logs"."log_id";



CREATE TABLE IF NOT EXISTS "private"."materialized_view_refresh_logs" (
    "view_name" "text" NOT NULL,
    "refresh_started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "refresh_completed_at" timestamp with time zone,
    "duration_ms" bigint
);


ALTER TABLE "private"."materialized_view_refresh_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."tweet_user" (
    "tweet_id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "private"."tweet_user" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."user_intercepted_stats" (
    "user_id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "count" integer NOT NULL
);


ALTER TABLE "private"."user_intercepted_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."all_account" (
    "account_id" "text" NOT NULL,
    "created_via" "text" NOT NULL,
    "username" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "account_display_name" "text" NOT NULL,
    "num_tweets" integer DEFAULT 0,
    "num_following" integer DEFAULT 0,
    "num_followers" integer DEFAULT 0,
    "num_likes" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."all_account" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."archive_upload" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "archive_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "keep_private" boolean DEFAULT false,
    "upload_likes" boolean DEFAULT true,
    "start_date" "date",
    "end_date" "date",
    "upload_phase" "public"."upload_phase_enum" DEFAULT 'uploading'::"public"."upload_phase_enum"
);


ALTER TABLE "public"."archive_upload" OWNER TO "postgres";


COMMENT ON TABLE "public"."archive_upload" IS 'Stores upload options for each archive upload';



CREATE OR REPLACE VIEW "public"."account" AS
 SELECT "a"."account_id",
    "a"."created_via",
    "a"."username",
    "a"."created_at",
    "a"."account_display_name",
    "a"."num_tweets",
    "a"."num_following",
    "a"."num_followers",
    "a"."num_likes"
   FROM ("public"."all_account" "a"
     JOIN "public"."archive_upload" "au" ON ((("a"."account_id" = "au"."account_id") AND ("au"."id" = ( SELECT "max"("archive_upload"."id") AS "max"
           FROM "public"."archive_upload"
          WHERE (("archive_upload"."account_id" = "a"."account_id") AND ("archive_upload"."upload_phase" = 'completed'::"public"."upload_phase_enum")))))));


ALTER TABLE "public"."account" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."likes" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "liked_tweet_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mentioned_users" (
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "screen_name" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."mentioned_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tweets" (
    "tweet_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "full_text" "text" NOT NULL,
    "retweet_count" integer NOT NULL,
    "favorite_count" integer NOT NULL,
    "reply_to_tweet_id" "text",
    "reply_to_user_id" "text",
    "reply_to_username" "text",
    "archive_upload_id" bigint,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.10', "autovacuum_analyze_scale_factor"='0.05', "fillfactor"='90');


ALTER TABLE "public"."tweets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_mentions" (
    "id" bigint NOT NULL,
    "mentioned_user_id" "text" NOT NULL,
    "tweet_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."user_mentions" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."account_activity_summary" AS
 WITH "account_mentions" AS (
         SELECT "t"."account_id",
            "um"."mentioned_user_id",
            "count"(*) AS "mention_count"
           FROM ("public"."tweets" "t"
             JOIN "public"."user_mentions" "um" ON (("t"."tweet_id" = "um"."tweet_id")))
          GROUP BY "t"."account_id", "um"."mentioned_user_id"
        ), "ranked_tweets" AS (
         SELECT "tweets"."tweet_id",
            "tweets"."account_id",
            "tweets"."created_at",
            "tweets"."full_text",
            "tweets"."retweet_count",
            "tweets"."favorite_count",
            "tweets"."reply_to_tweet_id",
            "tweets"."reply_to_user_id",
            "tweets"."reply_to_username",
            "tweets"."archive_upload_id",
            "tweets"."fts",
            "tweets"."updated_at",
            "row_number"() OVER (PARTITION BY "tweets"."account_id" ORDER BY ("tweets"."retweet_count" + "tweets"."favorite_count") DESC) AS "engagement_rank"
           FROM "public"."tweets"
        ), "top_tweets" AS (
         SELECT "ranked_tweets"."account_id",
            "json_agg"("json_build_object"('tweet_id', "ranked_tweets"."tweet_id", 'account_id', "ranked_tweets"."account_id", 'created_at', "ranked_tweets"."created_at", 'full_text', "ranked_tweets"."full_text", 'retweet_count', "ranked_tweets"."retweet_count", 'favorite_count', "ranked_tweets"."favorite_count", 'reply_to_tweet_id', "ranked_tweets"."reply_to_tweet_id", 'reply_to_user_id', "ranked_tweets"."reply_to_user_id", 'reply_to_username', "ranked_tweets"."reply_to_username", 'archive_upload_id', "ranked_tweets"."archive_upload_id", 'engagement_score', ("ranked_tweets"."retweet_count" + "ranked_tweets"."favorite_count"))) FILTER (WHERE ("ranked_tweets"."engagement_rank" <= 100)) AS "top_engaged_tweets"
           FROM "ranked_tweets"
          GROUP BY "ranked_tweets"."account_id"
        ), "mentioned_accounts" AS (
         SELECT "am"."account_id",
            "json_agg"("json_build_object"('user_id', "am"."mentioned_user_id", 'name', "mu"."name", 'screen_name', "mu"."screen_name", 'mention_count', "am"."mention_count") ORDER BY "am"."mention_count" DESC) FILTER (WHERE (("am"."mention_count" > 0) AND ("am"."mention_rank" <= 20))) AS "mentioned_accounts"
           FROM (( SELECT "account_mentions"."account_id",
                    "account_mentions"."mentioned_user_id",
                    "account_mentions"."mention_count",
                    "row_number"() OVER (PARTITION BY "account_mentions"."account_id" ORDER BY "account_mentions"."mention_count" DESC) AS "mention_rank"
                   FROM "account_mentions") "am"
             LEFT JOIN "public"."mentioned_users" "mu" ON (("mu"."user_id" = "am"."mentioned_user_id")))
          GROUP BY "am"."account_id"
        )
 SELECT "a"."account_id",
    "a"."username",
    "a"."num_tweets",
    "a"."num_followers",
    COALESCE(( SELECT "count"(*) AS "count"
           FROM "public"."likes" "l"
          WHERE ("l"."account_id" = "a"."account_id")), (0)::bigint) AS "total_likes",
    COALESCE(( SELECT "count"(*) AS "count"
           FROM ("public"."user_mentions" "um"
             JOIN "public"."tweets" "t" ON (("um"."tweet_id" = "t"."tweet_id")))
          WHERE ("t"."account_id" = "a"."account_id")), (0)::bigint) AS "total_mentions",
    COALESCE("ma"."mentioned_accounts", '[]'::"json") AS "mentioned_accounts",
    COALESCE("tt"."top_engaged_tweets", '[]'::"json") AS "most_favorited_tweets",
    COALESCE("tt"."top_engaged_tweets", '[]'::"json") AS "most_retweeted_tweets",
    COALESCE("tt"."top_engaged_tweets", '[]'::"json") AS "top_engaged_tweets",
    CURRENT_TIMESTAMP AS "last_updated"
   FROM (("public"."account" "a"
     LEFT JOIN "mentioned_accounts" "ma" ON (("ma"."account_id" = "a"."account_id")))
     LEFT JOIN "top_tweets" "tt" ON (("tt"."account_id" = "a"."account_id")))
  WITH NO DATA;


ALTER TABLE "public"."account_activity_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."all_profile" (
    "account_id" "text" NOT NULL,
    "bio" "text",
    "website" "text",
    "location" "text",
    "avatar_media_url" "text",
    "header_media_url" "text",
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."all_profile" OWNER TO "postgres";


ALTER TABLE "public"."archive_upload" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."archive_upload_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "tweet_id" "text" NOT NULL,
    "conversation_id" "text"
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tweet_urls" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "expanded_url" "text",
    "display_url" "text" NOT NULL,
    "tweet_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."tweet_urls" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."quote_tweets" AS
 SELECT "t"."tweet_id",
    "substring"("tu"."expanded_url", 'status/([0-9]+)'::"text") AS "quoted_tweet_id",
    "substring"("tu"."expanded_url", 'https?://(?:www\.)?twitter\.com/([^/]+)/status/'::"text") AS "quoted_tweet_username"
   FROM ("public"."tweet_urls" "tu"
     JOIN "public"."tweets" "t" ON (("tu"."tweet_id" = "t"."tweet_id")))
  WHERE (("tu"."expanded_url" ~~ 'https://twitter.com/%/status/%'::"text") OR ("tu"."expanded_url" ~~ 'https://x.com/%/status/%'::"text"));


ALTER TABLE "public"."quote_tweets" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."enriched_tweets" AS
 SELECT "t"."tweet_id",
    "t"."account_id",
    "a"."username",
    "a"."account_display_name",
    "t"."created_at",
    "t"."full_text",
    "t"."retweet_count",
    "t"."favorite_count",
    "t"."reply_to_tweet_id",
    "t"."reply_to_user_id",
    "t"."reply_to_username",
    "qt"."quoted_tweet_id",
    "c"."conversation_id",
    "p"."avatar_media_url",
    "t"."archive_upload_id"
   FROM (((("public"."tweets" "t"
     JOIN "public"."all_account" "a" ON (("t"."account_id" = "a"."account_id")))
     LEFT JOIN "public"."conversations" "c" ON (("t"."tweet_id" = "c"."tweet_id")))
     LEFT JOIN "public"."quote_tweets" "qt" ON (("t"."tweet_id" = "qt"."tweet_id")))
     LEFT JOIN LATERAL ( SELECT "all_profile"."avatar_media_url"
           FROM "public"."all_profile"
          WHERE ("all_profile"."account_id" = "t"."account_id")
          ORDER BY "all_profile"."archive_upload_id" DESC
         LIMIT 1) "p" ON (true));


ALTER TABLE "public"."enriched_tweets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."followers" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "follower_account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."followers" OWNER TO "postgres";


ALTER TABLE "public"."followers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."followers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."following" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "following_account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.05');


ALTER TABLE "public"."following" OWNER TO "postgres";


ALTER TABLE "public"."following" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."following_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE MATERIALIZED VIEW "public"."global_activity_summary" AS
 SELECT ( SELECT "count"(*) AS "count"
           FROM "public"."account") AS "total_accounts",
    ( SELECT ("c"."reltuples")::bigint AS "estimate"
           FROM ("pg_class" "c"
             JOIN "pg_namespace" "n" ON (("n"."oid" = "c"."relnamespace")))
          WHERE (("c"."relname" = 'tweets'::"name") AND ("n"."nspname" = 'public'::"name"))) AS "total_tweets",
    ( SELECT ("c"."reltuples")::bigint AS "estimate"
           FROM ("pg_class" "c"
             JOIN "pg_namespace" "n" ON (("n"."oid" = "c"."relnamespace")))
          WHERE (("c"."relname" = 'liked_tweets'::"name") AND ("n"."nspname" = 'public'::"name"))) AS "total_likes",
    ( SELECT ("c"."reltuples")::bigint AS "estimate"
           FROM ("pg_class" "c"
             JOIN "pg_namespace" "n" ON (("n"."oid" = "c"."relnamespace")))
          WHERE (("c"."relname" = 'user_mentions'::"name") AND ("n"."nspname" = 'public'::"name"))) AS "total_user_mentions",
    ( SELECT "json_agg"("row_to_json"("t".*)) AS "json_agg"
           FROM ( SELECT "get_top_mentioned_users"."user_id",
                    "get_top_mentioned_users"."name",
                    "get_top_mentioned_users"."screen_name",
                    "get_top_mentioned_users"."mention_count"
                   FROM "public"."get_top_mentioned_users"(30) "get_top_mentioned_users"("user_id", "name", "screen_name", "mention_count")) "t") AS "top_mentioned_users",
    ( SELECT "json_agg"("row_to_json"("t".*)) AS "json_agg"
           FROM ( SELECT "get_top_accounts_with_followers"."account_id",
                    "get_top_accounts_with_followers"."created_via",
                    "get_top_accounts_with_followers"."username",
                    "get_top_accounts_with_followers"."created_at",
                    "get_top_accounts_with_followers"."account_display_name",
                    "get_top_accounts_with_followers"."avatar_media_url",
                    "get_top_accounts_with_followers"."bio",
                    "get_top_accounts_with_followers"."website",
                    "get_top_accounts_with_followers"."location",
                    "get_top_accounts_with_followers"."header_media_url",
                    "get_top_accounts_with_followers"."num_followers",
                    "get_top_accounts_with_followers"."num_tweets"
                   FROM "public"."get_top_accounts_with_followers"(10) "get_top_accounts_with_followers"("account_id", "created_via", "username", "created_at", "account_display_name", "avatar_media_url", "bio", "website", "location", "header_media_url", "num_followers", "num_tweets")) "t") AS "top_accounts_with_followers",
    CURRENT_TIMESTAMP AS "last_updated"
  WITH NO DATA;


ALTER TABLE "public"."global_activity_summary" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."monthly_tweet_counts_mv" AS
 SELECT "date_trunc"('month'::"text", "tweets"."created_at") AS "month",
    "tweets"."account_id",
    "count"(*) AS "tweet_count",
    "count"(DISTINCT "date"("tweets"."created_at")) AS "days_active",
    ("avg"("tweets"."favorite_count"))::numeric(10,2) AS "avg_favorites",
    ("avg"("tweets"."retweet_count"))::numeric(10,2) AS "avg_retweets",
    "max"("tweets"."favorite_count") AS "max_favorites",
    "max"("tweets"."retweet_count") AS "max_retweets"
   FROM "public"."tweets"
  WHERE ("tweets"."created_at" IS NOT NULL)
  GROUP BY ("date_trunc"('month'::"text", "tweets"."created_at")), "tweets"."account_id"
  WITH NO DATA;


ALTER TABLE "public"."monthly_tweet_counts_mv" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."global_monthly_tweet_counts" AS
 SELECT "monthly_tweet_counts_mv"."month",
    "sum"("monthly_tweet_counts_mv"."tweet_count") AS "total_tweets",
    "count"(DISTINCT "monthly_tweet_counts_mv"."account_id") AS "active_accounts",
    ("avg"("monthly_tweet_counts_mv"."tweet_count"))::numeric(10,2) AS "avg_tweets_per_account"
   FROM "public"."monthly_tweet_counts_mv"
  GROUP BY "monthly_tweet_counts_mv"."month"
  ORDER BY "monthly_tweet_counts_mv"."month" DESC;


ALTER TABLE "public"."global_monthly_tweet_counts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."liked_tweets" (
    "tweet_id" "text" NOT NULL,
    "full_text" "text" NOT NULL,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED
);


ALTER TABLE "public"."liked_tweets" OWNER TO "postgres";


ALTER TABLE "public"."likes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."likes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."optin" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "twitter_user_id" "text",
    "opted_in" boolean DEFAULT false NOT NULL,
    "terms_version" "text" DEFAULT 'v1.0'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "opted_in_at" timestamp with time zone,
    "opted_out_at" timestamp with time zone
);


ALTER TABLE "public"."optin" OWNER TO "postgres";


COMMENT ON TABLE "public"."optin" IS 'Stores user consent for tweet streaming to the community archive';



COMMENT ON COLUMN "public"."optin"."opted_in" IS 'Current opt-in status for tweet streaming';



COMMENT ON COLUMN "public"."optin"."terms_version" IS 'Version of terms and conditions the user agreed to';



CREATE OR REPLACE VIEW "public"."profile" AS
 SELECT "p"."account_id",
    "p"."bio",
    "p"."website",
    "p"."location",
    "p"."avatar_media_url",
    "p"."header_media_url",
    "p"."archive_upload_id"
   FROM ("public"."all_profile" "p"
     JOIN "public"."archive_upload" "au" ON ((("p"."account_id" = "au"."account_id") AND ("au"."id" = ( SELECT "max"("archive_upload"."id") AS "max"
           FROM "public"."archive_upload"
          WHERE ("archive_upload"."account_id" = "p"."account_id"))))));


ALTER TABLE "public"."profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scraper_count" (
    "count" bigint
);


ALTER TABLE "public"."scraper_count" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tweet_media" (
    "media_id" bigint NOT NULL,
    "tweet_id" "text" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."tweet_media" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."tweet_replies_view" AS
 SELECT "tweets"."reply_to_tweet_id",
    "tweets"."reply_to_user_id"
   FROM "public"."tweets"
  WHERE ("tweets"."reply_to_tweet_id" IS NOT NULL);


ALTER TABLE "public"."tweet_replies_view" OWNER TO "postgres";


ALTER TABLE "public"."tweet_urls" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tweet_urls_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."tweets_w_conversation_id" AS
 SELECT "tweets"."tweet_id",
    "tweets"."account_id",
    "tweets"."created_at",
    "tweets"."full_text",
    "tweets"."retweet_count",
    "tweets"."favorite_count",
    "tweets"."reply_to_tweet_id",
    "tweets"."reply_to_user_id",
    "tweets"."reply_to_username",
    "tweets"."archive_upload_id",
    "tweets"."fts",
    "c"."conversation_id"
   FROM ("public"."tweets"
     LEFT JOIN "public"."conversations" "c" ON (("tweets"."tweet_id" = "c"."tweet_id")));


ALTER TABLE "public"."tweets_w_conversation_id" OWNER TO "postgres";


ALTER TABLE "public"."user_mentions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_mentions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."account_1360327512031711237" (
    "account_id" "text",
    "created_via" "text",
    "username" "text",
    "created_at" timestamp with time zone,
    "account_display_name" "text",
    "num_tweets" integer,
    "num_following" integer,
    "num_followers" integer,
    "num_likes" integer
);


ALTER TABLE "temp"."account_1360327512031711237" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."account_19068614" (
    "account_id" "text",
    "created_via" "text",
    "username" "text",
    "created_at" timestamp with time zone,
    "account_display_name" "text",
    "num_tweets" integer,
    "num_following" integer,
    "num_followers" integer,
    "num_likes" integer
);


ALTER TABLE "temp"."account_19068614" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."account_2963358137" (
    "account_id" "text",
    "created_via" "text",
    "username" "text",
    "created_at" timestamp with time zone,
    "account_display_name" "text",
    "num_tweets" integer,
    "num_following" integer,
    "num_followers" integer,
    "num_likes" integer
);


ALTER TABLE "temp"."account_2963358137" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."archive_upload_1360327512031711237" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "archive_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "keep_private" boolean DEFAULT false,
    "upload_likes" boolean DEFAULT true,
    "start_date" "date",
    "end_date" "date",
    "upload_phase" "public"."upload_phase_enum" DEFAULT 'uploading'::"public"."upload_phase_enum"
);


ALTER TABLE "temp"."archive_upload_1360327512031711237" OWNER TO "postgres";


ALTER TABLE "temp"."archive_upload_1360327512031711237" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."archive_upload_1360327512031711237_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."archive_upload_19068614" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "archive_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "keep_private" boolean DEFAULT false,
    "upload_likes" boolean DEFAULT true,
    "start_date" "date",
    "end_date" "date",
    "upload_phase" "public"."upload_phase_enum" DEFAULT 'uploading'::"public"."upload_phase_enum"
);


ALTER TABLE "temp"."archive_upload_19068614" OWNER TO "postgres";


ALTER TABLE "temp"."archive_upload_19068614" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."archive_upload_19068614_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."archive_upload_2963358137" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "archive_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "keep_private" boolean DEFAULT false,
    "upload_likes" boolean DEFAULT true,
    "start_date" "date",
    "end_date" "date",
    "upload_phase" "public"."upload_phase_enum" DEFAULT 'uploading'::"public"."upload_phase_enum"
);


ALTER TABLE "temp"."archive_upload_2963358137" OWNER TO "postgres";


ALTER TABLE "temp"."archive_upload_2963358137" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."archive_upload_2963358137_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."followers_1360327512031711237" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "follower_account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."followers_1360327512031711237" OWNER TO "postgres";


ALTER TABLE "temp"."followers_1360327512031711237" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."followers_1360327512031711237_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."followers_19068614" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "follower_account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."followers_19068614" OWNER TO "postgres";


ALTER TABLE "temp"."followers_19068614" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."followers_19068614_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."followers_2963358137" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "follower_account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."followers_2963358137" OWNER TO "postgres";


ALTER TABLE "temp"."followers_2963358137" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."followers_2963358137_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."following_1360327512031711237" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "following_account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."following_1360327512031711237" OWNER TO "postgres";


ALTER TABLE "temp"."following_1360327512031711237" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."following_1360327512031711237_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."following_19068614" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "following_account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."following_19068614" OWNER TO "postgres";


ALTER TABLE "temp"."following_19068614" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."following_19068614_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."following_2963358137" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "following_account_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."following_2963358137" OWNER TO "postgres";


ALTER TABLE "temp"."following_2963358137" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."following_2963358137_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."liked_tweets_1360327512031711237" (
    "tweet_id" "text" NOT NULL,
    "full_text" "text" NOT NULL,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED
);


ALTER TABLE "temp"."liked_tweets_1360327512031711237" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."liked_tweets_19068614" (
    "tweet_id" "text" NOT NULL,
    "full_text" "text" NOT NULL,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED
);


ALTER TABLE "temp"."liked_tweets_19068614" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."liked_tweets_2963358137" (
    "tweet_id" "text" NOT NULL,
    "full_text" "text" NOT NULL,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED
);


ALTER TABLE "temp"."liked_tweets_2963358137" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."likes_1360327512031711237" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "liked_tweet_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."likes_1360327512031711237" OWNER TO "postgres";


ALTER TABLE "temp"."likes_1360327512031711237" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."likes_1360327512031711237_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."likes_19068614" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "liked_tweet_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."likes_19068614" OWNER TO "postgres";


ALTER TABLE "temp"."likes_19068614" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."likes_19068614_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."likes_2963358137" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "liked_tweet_id" "text" NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."likes_2963358137" OWNER TO "postgres";


ALTER TABLE "temp"."likes_2963358137" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."likes_2963358137_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."mentioned_users_1360327512031711237" (
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "screen_name" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "temp"."mentioned_users_1360327512031711237" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."mentioned_users_19068614" (
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "screen_name" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "temp"."mentioned_users_19068614" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."mentioned_users_2963358137" (
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "screen_name" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "temp"."mentioned_users_2963358137" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."profile_1360327512031711237" (
    "account_id" "text",
    "bio" "text",
    "website" "text",
    "location" "text",
    "avatar_media_url" "text",
    "header_media_url" "text",
    "archive_upload_id" bigint
);


ALTER TABLE "temp"."profile_1360327512031711237" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."profile_19068614" (
    "account_id" "text",
    "bio" "text",
    "website" "text",
    "location" "text",
    "avatar_media_url" "text",
    "header_media_url" "text",
    "archive_upload_id" bigint
);


ALTER TABLE "temp"."profile_19068614" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."profile_2963358137" (
    "account_id" "text",
    "bio" "text",
    "website" "text",
    "location" "text",
    "avatar_media_url" "text",
    "header_media_url" "text",
    "archive_upload_id" bigint
);


ALTER TABLE "temp"."profile_2963358137" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."tweet_media_1360327512031711237" (
    "media_id" bigint NOT NULL,
    "tweet_id" "text" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."tweet_media_1360327512031711237" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."tweet_media_19068614" (
    "media_id" bigint NOT NULL,
    "tweet_id" "text" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."tweet_media_19068614" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."tweet_media_2963358137" (
    "media_id" bigint NOT NULL,
    "tweet_id" "text" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "archive_upload_id" bigint,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."tweet_media_2963358137" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."tweet_urls_1360327512031711237" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "expanded_url" "text",
    "display_url" "text" NOT NULL,
    "tweet_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."tweet_urls_1360327512031711237" OWNER TO "postgres";


ALTER TABLE "temp"."tweet_urls_1360327512031711237" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."tweet_urls_1360327512031711237_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."tweet_urls_19068614" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "expanded_url" "text",
    "display_url" "text" NOT NULL,
    "tweet_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."tweet_urls_19068614" OWNER TO "postgres";


ALTER TABLE "temp"."tweet_urls_19068614" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."tweet_urls_19068614_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."tweet_urls_2963358137" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "expanded_url" "text",
    "display_url" "text" NOT NULL,
    "tweet_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."tweet_urls_2963358137" OWNER TO "postgres";


ALTER TABLE "temp"."tweet_urls_2963358137" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."tweet_urls_2963358137_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."tweets_1360327512031711237" (
    "tweet_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "full_text" "text" NOT NULL,
    "retweet_count" integer NOT NULL,
    "favorite_count" integer NOT NULL,
    "reply_to_tweet_id" "text",
    "reply_to_user_id" "text",
    "reply_to_username" "text",
    "archive_upload_id" bigint,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."tweets_1360327512031711237" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."tweets_19068614" (
    "tweet_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "full_text" "text" NOT NULL,
    "retweet_count" integer NOT NULL,
    "favorite_count" integer NOT NULL,
    "reply_to_tweet_id" "text",
    "reply_to_user_id" "text",
    "reply_to_username" "text",
    "archive_upload_id" bigint,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."tweets_19068614" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."tweets_2963358137" (
    "tweet_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "full_text" "text" NOT NULL,
    "retweet_count" integer NOT NULL,
    "favorite_count" integer NOT NULL,
    "reply_to_tweet_id" "text",
    "reply_to_user_id" "text",
    "reply_to_username" "text",
    "archive_upload_id" bigint,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."tweets_2963358137" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "temp"."user_mentions_1360327512031711237" (
    "id" bigint NOT NULL,
    "mentioned_user_id" "text" NOT NULL,
    "tweet_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."user_mentions_1360327512031711237" OWNER TO "postgres";


ALTER TABLE "temp"."user_mentions_1360327512031711237" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."user_mentions_1360327512031711237_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."user_mentions_19068614" (
    "id" bigint NOT NULL,
    "mentioned_user_id" "text" NOT NULL,
    "tweet_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."user_mentions_19068614" OWNER TO "postgres";


ALTER TABLE "temp"."user_mentions_19068614" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."user_mentions_19068614_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "temp"."user_mentions_2963358137" (
    "id" bigint NOT NULL,
    "mentioned_user_id" "text" NOT NULL,
    "tweet_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "temp"."user_mentions_2963358137" OWNER TO "postgres";


ALTER TABLE "temp"."user_mentions_2963358137" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."user_mentions_2963358137_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "tes"."blocked_scraping_users" (
    "account_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "tes"."blocked_scraping_users" OWNER TO "postgres";


ALTER TABLE ONLY "private"."daily_pg_stat_statements" ALTER COLUMN "id" SET DEFAULT "nextval"('"private"."daily_pg_stat_statements_id_seq"'::"regclass");



ALTER TABLE ONLY "private"."import_errors" ALTER COLUMN "id" SET DEFAULT "nextval"('"private"."import_errors_id_seq"'::"regclass");



ALTER TABLE ONLY "private"."logs" ALTER COLUMN "log_id" SET DEFAULT "nextval"('"private"."logs_log_id_seq"'::"regclass");



ALTER TABLE ONLY "ca_website"."scraping_stats"
    ADD CONSTRAINT "scraping_stats_pkey" PRIMARY KEY ("period_type", "period_start");



ALTER TABLE ONLY "private"."archived_temporary_data"
    ADD CONSTRAINT "archived_temporary_data_id_key" UNIQUE ("id");



ALTER TABLE ONLY "private"."archived_temporary_data"
    ADD CONSTRAINT "archived_temporary_data_pkey" PRIMARY KEY ("type", "originator_id", "item_id", "timestamp");



ALTER TABLE ONLY "private"."daily_pg_stat_statements"
    ADD CONSTRAINT "daily_pg_stat_statements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."import_errors"
    ADD CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."job_queue"
    ADD CONSTRAINT "job_queue_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "private"."logs"
    ADD CONSTRAINT "logs_pkey" PRIMARY KEY ("log_id");



ALTER TABLE ONLY "private"."tweet_user"
    ADD CONSTRAINT "tweet_user_pkey" PRIMARY KEY ("tweet_id");



ALTER TABLE ONLY "private"."user_intercepted_stats"
    ADD CONSTRAINT "user_intercepted_stats_pkey" PRIMARY KEY ("user_id", "date", "type");



ALTER TABLE ONLY "public"."all_account"
    ADD CONSTRAINT "all_account_pkey" PRIMARY KEY ("account_id");



ALTER TABLE ONLY "public"."all_profile"
    ADD CONSTRAINT "all_profile_account_id_archive_upload_id_key" UNIQUE ("account_id", "archive_upload_id");



ALTER TABLE ONLY "public"."all_profile"
    ADD CONSTRAINT "all_profile_pkey" PRIMARY KEY ("account_id");



ALTER TABLE ONLY "public"."archive_upload"
    ADD CONSTRAINT "archive_upload_account_id_archive_at_key" UNIQUE ("account_id", "archive_at");



ALTER TABLE ONLY "public"."archive_upload"
    ADD CONSTRAINT "archive_upload_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("tweet_id");



ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_account_id_follower_account_id_key" UNIQUE ("account_id", "follower_account_id");



ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_account_id_following_account_id_key" UNIQUE ("account_id", "following_account_id");



ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."liked_tweets"
    ADD CONSTRAINT "liked_tweets_pkey" PRIMARY KEY ("tweet_id");



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_account_id_liked_tweet_id_key" UNIQUE ("account_id", "liked_tweet_id");



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mentioned_users"
    ADD CONSTRAINT "mentioned_users_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."optin"
    ADD CONSTRAINT "optin_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."optin"
    ADD CONSTRAINT "optin_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."optin"
    ADD CONSTRAINT "optin_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."tweet_media"
    ADD CONSTRAINT "tweet_media_pkey" PRIMARY KEY ("media_id");



ALTER TABLE ONLY "public"."tweet_urls"
    ADD CONSTRAINT "tweet_urls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tweet_urls"
    ADD CONSTRAINT "tweet_urls_tweet_id_url_key" UNIQUE ("tweet_id", "url");



ALTER TABLE ONLY "public"."tweets"
    ADD CONSTRAINT "tweets_pkey" PRIMARY KEY ("tweet_id");



ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_mentioned_user_id_tweet_id_key" UNIQUE ("mentioned_user_id", "tweet_id");



ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."archive_upload_1360327512031711237"
    ADD CONSTRAINT "archive_upload_1360327512031711237_account_id_archive_at_key" UNIQUE ("account_id", "archive_at");



ALTER TABLE ONLY "temp"."archive_upload_1360327512031711237"
    ADD CONSTRAINT "archive_upload_1360327512031711237_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."archive_upload_19068614"
    ADD CONSTRAINT "archive_upload_19068614_account_id_archive_at_key" UNIQUE ("account_id", "archive_at");



ALTER TABLE ONLY "temp"."archive_upload_19068614"
    ADD CONSTRAINT "archive_upload_19068614_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."archive_upload_2963358137"
    ADD CONSTRAINT "archive_upload_2963358137_account_id_archive_at_key" UNIQUE ("account_id", "archive_at");



ALTER TABLE ONLY "temp"."archive_upload_2963358137"
    ADD CONSTRAINT "archive_upload_2963358137_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."followers_1360327512031711237"
    ADD CONSTRAINT "followers_1360327512031711237_account_id_follower_account_i_key" UNIQUE ("account_id", "follower_account_id");



ALTER TABLE ONLY "temp"."followers_1360327512031711237"
    ADD CONSTRAINT "followers_1360327512031711237_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."followers_19068614"
    ADD CONSTRAINT "followers_19068614_account_id_follower_account_id_key" UNIQUE ("account_id", "follower_account_id");



ALTER TABLE ONLY "temp"."followers_19068614"
    ADD CONSTRAINT "followers_19068614_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."followers_2963358137"
    ADD CONSTRAINT "followers_2963358137_account_id_follower_account_id_key" UNIQUE ("account_id", "follower_account_id");



ALTER TABLE ONLY "temp"."followers_2963358137"
    ADD CONSTRAINT "followers_2963358137_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."following_1360327512031711237"
    ADD CONSTRAINT "following_1360327512031711237_account_id_following_account__key" UNIQUE ("account_id", "following_account_id");



ALTER TABLE ONLY "temp"."following_1360327512031711237"
    ADD CONSTRAINT "following_1360327512031711237_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."following_19068614"
    ADD CONSTRAINT "following_19068614_account_id_following_account_id_key" UNIQUE ("account_id", "following_account_id");



ALTER TABLE ONLY "temp"."following_19068614"
    ADD CONSTRAINT "following_19068614_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."following_2963358137"
    ADD CONSTRAINT "following_2963358137_account_id_following_account_id_key" UNIQUE ("account_id", "following_account_id");



ALTER TABLE ONLY "temp"."following_2963358137"
    ADD CONSTRAINT "following_2963358137_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."liked_tweets_1360327512031711237"
    ADD CONSTRAINT "liked_tweets_1360327512031711237_pkey" PRIMARY KEY ("tweet_id");



ALTER TABLE ONLY "temp"."liked_tweets_19068614"
    ADD CONSTRAINT "liked_tweets_19068614_pkey" PRIMARY KEY ("tweet_id");



ALTER TABLE ONLY "temp"."liked_tweets_2963358137"
    ADD CONSTRAINT "liked_tweets_2963358137_pkey" PRIMARY KEY ("tweet_id");



ALTER TABLE ONLY "temp"."likes_1360327512031711237"
    ADD CONSTRAINT "likes_1360327512031711237_account_id_liked_tweet_id_key" UNIQUE ("account_id", "liked_tweet_id");



ALTER TABLE ONLY "temp"."likes_1360327512031711237"
    ADD CONSTRAINT "likes_1360327512031711237_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."likes_19068614"
    ADD CONSTRAINT "likes_19068614_account_id_liked_tweet_id_key" UNIQUE ("account_id", "liked_tweet_id");



ALTER TABLE ONLY "temp"."likes_19068614"
    ADD CONSTRAINT "likes_19068614_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."likes_2963358137"
    ADD CONSTRAINT "likes_2963358137_account_id_liked_tweet_id_key" UNIQUE ("account_id", "liked_tweet_id");



ALTER TABLE ONLY "temp"."likes_2963358137"
    ADD CONSTRAINT "likes_2963358137_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."mentioned_users_1360327512031711237"
    ADD CONSTRAINT "mentioned_users_1360327512031711237_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "temp"."mentioned_users_19068614"
    ADD CONSTRAINT "mentioned_users_19068614_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "temp"."mentioned_users_2963358137"
    ADD CONSTRAINT "mentioned_users_2963358137_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "temp"."tweet_media_1360327512031711237"
    ADD CONSTRAINT "tweet_media_1360327512031711237_pkey" PRIMARY KEY ("media_id");



ALTER TABLE ONLY "temp"."tweet_media_19068614"
    ADD CONSTRAINT "tweet_media_19068614_pkey" PRIMARY KEY ("media_id");



ALTER TABLE ONLY "temp"."tweet_media_2963358137"
    ADD CONSTRAINT "tweet_media_2963358137_pkey" PRIMARY KEY ("media_id");



ALTER TABLE ONLY "temp"."tweet_urls_1360327512031711237"
    ADD CONSTRAINT "tweet_urls_1360327512031711237_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."tweet_urls_1360327512031711237"
    ADD CONSTRAINT "tweet_urls_1360327512031711237_tweet_id_url_key" UNIQUE ("tweet_id", "url");



ALTER TABLE ONLY "temp"."tweet_urls_19068614"
    ADD CONSTRAINT "tweet_urls_19068614_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."tweet_urls_19068614"
    ADD CONSTRAINT "tweet_urls_19068614_tweet_id_url_key" UNIQUE ("tweet_id", "url");



ALTER TABLE ONLY "temp"."tweet_urls_2963358137"
    ADD CONSTRAINT "tweet_urls_2963358137_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."tweet_urls_2963358137"
    ADD CONSTRAINT "tweet_urls_2963358137_tweet_id_url_key" UNIQUE ("tweet_id", "url");



ALTER TABLE ONLY "temp"."tweets_1360327512031711237"
    ADD CONSTRAINT "tweets_1360327512031711237_pkey" PRIMARY KEY ("tweet_id");



ALTER TABLE ONLY "temp"."tweets_19068614"
    ADD CONSTRAINT "tweets_19068614_pkey" PRIMARY KEY ("tweet_id");



ALTER TABLE ONLY "temp"."tweets_2963358137"
    ADD CONSTRAINT "tweets_2963358137_pkey" PRIMARY KEY ("tweet_id");



ALTER TABLE ONLY "temp"."user_mentions_1360327512031711237"
    ADD CONSTRAINT "user_mentions_1360327512031711237_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."user_mentions_1360327512031711237"
    ADD CONSTRAINT "user_mentions_136032751203171123_mentioned_user_id_tweet_id_key" UNIQUE ("mentioned_user_id", "tweet_id");



ALTER TABLE ONLY "temp"."user_mentions_19068614"
    ADD CONSTRAINT "user_mentions_19068614_mentioned_user_id_tweet_id_key" UNIQUE ("mentioned_user_id", "tweet_id");



ALTER TABLE ONLY "temp"."user_mentions_19068614"
    ADD CONSTRAINT "user_mentions_19068614_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "temp"."user_mentions_2963358137"
    ADD CONSTRAINT "user_mentions_2963358137_mentioned_user_id_tweet_id_key" UNIQUE ("mentioned_user_id", "tweet_id");



ALTER TABLE ONLY "temp"."user_mentions_2963358137"
    ADD CONSTRAINT "user_mentions_2963358137_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tes"."blocked_scraping_users"
    ADD CONSTRAINT "blocked_scraping_users_pkey" PRIMARY KEY ("account_id");



CREATE INDEX "idx_scraping_stats_last_updated" ON "ca_website"."scraping_stats" USING "btree" ("last_updated");



CREATE INDEX "idx_scraping_stats_period_end" ON "ca_website"."scraping_stats" USING "btree" ("period_end");



CREATE INDEX "archived_temporary_data_inserted_stored_idx" ON "private"."archived_temporary_data" USING "btree" ("inserted", "stored") WHERE (("inserted" IS NOT NULL) AND ("stored" = false) AND (("type")::"text" ~~ 'api_%'::"text"));



CREATE INDEX "archived_temporary_data_inserted_stored_type_idx" ON "private"."archived_temporary_data" USING "btree" ("inserted", "stored", "type");



CREATE INDEX "archived_temporary_data_stored_idx" ON "private"."archived_temporary_data" USING "btree" ("stored");



CREATE INDEX "archived_temporary_data_timestamp_idx" ON "private"."archived_temporary_data" USING "btree" ("timestamp" DESC);



CREATE INDEX "archived_temporary_data_type_idx" ON "private"."archived_temporary_data" USING "btree" ("type" "text_pattern_ops");



CREATE INDEX "archived_temporary_data_type_originator_id_item_id_idx" ON "private"."archived_temporary_data" USING "btree" ("type", "originator_id", "item_id");



CREATE INDEX "archived_temporary_data_user_id_idx" ON "private"."archived_temporary_data" USING "btree" ("user_id");



CREATE INDEX "idx_import_errors_type_originator_item" ON "private"."import_errors" USING "btree" ("type", "originator_id", "item_id");



CREATE INDEX "idx_job_queue_job_name" ON "private"."job_queue" USING "btree" ("job_name");



CREATE INDEX "idx_job_queue_status_timestamp" ON "private"."job_queue" USING "btree" ("status", "timestamp");



CREATE INDEX "idx_all_profile_archive_upload_id" ON "public"."all_profile" USING "btree" ("archive_upload_id");



CREATE INDEX "idx_archive_upload_account_id" ON "public"."archive_upload" USING "btree" ("account_id");



CREATE INDEX "idx_conversation_id" ON "public"."conversations" USING "btree" ("conversation_id");



CREATE INDEX "idx_followers_account_id" ON "public"."followers" USING "btree" ("account_id");



CREATE INDEX "idx_followers_archive_upload_id" ON "public"."followers" USING "btree" ("archive_upload_id");



CREATE INDEX "idx_following_account_id" ON "public"."following" USING "btree" ("account_id");



CREATE INDEX "idx_following_archive_upload_id" ON "public"."following" USING "btree" ("archive_upload_id");



CREATE UNIQUE INDEX "idx_global_activity_summary_last_updated" ON "public"."global_activity_summary" USING "btree" ("last_updated");



CREATE INDEX "idx_likes_account_id" ON "public"."likes" USING "btree" ("account_id");



CREATE INDEX "idx_likes_archive_upload_id" ON "public"."likes" USING "btree" ("archive_upload_id");



CREATE INDEX "idx_likes_liked_tweet_id" ON "public"."likes" USING "btree" ("liked_tweet_id");



CREATE INDEX "idx_mentioned_users_user_id" ON "public"."mentioned_users" USING "btree" ("user_id");



CREATE INDEX "idx_optin_opted_in" ON "public"."optin" USING "btree" ("opted_in") WHERE ("opted_in" = true);



CREATE INDEX "idx_optin_user_id" ON "public"."optin" USING "btree" ("user_id");



CREATE INDEX "idx_optin_username" ON "public"."optin" USING "btree" ("username");



CREATE INDEX "idx_tweet_media_archive_upload_id" ON "public"."tweet_media" USING "btree" ("archive_upload_id");



CREATE INDEX "idx_tweet_media_tweet_id" ON "public"."tweet_media" USING "btree" ("tweet_id");



CREATE INDEX "idx_tweet_urls_expanded_url_gin" ON "public"."tweet_urls" USING "gin" ("expanded_url" "public"."gin_trgm_ops");



CREATE INDEX "idx_tweet_urls_tweet_id" ON "public"."tweet_urls" USING "btree" ("tweet_id");



CREATE INDEX "idx_tweets_account_id" ON "public"."tweets" USING "btree" ("account_id");



CREATE INDEX "idx_tweets_archive_upload_id" ON "public"."tweets" USING "btree" ("archive_upload_id");



CREATE INDEX "idx_tweets_created_at" ON "public"."tweets" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_tweets_created_at_fts" ON "public"."tweets" USING "btree" ("created_at" DESC) WHERE ("fts" IS NOT NULL);



CREATE INDEX "idx_tweets_created_at_range" ON "public"."tweets" USING "brin" ("created_at") WITH ("pages_per_range"='128');



CREATE INDEX "idx_tweets_engagement" ON "public"."tweets" USING "btree" ("account_id", (("retweet_count" + "favorite_count")) DESC);



CREATE INDEX "idx_tweets_favorite_count" ON "public"."tweets" USING "btree" ("favorite_count");



CREATE INDEX "idx_tweets_null_archive_upload_id" ON "public"."tweets" USING "btree" ("updated_at" DESC) WHERE ("archive_upload_id" IS NULL);



CREATE INDEX "idx_tweets_reply_to_tweet_id" ON "public"."tweets" USING "btree" ("reply_to_tweet_id");



CREATE INDEX "idx_tweets_reply_to_user_id" ON "public"."tweets" USING "btree" ("reply_to_user_id");



CREATE INDEX "idx_tweets_streaming" ON "public"."tweets" USING "btree" ("created_at") WHERE ("archive_upload_id" IS NULL);



CREATE INDEX "idx_tweets_updated_at" ON "public"."tweets" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_tweets_updated_at_tweet_id" ON "public"."tweets" USING "btree" ("updated_at", "tweet_id");



CREATE INDEX "idx_user_mentions_mentioned_user_id" ON "public"."user_mentions" USING "btree" ("mentioned_user_id");



CREATE INDEX "idx_user_mentions_tweet_id" ON "public"."user_mentions" USING "btree" ("tweet_id");



CREATE INDEX "likes_account_id_idx" ON "public"."likes" USING "btree" ("account_id");



CREATE INDEX "monthly_tweet_counts_mv_account_idx" ON "public"."monthly_tweet_counts_mv" USING "btree" ("account_id");



CREATE INDEX "monthly_tweet_counts_mv_month_idx" ON "public"."monthly_tweet_counts_mv" USING "btree" ("month" DESC);



CREATE UNIQUE INDEX "monthly_tweet_counts_mv_unique_idx" ON "public"."monthly_tweet_counts_mv" USING "btree" ("month", "account_id");



CREATE INDEX "text_fts" ON "public"."tweets" USING "gin" ("fts");



CREATE INDEX "tweets_account_id_favorite_idx" ON "public"."tweets" USING "btree" ("account_id", "favorite_count" DESC);



CREATE INDEX "tweets_account_id_retweet_idx" ON "public"."tweets" USING "btree" ("account_id", "retweet_count" DESC);



CREATE INDEX "user_mentions_tweet_id_idx" ON "public"."user_mentions" USING "btree" ("tweet_id");



CREATE INDEX "archive_upload_1360327512031711237_account_id_idx" ON "temp"."archive_upload_1360327512031711237" USING "btree" ("account_id");



CREATE INDEX "archive_upload_19068614_account_id_idx" ON "temp"."archive_upload_19068614" USING "btree" ("account_id");



CREATE INDEX "archive_upload_2963358137_account_id_idx" ON "temp"."archive_upload_2963358137" USING "btree" ("account_id");



CREATE INDEX "followers_1360327512031711237_account_id_idx" ON "temp"."followers_1360327512031711237" USING "btree" ("account_id");



CREATE INDEX "followers_1360327512031711237_archive_upload_id_idx" ON "temp"."followers_1360327512031711237" USING "btree" ("archive_upload_id");



CREATE INDEX "followers_19068614_account_id_idx" ON "temp"."followers_19068614" USING "btree" ("account_id");



CREATE INDEX "followers_19068614_archive_upload_id_idx" ON "temp"."followers_19068614" USING "btree" ("archive_upload_id");



CREATE INDEX "followers_2963358137_account_id_idx" ON "temp"."followers_2963358137" USING "btree" ("account_id");



CREATE INDEX "followers_2963358137_archive_upload_id_idx" ON "temp"."followers_2963358137" USING "btree" ("archive_upload_id");



CREATE INDEX "following_1360327512031711237_account_id_idx" ON "temp"."following_1360327512031711237" USING "btree" ("account_id");



CREATE INDEX "following_1360327512031711237_archive_upload_id_idx" ON "temp"."following_1360327512031711237" USING "btree" ("archive_upload_id");



CREATE INDEX "following_19068614_account_id_idx" ON "temp"."following_19068614" USING "btree" ("account_id");



CREATE INDEX "following_19068614_archive_upload_id_idx" ON "temp"."following_19068614" USING "btree" ("archive_upload_id");



CREATE INDEX "following_2963358137_account_id_idx" ON "temp"."following_2963358137" USING "btree" ("account_id");



CREATE INDEX "following_2963358137_archive_upload_id_idx" ON "temp"."following_2963358137" USING "btree" ("archive_upload_id");



CREATE INDEX "likes_1360327512031711237_account_id_idx" ON "temp"."likes_1360327512031711237" USING "btree" ("account_id");



CREATE INDEX "likes_1360327512031711237_account_id_idx1" ON "temp"."likes_1360327512031711237" USING "btree" ("account_id");



CREATE INDEX "likes_1360327512031711237_archive_upload_id_idx" ON "temp"."likes_1360327512031711237" USING "btree" ("archive_upload_id");



CREATE INDEX "likes_1360327512031711237_liked_tweet_id_idx" ON "temp"."likes_1360327512031711237" USING "btree" ("liked_tweet_id");



CREATE INDEX "likes_19068614_account_id_idx" ON "temp"."likes_19068614" USING "btree" ("account_id");



CREATE INDEX "likes_19068614_account_id_idx1" ON "temp"."likes_19068614" USING "btree" ("account_id");



CREATE INDEX "likes_19068614_archive_upload_id_idx" ON "temp"."likes_19068614" USING "btree" ("archive_upload_id");



CREATE INDEX "likes_19068614_liked_tweet_id_idx" ON "temp"."likes_19068614" USING "btree" ("liked_tweet_id");



CREATE INDEX "likes_2963358137_account_id_idx" ON "temp"."likes_2963358137" USING "btree" ("account_id");



CREATE INDEX "likes_2963358137_account_id_idx1" ON "temp"."likes_2963358137" USING "btree" ("account_id");



CREATE INDEX "likes_2963358137_archive_upload_id_idx" ON "temp"."likes_2963358137" USING "btree" ("archive_upload_id");



CREATE INDEX "likes_2963358137_liked_tweet_id_idx" ON "temp"."likes_2963358137" USING "btree" ("liked_tweet_id");



CREATE INDEX "mentioned_users_1360327512031711237_user_id_idx" ON "temp"."mentioned_users_1360327512031711237" USING "btree" ("user_id");



CREATE INDEX "mentioned_users_19068614_user_id_idx" ON "temp"."mentioned_users_19068614" USING "btree" ("user_id");



CREATE INDEX "mentioned_users_2963358137_user_id_idx" ON "temp"."mentioned_users_2963358137" USING "btree" ("user_id");



CREATE INDEX "tweet_media_1360327512031711237_archive_upload_id_idx" ON "temp"."tweet_media_1360327512031711237" USING "btree" ("archive_upload_id");



CREATE INDEX "tweet_media_1360327512031711237_tweet_id_idx" ON "temp"."tweet_media_1360327512031711237" USING "btree" ("tweet_id");



CREATE INDEX "tweet_media_19068614_archive_upload_id_idx" ON "temp"."tweet_media_19068614" USING "btree" ("archive_upload_id");



CREATE INDEX "tweet_media_19068614_tweet_id_idx" ON "temp"."tweet_media_19068614" USING "btree" ("tweet_id");



CREATE INDEX "tweet_media_2963358137_archive_upload_id_idx" ON "temp"."tweet_media_2963358137" USING "btree" ("archive_upload_id");



CREATE INDEX "tweet_media_2963358137_tweet_id_idx" ON "temp"."tweet_media_2963358137" USING "btree" ("tweet_id");



CREATE INDEX "tweet_urls_1360327512031711237_expanded_url_idx" ON "temp"."tweet_urls_1360327512031711237" USING "gin" ("expanded_url" "public"."gin_trgm_ops");



CREATE INDEX "tweet_urls_1360327512031711237_tweet_id_idx" ON "temp"."tweet_urls_1360327512031711237" USING "btree" ("tweet_id");



CREATE INDEX "tweet_urls_19068614_expanded_url_idx" ON "temp"."tweet_urls_19068614" USING "gin" ("expanded_url" "public"."gin_trgm_ops");



CREATE INDEX "tweet_urls_19068614_tweet_id_idx" ON "temp"."tweet_urls_19068614" USING "btree" ("tweet_id");



CREATE INDEX "tweet_urls_2963358137_expanded_url_idx" ON "temp"."tweet_urls_2963358137" USING "gin" ("expanded_url" "public"."gin_trgm_ops");



CREATE INDEX "tweet_urls_2963358137_tweet_id_idx" ON "temp"."tweet_urls_2963358137" USING "btree" ("tweet_id");



CREATE INDEX "tweets_1360327512031711237_account_id_created_at_tweet_id_f_idx" ON "temp"."tweets_1360327512031711237" USING "btree" ("account_id", "created_at" DESC) INCLUDE ("tweet_id", "full_text", "favorite_count", "retweet_count");



CREATE INDEX "tweets_1360327512031711237_account_id_expr_idx" ON "temp"."tweets_1360327512031711237" USING "btree" ("account_id", (("retweet_count" + "favorite_count")) DESC);



CREATE INDEX "tweets_1360327512031711237_account_id_favorite_count_idx" ON "temp"."tweets_1360327512031711237" USING "btree" ("account_id", "favorite_count" DESC);



CREATE INDEX "tweets_1360327512031711237_account_id_idx" ON "temp"."tweets_1360327512031711237" USING "btree" ("account_id");



CREATE INDEX "tweets_1360327512031711237_account_id_retweet_count_idx" ON "temp"."tweets_1360327512031711237" USING "btree" ("account_id", "retweet_count" DESC);



CREATE INDEX "tweets_1360327512031711237_archive_upload_id_idx" ON "temp"."tweets_1360327512031711237" USING "btree" ("archive_upload_id");



CREATE INDEX "tweets_1360327512031711237_created_at_idx" ON "temp"."tweets_1360327512031711237" USING "btree" ("created_at" DESC);



CREATE INDEX "tweets_1360327512031711237_created_at_idx1" ON "temp"."tweets_1360327512031711237" USING "btree" ("created_at") WHERE ("archive_upload_id" IS NULL);



CREATE INDEX "tweets_1360327512031711237_created_at_idx2" ON "temp"."tweets_1360327512031711237" USING "btree" ("created_at" DESC) WHERE ("fts" IS NOT NULL);



CREATE INDEX "tweets_1360327512031711237_created_at_idx3" ON "temp"."tweets_1360327512031711237" USING "brin" ("created_at") WITH ("pages_per_range"='128');



CREATE INDEX "tweets_1360327512031711237_favorite_count_idx" ON "temp"."tweets_1360327512031711237" USING "btree" ("favorite_count");



CREATE INDEX "tweets_1360327512031711237_fts_idx" ON "temp"."tweets_1360327512031711237" USING "gin" ("fts");



CREATE INDEX "tweets_1360327512031711237_reply_to_tweet_id_idx" ON "temp"."tweets_1360327512031711237" USING "btree" ("reply_to_tweet_id");



CREATE INDEX "tweets_1360327512031711237_reply_to_user_id_idx" ON "temp"."tweets_1360327512031711237" USING "btree" ("reply_to_user_id");



CREATE INDEX "tweets_1360327512031711237_updated_at_idx" ON "temp"."tweets_1360327512031711237" USING "btree" ("updated_at" DESC) WHERE ("archive_upload_id" IS NULL);



CREATE INDEX "tweets_1360327512031711237_updated_at_idx1" ON "temp"."tweets_1360327512031711237" USING "btree" ("updated_at" DESC);



CREATE INDEX "tweets_1360327512031711237_updated_at_tweet_id_idx" ON "temp"."tweets_1360327512031711237" USING "btree" ("updated_at", "tweet_id");



CREATE INDEX "tweets_19068614_account_id_created_at_tweet_id_full_text_fa_idx" ON "temp"."tweets_19068614" USING "btree" ("account_id", "created_at" DESC) INCLUDE ("tweet_id", "full_text", "favorite_count", "retweet_count");



CREATE INDEX "tweets_19068614_account_id_expr_idx" ON "temp"."tweets_19068614" USING "btree" ("account_id", (("retweet_count" + "favorite_count")) DESC);



CREATE INDEX "tweets_19068614_account_id_favorite_count_idx" ON "temp"."tweets_19068614" USING "btree" ("account_id", "favorite_count" DESC);



CREATE INDEX "tweets_19068614_account_id_idx" ON "temp"."tweets_19068614" USING "btree" ("account_id");



CREATE INDEX "tweets_19068614_account_id_retweet_count_idx" ON "temp"."tweets_19068614" USING "btree" ("account_id", "retweet_count" DESC);



CREATE INDEX "tweets_19068614_archive_upload_id_idx" ON "temp"."tweets_19068614" USING "btree" ("archive_upload_id");



CREATE INDEX "tweets_19068614_created_at_idx" ON "temp"."tweets_19068614" USING "btree" ("created_at" DESC);



CREATE INDEX "tweets_19068614_created_at_idx1" ON "temp"."tweets_19068614" USING "btree" ("created_at") WHERE ("archive_upload_id" IS NULL);



CREATE INDEX "tweets_19068614_created_at_idx2" ON "temp"."tweets_19068614" USING "btree" ("created_at" DESC) WHERE ("fts" IS NOT NULL);



CREATE INDEX "tweets_19068614_created_at_idx3" ON "temp"."tweets_19068614" USING "brin" ("created_at") WITH ("pages_per_range"='128');



CREATE INDEX "tweets_19068614_favorite_count_idx" ON "temp"."tweets_19068614" USING "btree" ("favorite_count");



CREATE INDEX "tweets_19068614_fts_idx" ON "temp"."tweets_19068614" USING "gin" ("fts");



CREATE INDEX "tweets_19068614_reply_to_tweet_id_idx" ON "temp"."tweets_19068614" USING "btree" ("reply_to_tweet_id");



CREATE INDEX "tweets_19068614_reply_to_user_id_idx" ON "temp"."tweets_19068614" USING "btree" ("reply_to_user_id");



CREATE INDEX "tweets_19068614_updated_at_idx" ON "temp"."tweets_19068614" USING "btree" ("updated_at" DESC) WHERE ("archive_upload_id" IS NULL);



CREATE INDEX "tweets_19068614_updated_at_idx1" ON "temp"."tweets_19068614" USING "btree" ("updated_at" DESC);



CREATE INDEX "tweets_19068614_updated_at_tweet_id_idx" ON "temp"."tweets_19068614" USING "btree" ("updated_at", "tweet_id");



CREATE INDEX "tweets_2963358137_account_id_created_at_tweet_id_full_text__idx" ON "temp"."tweets_2963358137" USING "btree" ("account_id", "created_at" DESC) INCLUDE ("tweet_id", "full_text", "favorite_count", "retweet_count");



CREATE INDEX "tweets_2963358137_account_id_expr_idx" ON "temp"."tweets_2963358137" USING "btree" ("account_id", (("retweet_count" + "favorite_count")) DESC);



CREATE INDEX "tweets_2963358137_account_id_favorite_count_idx" ON "temp"."tweets_2963358137" USING "btree" ("account_id", "favorite_count" DESC);



CREATE INDEX "tweets_2963358137_account_id_idx" ON "temp"."tweets_2963358137" USING "btree" ("account_id");



CREATE INDEX "tweets_2963358137_account_id_retweet_count_idx" ON "temp"."tweets_2963358137" USING "btree" ("account_id", "retweet_count" DESC);



CREATE INDEX "tweets_2963358137_archive_upload_id_idx" ON "temp"."tweets_2963358137" USING "btree" ("archive_upload_id");



CREATE INDEX "tweets_2963358137_created_at_idx" ON "temp"."tweets_2963358137" USING "btree" ("created_at" DESC);



CREATE INDEX "tweets_2963358137_created_at_idx1" ON "temp"."tweets_2963358137" USING "btree" ("created_at") WHERE ("archive_upload_id" IS NULL);



CREATE INDEX "tweets_2963358137_created_at_idx2" ON "temp"."tweets_2963358137" USING "btree" ("created_at" DESC) WHERE ("fts" IS NOT NULL);



CREATE INDEX "tweets_2963358137_created_at_idx3" ON "temp"."tweets_2963358137" USING "brin" ("created_at") WITH ("pages_per_range"='128');



CREATE INDEX "tweets_2963358137_favorite_count_idx" ON "temp"."tweets_2963358137" USING "btree" ("favorite_count");



CREATE INDEX "tweets_2963358137_fts_idx" ON "temp"."tweets_2963358137" USING "gin" ("fts");



CREATE INDEX "tweets_2963358137_reply_to_tweet_id_idx" ON "temp"."tweets_2963358137" USING "btree" ("reply_to_tweet_id");



CREATE INDEX "tweets_2963358137_reply_to_user_id_idx" ON "temp"."tweets_2963358137" USING "btree" ("reply_to_user_id");



CREATE INDEX "tweets_2963358137_updated_at_idx" ON "temp"."tweets_2963358137" USING "btree" ("updated_at" DESC) WHERE ("archive_upload_id" IS NULL);



CREATE INDEX "tweets_2963358137_updated_at_idx1" ON "temp"."tweets_2963358137" USING "btree" ("updated_at" DESC);



CREATE INDEX "tweets_2963358137_updated_at_tweet_id_idx" ON "temp"."tweets_2963358137" USING "btree" ("updated_at", "tweet_id");



CREATE INDEX "user_mentions_1360327512031711237_mentioned_user_id_idx" ON "temp"."user_mentions_1360327512031711237" USING "btree" ("mentioned_user_id");



CREATE INDEX "user_mentions_1360327512031711237_tweet_id_idx" ON "temp"."user_mentions_1360327512031711237" USING "btree" ("tweet_id");



CREATE INDEX "user_mentions_1360327512031711237_tweet_id_idx1" ON "temp"."user_mentions_1360327512031711237" USING "btree" ("tweet_id");



CREATE INDEX "user_mentions_19068614_mentioned_user_id_idx" ON "temp"."user_mentions_19068614" USING "btree" ("mentioned_user_id");



CREATE INDEX "user_mentions_19068614_tweet_id_idx" ON "temp"."user_mentions_19068614" USING "btree" ("tweet_id");



CREATE INDEX "user_mentions_19068614_tweet_id_idx1" ON "temp"."user_mentions_19068614" USING "btree" ("tweet_id");



CREATE INDEX "user_mentions_2963358137_mentioned_user_id_idx" ON "temp"."user_mentions_2963358137" USING "btree" ("mentioned_user_id");



CREATE INDEX "user_mentions_2963358137_tweet_id_idx" ON "temp"."user_mentions_2963358137" USING "btree" ("tweet_id");



CREATE INDEX "user_mentions_2963358137_tweet_id_idx1" ON "temp"."user_mentions_2963358137" USING "btree" ("tweet_id");



CREATE OR REPLACE TRIGGER "queue_job_on_upload_complete" AFTER UPDATE OF "upload_phase" ON "public"."archive_upload" FOR EACH ROW WHEN (("new"."upload_phase" = 'completed'::"public"."upload_phase_enum")) EXECUTE FUNCTION "private"."queue_archive_changes"();



CREATE OR REPLACE TRIGGER "queue_job_on_upload_delete" AFTER DELETE ON "public"."archive_upload" FOR EACH ROW EXECUTE FUNCTION "private"."queue_archive_changes"();



CREATE OR REPLACE TRIGGER "trigger_commit_temp_data" AFTER UPDATE OF "upload_phase" ON "public"."archive_upload" FOR EACH ROW WHEN (("new"."upload_phase" = 'ready_for_commit'::"public"."upload_phase_enum")) EXECUTE FUNCTION "public"."trigger_commit_temp_data"();



CREATE OR REPLACE TRIGGER "update_all_account_updated_at" BEFORE UPDATE ON "public"."all_account" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_all_profile_updated_at" BEFORE UPDATE ON "public"."all_profile" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_followers_updated_at" BEFORE UPDATE ON "public"."followers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_following_updated_at" BEFORE UPDATE ON "public"."following" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_likes_updated_at" BEFORE UPDATE ON "public"."likes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_optin_timestamp" BEFORE UPDATE ON "public"."optin" FOR EACH ROW EXECUTE FUNCTION "public"."update_optin_updated_at"();



CREATE OR REPLACE TRIGGER "update_tweet_media_updated_at" BEFORE UPDATE ON "public"."tweet_media" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_tweet_urls_updated_at" BEFORE UPDATE ON "public"."tweet_urls" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_tweets_updated_at" BEFORE UPDATE ON "public"."tweets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_mentions_updated_at" BEFORE UPDATE ON "public"."user_mentions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_tes_blocked_scraping_timestamp" BEFORE UPDATE ON "tes"."blocked_scraping_users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."all_profile"
    ADD CONSTRAINT "all_profile_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."all_account"("account_id");



ALTER TABLE ONLY "public"."all_profile"
    ADD CONSTRAINT "all_profile_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");



ALTER TABLE ONLY "public"."archive_upload"
    ADD CONSTRAINT "archive_upload_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."all_account"("account_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id");



ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."all_account"("account_id");



ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");



ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."all_account"("account_id");



ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."all_account"("account_id");



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");



ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_liked_tweet_id_fkey" FOREIGN KEY ("liked_tweet_id") REFERENCES "public"."liked_tweets"("tweet_id");



ALTER TABLE ONLY "public"."optin"
    ADD CONSTRAINT "optin_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tweet_media"
    ADD CONSTRAINT "tweet_media_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");



ALTER TABLE ONLY "public"."tweet_media"
    ADD CONSTRAINT "tweet_media_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id");



ALTER TABLE ONLY "public"."tweet_urls"
    ADD CONSTRAINT "tweet_urls_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id");



ALTER TABLE ONLY "public"."tweets"
    ADD CONSTRAINT "tweets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."all_account"("account_id");



ALTER TABLE ONLY "public"."tweets"
    ADD CONSTRAINT "tweets_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");



ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."mentioned_users"("user_id");



ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id");



CREATE POLICY "Data is modifiable by their users" ON "public"."all_account" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));



CREATE POLICY "Data is modifiable by their users" ON "public"."all_profile" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));



CREATE POLICY "Data is modifiable by their users" ON "public"."archive_upload" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));



CREATE POLICY "Data is modifiable by their users" ON "public"."followers" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));



CREATE POLICY "Data is modifiable by their users" ON "public"."following" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));



CREATE POLICY "Data is modifiable by their users" ON "public"."likes" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));



CREATE POLICY "Data is modifiable by their users" ON "public"."tweets" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));



CREATE POLICY "Data is publicly visible" ON "public"."all_account" FOR SELECT USING (true);



CREATE POLICY "Data is publicly visible" ON "public"."all_profile" FOR SELECT USING (true);



CREATE POLICY "Data is publicly visible" ON "public"."archive_upload" FOR SELECT USING (true);



CREATE POLICY "Data is publicly visible" ON "public"."followers" FOR SELECT USING (true);



CREATE POLICY "Data is publicly visible" ON "public"."following" FOR SELECT USING (true);



CREATE POLICY "Data is publicly visible" ON "public"."likes" FOR SELECT USING (true);



CREATE POLICY "Entities are modifiable by their users" ON "public"."liked_tweets" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))));



CREATE POLICY "Entities are modifiable by their users" ON "public"."mentioned_users" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."all_account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."all_account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))));



CREATE POLICY "Entities are modifiable by their users" ON "public"."tweet_media" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_media"."tweet_id") AND ("dt"."account_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_media"."tweet_id") AND ("dt"."account_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Entities are modifiable by their users" ON "public"."tweet_urls" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_urls"."tweet_id") AND ("dt"."account_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_urls"."tweet_id") AND ("dt"."account_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Entities are modifiable by their users" ON "public"."user_mentions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "user_mentions"."tweet_id") AND ("dt"."account_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "user_mentions"."tweet_id") AND ("dt"."account_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));



CREATE POLICY "Entities are publicly visible" ON "public"."liked_tweets" FOR SELECT USING (true);



CREATE POLICY "Entities are publicly visible" ON "public"."mentioned_users" FOR SELECT USING (true);



CREATE POLICY "Entities are publicly visible" ON "public"."tweet_media" FOR SELECT USING (true);



CREATE POLICY "Entities are publicly visible" ON "public"."tweet_urls" FOR SELECT USING (true);



CREATE POLICY "Entities are publicly visible" ON "public"."user_mentions" FOR SELECT USING (true);



CREATE POLICY "Public can view opted-in users" ON "public"."optin" FOR SELECT USING (("opted_in" = true));



CREATE POLICY "Public read access" ON "public"."conversations" FOR SELECT USING (true);



CREATE POLICY "Users can create own opt-in record" ON "public"."optin" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own opt-in status" ON "public"."optin" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own opt-in status" ON "public"."optin" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."all_account" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."all_profile" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anyone can read tweets" ON "public"."tweets" FOR SELECT USING (true);



ALTER TABLE "public"."archive_upload" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."followers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."following" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."liked_tweets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mentioned_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."optin" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tweet_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tweet_urls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tweets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_mentions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Allow select for all" ON "tes"."blocked_scraping_users" FOR SELECT USING (true);



ALTER TABLE "tes"."blocked_scraping_users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "ca_website" TO "authenticated";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



GRANT USAGE ON SCHEMA "dev" TO "anon";
GRANT USAGE ON SCHEMA "dev" TO "service_role";
GRANT USAGE ON SCHEMA "dev" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "temp" TO "anon";
GRANT USAGE ON SCHEMA "temp" TO "service_role";
GRANT USAGE ON SCHEMA "temp" TO "authenticated";



GRANT USAGE ON SCHEMA "tes" TO "anon";
GRANT USAGE ON SCHEMA "tes" TO "authenticated";
GRANT USAGE ON SCHEMA "tes" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";



GRANT ALL ON FUNCTION "ca_website"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
























GRANT ALL ON FUNCTION "dev"."apply_dev_entities_rls_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."apply_dev_entities_rls_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."apply_dev_entities_rls_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."apply_dev_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."apply_dev_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."apply_dev_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."apply_dev_rls_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."apply_dev_rls_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."apply_dev_rls_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."commit_temp_data"("p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."commit_temp_data"("p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."commit_temp_data"("p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."create_temp_tables"("p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."create_temp_tables"("p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."create_temp_tables"("p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."delete_all_archives"("p_account_id" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."delete_all_archives"("p_account_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."delete_all_archives"("p_account_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."drop_function_if_exists"("function_name" "text", "function_args" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "dev"."drop_function_if_exists"("function_name" "text", "function_args" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "dev"."drop_function_if_exists"("function_name" "text", "function_args" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "dev"."drop_temp_tables"("p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."drop_temp_tables"("p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."drop_temp_tables"("p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."get_top_accounts_with_followers"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "dev"."get_top_accounts_with_followers"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "dev"."get_top_accounts_with_followers"("limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "dev"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "dev"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "dev"."process_archive"("archive_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "dev"."process_archive"("archive_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "dev"."process_archive"("archive_data" "jsonb") TO "service_role";






























































































































































































































REVOKE ALL ON FUNCTION "private"."get_provider_id_internal"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."apply_public_entities_rls_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_public_entities_rls_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_public_entities_rls_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_public_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_public_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_public_liked_tweets_rls_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_public_rls_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_public_rls_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_public_rls_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_public_rls_policies_not_private"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_public_rls_policies_not_private"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_public_rls_policies_not_private"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_readonly_rls_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_readonly_rls_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_readonly_rls_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."commit_temp_data"("p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."commit_temp_data"("p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."commit_temp_data"("p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_hourly_scraping_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_temp_tables"("p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_temp_tables"("p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_temp_tables"("p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_tweets"("p_tweet_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_tweets"("p_tweet_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_tweets"("p_tweet_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user_archive"("p_account_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user_archive"("p_account_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_archive"("p_account_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."drop_all_policies"("schema_name" "text", "table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."drop_all_policies"("schema_name" "text", "table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."drop_all_policies"("schema_name" "text", "table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."drop_temp_tables"("p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."drop_temp_tables"("p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."drop_temp_tables"("p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_most_liked_tweets_archive_users"("username_" "text", "limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_most_liked_tweets_archive_users"("username_" "text", "limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_most_liked_tweets_archive_users"("username_" "text", "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_most_mentioned_accounts"("username_" "text", "limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_most_mentioned_accounts"("username_" "text", "limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_most_mentioned_accounts"("username_" "text", "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_most_replied_tweets_by_archive_users"("username_" "text", "limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_most_replied_tweets_by_archive_users"("username_" "text", "limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_most_replied_tweets_by_archive_users"("username_" "text", "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_top_favorite_count_tweets"("username_" "text", "limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_top_favorite_count_tweets"("username_" "text", "limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_top_favorite_count_tweets"("username_" "text", "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_top_retweet_count_tweets"("username_" "text", "limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_top_retweet_count_tweets"("username_" "text", "limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_top_retweet_count_tweets"("username_" "text", "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hourly_scraping_stats"("p_hours_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_hourly_scraping_stats"("p_hours_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hourly_scraping_stats"("p_hours_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hourly_stats_simple"("p_hours_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_hourly_stats_simple"("p_hours_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hourly_stats_simple"("p_hours_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_main_thread"("p_conversation_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_main_thread"("p_conversation_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_main_thread"("p_conversation_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_tweet_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_tweet_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_tweet_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_tweet_counts_fast"("p_account_id" "text", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_tweet_counts_fast"("p_account_id" "text", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_tweet_counts_fast"("p_account_id" "text", "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_most_liked_tweets_by_username"("username_" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_most_liked_tweets_by_username"("username_" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_most_liked_tweets_by_username"("username_" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_most_mentioned_accounts_by_username"("username_" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_most_mentioned_accounts_by_username"("username_" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_most_mentioned_accounts_by_username"("username_" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_scraper_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_scraper_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_scraper_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_simple_streamed_tweet_counts"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_simple_streamed_tweet_counts"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_simple_streamed_tweet_counts"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_granularity" "text", "p_streamed_only" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_granularity" "text", "p_streamed_only" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_granularity" "text", "p_streamed_only" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone, "p_granularity" "text", "p_streamed_only" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats_daily"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats_daily"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_daily"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_daily"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats_daily_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats_daily_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_daily_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_daily_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats_hourly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats_hourly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_hourly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_hourly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats_hourly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats_hourly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_hourly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_hourly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats_weekly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats_weekly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_weekly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_weekly"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_streaming_stats_weekly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streaming_stats_weekly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_weekly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_streaming_stats_weekly_streamed_only"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_liked_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_liked_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_liked_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_mentioned_users"("limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_mentioned_users"("limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_mentioned_users"("limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_retweeted_tweets_by_username"("username_" "text", "limit_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_retweeted_tweets_by_username"("username_" "text", "limit_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_retweeted_tweets_by_username"("username_" "text", "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_trending_tweets"("hours_back" integer, "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_trending_tweets"("hours_back" integer, "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trending_tweets"("hours_back" integer, "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tweet_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tweet_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tweet_counts_by_granularity"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unique_scraper_count"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_unique_scraper_count"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unique_scraper_count"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_keep_private" boolean, "p_upload_likes" boolean, "p_start_date" "date", "p_end_date" "date", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_keep_private" boolean, "p_upload_likes" boolean, "p_start_date" "date", "p_end_date" "date", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_keep_private" boolean, "p_upload_likes" boolean, "p_start_date" "date", "p_end_date" "date", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgaudit_ddl_command_end"() TO "postgres";
GRANT ALL ON FUNCTION "public"."pgaudit_ddl_command_end"() TO "anon";
GRANT ALL ON FUNCTION "public"."pgaudit_ddl_command_end"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgaudit_ddl_command_end"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pgaudit_sql_drop"() TO "postgres";
GRANT ALL ON FUNCTION "public"."pgaudit_sql_drop"() TO "anon";
GRANT ALL ON FUNCTION "public"."pgaudit_sql_drop"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgaudit_sql_drop"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_archive"("archive_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."process_archive"("archive_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_archive"("archive_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_tweets"("search_query" "text", "limit_count" integer, "account_filter" "text", "date_from" timestamp without time zone, "date_to" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."search_tweets"("search_query" "text", "limit_count" integer, "account_filter" "text", "date_from" timestamp without time zone, "date_to" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_tweets"("search_query" "text", "limit_count" integer, "account_filter" "text", "date_from" timestamp without time zone, "date_to" timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "limit_" integer, "offset_" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "limit_" integer, "offset_" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "limit_" integer, "offset_" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_meta_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_meta_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_meta_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_commit_temp_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_commit_temp_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_commit_temp_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_foreign_keys"("old_table_name" "text", "new_table_name" "text", "schema_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_foreign_keys"("old_table_name" "text", "new_table_name" "text", "schema_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_foreign_keys"("old_table_name" "text", "new_table_name" "text", "schema_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_optin_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_optin_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_optin_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_occurrences"("search_word" "text", "start_date" timestamp with time zone, "end_date" timestamp with time zone, "user_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."word_occurrences"("search_word" "text", "start_date" timestamp with time zone, "end_date" timestamp with time zone, "user_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_occurrences"("search_word" "text", "start_date" timestamp with time zone, "end_date" timestamp with time zone, "user_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_current_account_id"() TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_followers"() TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_followings"() TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_moots"() TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_tweet_counts_by_date"() TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_tweets_on_this_day"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "tes"."get_user_intercepted_stats"("days_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "tes"."hash_user_id"("user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "tes"."search_liked_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "min_likes" integer, "min_retweets" integer, "max_likes" integer, "max_retweets" integer, "limit_" integer) TO "service_role";



GRANT ALL ON FUNCTION "tes"."search_tweets"("search_query" "text", "from_user" "text", "to_user" "text", "since_date" "date", "until_date" "date", "min_likes" integer, "min_retweets" integer, "max_likes" integer, "max_retweets" integer, "limit_" integer) TO "service_role";



GRANT SELECT ON TABLE "ca_website"."scraping_stats" TO "authenticated";






























GRANT ALL ON TABLE "public"."all_account" TO "anon";
GRANT ALL ON TABLE "public"."all_account" TO "authenticated";
GRANT ALL ON TABLE "public"."all_account" TO "service_role";



GRANT ALL ON TABLE "public"."archive_upload" TO "anon";
GRANT ALL ON TABLE "public"."archive_upload" TO "authenticated";
GRANT ALL ON TABLE "public"."archive_upload" TO "service_role";



GRANT ALL ON TABLE "public"."account" TO "anon";
GRANT ALL ON TABLE "public"."account" TO "authenticated";
GRANT ALL ON TABLE "public"."account" TO "service_role";



GRANT ALL ON TABLE "public"."likes" TO "anon";
GRANT ALL ON TABLE "public"."likes" TO "authenticated";
GRANT ALL ON TABLE "public"."likes" TO "service_role";



GRANT ALL ON TABLE "public"."mentioned_users" TO "anon";
GRANT ALL ON TABLE "public"."mentioned_users" TO "authenticated";
GRANT ALL ON TABLE "public"."mentioned_users" TO "service_role";



GRANT ALL ON TABLE "public"."tweets" TO "anon";
GRANT ALL ON TABLE "public"."tweets" TO "authenticated";
GRANT ALL ON TABLE "public"."tweets" TO "service_role";



GRANT ALL ON TABLE "public"."user_mentions" TO "anon";
GRANT ALL ON TABLE "public"."user_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."account_activity_summary" TO "anon";
GRANT ALL ON TABLE "public"."account_activity_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."account_activity_summary" TO "service_role";



GRANT ALL ON TABLE "public"."all_profile" TO "anon";
GRANT ALL ON TABLE "public"."all_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."all_profile" TO "service_role";



GRANT ALL ON SEQUENCE "public"."archive_upload_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."archive_upload_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."archive_upload_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."tweet_urls" TO "anon";
GRANT ALL ON TABLE "public"."tweet_urls" TO "authenticated";
GRANT ALL ON TABLE "public"."tweet_urls" TO "service_role";



GRANT ALL ON TABLE "public"."quote_tweets" TO "anon";
GRANT ALL ON TABLE "public"."quote_tweets" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_tweets" TO "service_role";



GRANT ALL ON TABLE "public"."enriched_tweets" TO "anon";
GRANT ALL ON TABLE "public"."enriched_tweets" TO "authenticated";
GRANT ALL ON TABLE "public"."enriched_tweets" TO "service_role";



GRANT ALL ON TABLE "public"."followers" TO "anon";
GRANT ALL ON TABLE "public"."followers" TO "authenticated";
GRANT ALL ON TABLE "public"."followers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."followers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."followers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."followers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."following" TO "anon";
GRANT ALL ON TABLE "public"."following" TO "authenticated";
GRANT ALL ON TABLE "public"."following" TO "service_role";



GRANT ALL ON SEQUENCE "public"."following_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."following_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."following_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."global_activity_summary" TO "anon";
GRANT ALL ON TABLE "public"."global_activity_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."global_activity_summary" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_tweet_counts_mv" TO "anon";
GRANT ALL ON TABLE "public"."monthly_tweet_counts_mv" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_tweet_counts_mv" TO "service_role";



GRANT ALL ON TABLE "public"."global_monthly_tweet_counts" TO "anon";
GRANT ALL ON TABLE "public"."global_monthly_tweet_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."global_monthly_tweet_counts" TO "service_role";



GRANT ALL ON TABLE "public"."liked_tweets" TO "anon";
GRANT ALL ON TABLE "public"."liked_tweets" TO "authenticated";
GRANT ALL ON TABLE "public"."liked_tweets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."likes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."likes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."likes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."optin" TO "anon";
GRANT ALL ON TABLE "public"."optin" TO "authenticated";
GRANT ALL ON TABLE "public"."optin" TO "service_role";



GRANT ALL ON TABLE "public"."profile" TO "anon";
GRANT ALL ON TABLE "public"."profile" TO "authenticated";
GRANT ALL ON TABLE "public"."profile" TO "service_role";



GRANT ALL ON TABLE "public"."scraper_count" TO "anon";
GRANT ALL ON TABLE "public"."scraper_count" TO "authenticated";
GRANT ALL ON TABLE "public"."scraper_count" TO "service_role";



GRANT ALL ON TABLE "public"."tweet_media" TO "anon";
GRANT ALL ON TABLE "public"."tweet_media" TO "authenticated";
GRANT ALL ON TABLE "public"."tweet_media" TO "service_role";



GRANT ALL ON TABLE "public"."tweet_replies_view" TO "anon";
GRANT ALL ON TABLE "public"."tweet_replies_view" TO "authenticated";
GRANT ALL ON TABLE "public"."tweet_replies_view" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tweet_urls_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tweet_urls_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tweet_urls_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tweets_w_conversation_id" TO "anon";
GRANT ALL ON TABLE "public"."tweets_w_conversation_id" TO "authenticated";
GRANT ALL ON TABLE "public"."tweets_w_conversation_id" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_mentions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_mentions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_mentions_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."account_1360327512031711237" TO "anon";
GRANT ALL ON TABLE "temp"."account_1360327512031711237" TO "authenticated";
GRANT ALL ON TABLE "temp"."account_1360327512031711237" TO "service_role";



GRANT ALL ON TABLE "temp"."account_19068614" TO "anon";
GRANT ALL ON TABLE "temp"."account_19068614" TO "authenticated";
GRANT ALL ON TABLE "temp"."account_19068614" TO "service_role";



GRANT ALL ON TABLE "temp"."account_2963358137" TO "anon";
GRANT ALL ON TABLE "temp"."account_2963358137" TO "authenticated";
GRANT ALL ON TABLE "temp"."account_2963358137" TO "service_role";



GRANT ALL ON TABLE "temp"."archive_upload_1360327512031711237" TO "anon";
GRANT ALL ON TABLE "temp"."archive_upload_1360327512031711237" TO "authenticated";
GRANT ALL ON TABLE "temp"."archive_upload_1360327512031711237" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."archive_upload_1360327512031711237_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."archive_upload_1360327512031711237_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."archive_upload_1360327512031711237_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."archive_upload_19068614" TO "anon";
GRANT ALL ON TABLE "temp"."archive_upload_19068614" TO "authenticated";
GRANT ALL ON TABLE "temp"."archive_upload_19068614" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."archive_upload_19068614_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."archive_upload_19068614_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."archive_upload_19068614_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."archive_upload_2963358137" TO "anon";
GRANT ALL ON TABLE "temp"."archive_upload_2963358137" TO "authenticated";
GRANT ALL ON TABLE "temp"."archive_upload_2963358137" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."archive_upload_2963358137_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."archive_upload_2963358137_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."archive_upload_2963358137_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."followers_1360327512031711237" TO "anon";
GRANT ALL ON TABLE "temp"."followers_1360327512031711237" TO "authenticated";
GRANT ALL ON TABLE "temp"."followers_1360327512031711237" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."followers_1360327512031711237_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."followers_1360327512031711237_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."followers_1360327512031711237_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."followers_19068614" TO "anon";
GRANT ALL ON TABLE "temp"."followers_19068614" TO "authenticated";
GRANT ALL ON TABLE "temp"."followers_19068614" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."followers_19068614_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."followers_19068614_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."followers_19068614_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."followers_2963358137" TO "anon";
GRANT ALL ON TABLE "temp"."followers_2963358137" TO "authenticated";
GRANT ALL ON TABLE "temp"."followers_2963358137" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."followers_2963358137_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."followers_2963358137_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."followers_2963358137_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."following_1360327512031711237" TO "anon";
GRANT ALL ON TABLE "temp"."following_1360327512031711237" TO "authenticated";
GRANT ALL ON TABLE "temp"."following_1360327512031711237" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."following_1360327512031711237_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."following_1360327512031711237_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."following_1360327512031711237_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."following_19068614" TO "anon";
GRANT ALL ON TABLE "temp"."following_19068614" TO "authenticated";
GRANT ALL ON TABLE "temp"."following_19068614" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."following_19068614_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."following_19068614_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."following_19068614_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."following_2963358137" TO "anon";
GRANT ALL ON TABLE "temp"."following_2963358137" TO "authenticated";
GRANT ALL ON TABLE "temp"."following_2963358137" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."following_2963358137_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."following_2963358137_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."following_2963358137_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."liked_tweets_1360327512031711237" TO "anon";
GRANT ALL ON TABLE "temp"."liked_tweets_1360327512031711237" TO "authenticated";
GRANT ALL ON TABLE "temp"."liked_tweets_1360327512031711237" TO "service_role";



GRANT ALL ON TABLE "temp"."liked_tweets_19068614" TO "anon";
GRANT ALL ON TABLE "temp"."liked_tweets_19068614" TO "authenticated";
GRANT ALL ON TABLE "temp"."liked_tweets_19068614" TO "service_role";



GRANT ALL ON TABLE "temp"."liked_tweets_2963358137" TO "anon";
GRANT ALL ON TABLE "temp"."liked_tweets_2963358137" TO "authenticated";
GRANT ALL ON TABLE "temp"."liked_tweets_2963358137" TO "service_role";



GRANT ALL ON TABLE "temp"."likes_1360327512031711237" TO "anon";
GRANT ALL ON TABLE "temp"."likes_1360327512031711237" TO "authenticated";
GRANT ALL ON TABLE "temp"."likes_1360327512031711237" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."likes_1360327512031711237_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."likes_1360327512031711237_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."likes_1360327512031711237_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."likes_19068614" TO "anon";
GRANT ALL ON TABLE "temp"."likes_19068614" TO "authenticated";
GRANT ALL ON TABLE "temp"."likes_19068614" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."likes_19068614_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."likes_19068614_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."likes_19068614_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."likes_2963358137" TO "anon";
GRANT ALL ON TABLE "temp"."likes_2963358137" TO "authenticated";
GRANT ALL ON TABLE "temp"."likes_2963358137" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."likes_2963358137_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."likes_2963358137_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."likes_2963358137_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."mentioned_users_1360327512031711237" TO "anon";
GRANT ALL ON TABLE "temp"."mentioned_users_1360327512031711237" TO "authenticated";
GRANT ALL ON TABLE "temp"."mentioned_users_1360327512031711237" TO "service_role";



GRANT ALL ON TABLE "temp"."mentioned_users_19068614" TO "anon";
GRANT ALL ON TABLE "temp"."mentioned_users_19068614" TO "authenticated";
GRANT ALL ON TABLE "temp"."mentioned_users_19068614" TO "service_role";



GRANT ALL ON TABLE "temp"."mentioned_users_2963358137" TO "anon";
GRANT ALL ON TABLE "temp"."mentioned_users_2963358137" TO "authenticated";
GRANT ALL ON TABLE "temp"."mentioned_users_2963358137" TO "service_role";



GRANT ALL ON TABLE "temp"."profile_1360327512031711237" TO "anon";
GRANT ALL ON TABLE "temp"."profile_1360327512031711237" TO "authenticated";
GRANT ALL ON TABLE "temp"."profile_1360327512031711237" TO "service_role";



GRANT ALL ON TABLE "temp"."profile_19068614" TO "anon";
GRANT ALL ON TABLE "temp"."profile_19068614" TO "authenticated";
GRANT ALL ON TABLE "temp"."profile_19068614" TO "service_role";



GRANT ALL ON TABLE "temp"."profile_2963358137" TO "anon";
GRANT ALL ON TABLE "temp"."profile_2963358137" TO "authenticated";
GRANT ALL ON TABLE "temp"."profile_2963358137" TO "service_role";



GRANT ALL ON TABLE "temp"."tweet_media_1360327512031711237" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_media_1360327512031711237" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_media_1360327512031711237" TO "service_role";



GRANT ALL ON TABLE "temp"."tweet_media_19068614" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_media_19068614" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_media_19068614" TO "service_role";



GRANT ALL ON TABLE "temp"."tweet_media_2963358137" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_media_2963358137" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_media_2963358137" TO "service_role";



GRANT ALL ON TABLE "temp"."tweet_urls_1360327512031711237" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_urls_1360327512031711237" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_urls_1360327512031711237" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."tweet_urls_1360327512031711237_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_1360327512031711237_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_1360327512031711237_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."tweet_urls_19068614" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_urls_19068614" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_urls_19068614" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."tweet_urls_19068614_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_19068614_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_19068614_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."tweet_urls_2963358137" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_urls_2963358137" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_urls_2963358137" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."tweet_urls_2963358137_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_2963358137_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_2963358137_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."tweets_1360327512031711237" TO "anon";
GRANT ALL ON TABLE "temp"."tweets_1360327512031711237" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweets_1360327512031711237" TO "service_role";



GRANT ALL ON TABLE "temp"."tweets_19068614" TO "anon";
GRANT ALL ON TABLE "temp"."tweets_19068614" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweets_19068614" TO "service_role";



GRANT ALL ON TABLE "temp"."tweets_2963358137" TO "anon";
GRANT ALL ON TABLE "temp"."tweets_2963358137" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweets_2963358137" TO "service_role";



GRANT ALL ON TABLE "temp"."user_mentions_1360327512031711237" TO "anon";
GRANT ALL ON TABLE "temp"."user_mentions_1360327512031711237" TO "authenticated";
GRANT ALL ON TABLE "temp"."user_mentions_1360327512031711237" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."user_mentions_1360327512031711237_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."user_mentions_1360327512031711237_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."user_mentions_1360327512031711237_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."user_mentions_19068614" TO "anon";
GRANT ALL ON TABLE "temp"."user_mentions_19068614" TO "authenticated";
GRANT ALL ON TABLE "temp"."user_mentions_19068614" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."user_mentions_19068614_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."user_mentions_19068614_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."user_mentions_19068614_id_seq" TO "service_role";



GRANT ALL ON TABLE "temp"."user_mentions_2963358137" TO "anon";
GRANT ALL ON TABLE "temp"."user_mentions_2963358137" TO "authenticated";
GRANT ALL ON TABLE "temp"."user_mentions_2963358137" TO "service_role";



GRANT ALL ON SEQUENCE "temp"."user_mentions_2963358137_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."user_mentions_2963358137_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."user_mentions_2963358137_id_seq" TO "service_role";



GRANT SELECT ON TABLE "tes"."blocked_scraping_users" TO "anon";
GRANT SELECT ON TABLE "tes"."blocked_scraping_users" TO "authenticated";
GRANT ALL ON TABLE "tes"."blocked_scraping_users" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "dev" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "dev" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "dev" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "dev" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "dev" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "dev" GRANT ALL ON FUNCTIONS  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "dev" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "dev" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "dev" GRANT ALL ON TABLES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON FUNCTIONS  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "temp" GRANT ALL ON TABLES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tes" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tes" GRANT ALL ON FUNCTIONS  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tes" GRANT SELECT ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tes" GRANT SELECT ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tes" GRANT ALL ON TABLES  TO "service_role";



























RESET ALL;
