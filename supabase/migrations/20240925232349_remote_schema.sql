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
CREATE SCHEMA IF NOT EXISTS "dev";
ALTER SCHEMA "dev" OWNER TO "postgres";
-- Create pgsodium extension only if available (not in preview environments)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";
EXCEPTION
    WHEN undefined_file THEN
        RAISE NOTICE 'pgsodium extension not available, skipping...';
END $$;
CREATE SCHEMA IF NOT EXISTS "private";
ALTER SCHEMA "private" OWNER TO "postgres";
COMMENT ON SCHEMA "public" IS 'standard public schema';
CREATE SCHEMA IF NOT EXISTS "temp";
ALTER SCHEMA "temp" OWNER TO "postgres";
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
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
CREATE OR REPLACE FUNCTION "public"."apply_public_entities_rls_policies"("schema_name" "text", "table_name" "text") RETURNS "void"
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
                FROM public.tweets dt 
                WHERE dt.tweet_id = %I.tweet_id 
                AND dt.account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
            )
        ) 
        WITH CHECK (
            EXISTS (
                SELECT 1 
                FROM public.tweets dt 
                WHERE dt.tweet_id = %I.tweet_id 
                AND dt.account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
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
ALTER FUNCTION "public"."apply_public_rls_policies"("schema_name" "text", "table_name" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."commit_temp_data"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '30min'
    AS $_$
DECLARE
    v_archive_upload_id BIGINT;
    v_account_id TEXT;
    v_archive_at TIMESTAMP WITH TIME ZONE;
BEGIN
    RAISE LOG 'Starting commit_temp_data function with suffix: %', p_suffix;

    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 1. Insert account data first
    RAISE LOG 'Inserting account data';
    EXECUTE format('
        INSERT INTO public.account (created_via, username, account_id, created_at, account_display_name)
        SELECT created_via, username, account_id, created_at, account_display_name 
        FROM temp.account_%s
        ON CONFLICT (account_id) DO UPDATE SET 
            username = EXCLUDED.username, 
            account_display_name = EXCLUDED.account_display_name, 
            created_via = EXCLUDED.created_via, 
            created_at = EXCLUDED.created_at
        RETURNING account_id
    ', p_suffix) INTO v_account_id;
    RAISE LOG 'Account data inserted, account_id: %', v_account_id;

    -- 2. Get the latest archive_at from temp.archive_upload
    RAISE LOG 'Getting latest archive_at';
    EXECUTE format('
        SELECT archive_at 
        FROM temp.archive_upload_%s 
        ORDER BY archive_at DESC 
        LIMIT 1
    ', p_suffix) INTO v_archive_at;
    RAISE LOG 'Latest archive_at: %', v_archive_at;

    -- 3. Insert or update archive_upload and get the ID
    RAISE LOG 'Inserting or updating archive_upload';
    INSERT INTO public.archive_upload (account_id, archive_at, created_at)
    VALUES (v_account_id, v_archive_at, CURRENT_TIMESTAMP)
    ON CONFLICT (account_id, archive_at) 
    DO UPDATE SET 
        account_id = EXCLUDED.account_id,
        created_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_archive_upload_id;
    RAISE LOG 'Archive upload inserted or updated, id: %', v_archive_upload_id;

    -- Insert profile data
    RAISE LOG 'Inserting profile data';
    EXECUTE format('
        INSERT INTO public.profile (bio, website, location, avatar_media_url, header_media_url, account_id, archive_upload_id)
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
    RAISE LOG 'Profile data inserted';

    -- Insert tweets data
    RAISE LOG 'Inserting tweets data';
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
    RAISE LOG 'Tweets data inserted';

    -- Insert tweet_media data
    RAISE LOG 'Inserting tweet_media data';
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
    RAISE LOG 'Tweet_media data inserted';

    -- Insert mentioned_users data
    RAISE LOG 'Inserting mentioned_users data';
    EXECUTE format('
        INSERT INTO public.mentioned_users (user_id, name, screen_name, updated_at)
        SELECT user_id, name, screen_name, updated_at
        FROM temp.mentioned_users_%s
        ON CONFLICT (user_id) DO UPDATE SET 
            name = EXCLUDED.name, 
            screen_name = EXCLUDED.screen_name, 
            updated_at = EXCLUDED.updated_at
    ', p_suffix);
    RAISE LOG 'Mentioned_users data inserted';

    -- Insert user_mentions data
    RAISE LOG 'Inserting user_mentions data';
    EXECUTE format('
        INSERT INTO public.user_mentions (mentioned_user_id, tweet_id)
        SELECT um.mentioned_user_id, um.tweet_id
        FROM temp.user_mentions_%s um
        JOIN public.mentioned_users mu ON um.mentioned_user_id = mu.user_id
        JOIN public.tweets t ON um.tweet_id = t.tweet_id
        ON CONFLICT (mentioned_user_id, tweet_id) DO NOTHING
    ', p_suffix);
    RAISE LOG 'User_mentions data inserted';

    -- Insert tweet_urls data
    RAISE LOG 'Inserting tweet_urls data';
    EXECUTE format('
        INSERT INTO public.tweet_urls (url, expanded_url, display_url, tweet_id)
        SELECT tu.url, tu.expanded_url, tu.display_url, tu.tweet_id
        FROM temp.tweet_urls_%s tu
        JOIN public.tweets t ON tu.tweet_id = t.tweet_id
        ON CONFLICT (tweet_id, url) DO NOTHING
    ', p_suffix);
    RAISE LOG 'Tweet_urls data inserted';

    -- Insert followers data
    RAISE LOG 'Inserting followers data';
    EXECUTE format('
        INSERT INTO public.followers (account_id, follower_account_id, archive_upload_id)
        SELECT f.account_id, f.follower_account_id, $1
        FROM temp.followers_%s f
        ON CONFLICT (account_id, follower_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE LOG 'Followers data inserted';

    -- Insert following data
    RAISE LOG 'Inserting following data';
    EXECUTE format('
        INSERT INTO public.following (account_id, following_account_id, archive_upload_id)
        SELECT f.account_id, f.following_account_id, $1
        FROM temp.following_%s f
        ON CONFLICT (account_id, following_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE LOG 'Following data inserted';

    -- Insert liked_tweets data
    RAISE LOG 'Inserting liked_tweets data';
    EXECUTE format('
        INSERT INTO public.liked_tweets (tweet_id, full_text)
        SELECT lt.tweet_id, lt.full_text
        FROM temp.liked_tweets_%s lt
        ON CONFLICT (tweet_id) DO NOTHING
    ', p_suffix);
    RAISE LOG 'Liked_tweets data inserted';

    -- Insert likes data
    RAISE LOG 'Inserting likes data';
    EXECUTE format('
        INSERT INTO public.likes (account_id, liked_tweet_id, archive_upload_id)
        SELECT l.account_id, l.liked_tweet_id, $1
        FROM temp.likes_%s l
        ON CONFLICT (account_id, liked_tweet_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    RAISE LOG 'Likes data inserted';

    RAISE LOG 'commit_temp_data function completed successfully';
END;
$_$;
ALTER FUNCTION "public"."commit_temp_data"("p_suffix" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."create_temp_tables"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  BEGIN
      -- Check if the user is authenticated or is the postgres role
      IF auth.uid() IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF p_suffix != (auth.jwt() -> 'app_metadata' ->> 'provider_id') AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authorized to process this archive';
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
CREATE OR REPLACE FUNCTION "public"."delete_all_archives"("p_account_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "statement_timeout" TO '20min'
    AS $_$
DECLARE
    v_schema_name TEXT := 'public';
BEGIN
    -- Use a single transaction for all operations
    BEGIN
        EXECUTE format('
            -- Delete from dependent tables first
            DELETE FROM public.user_mentions WHERE tweet_id IN (SELECT tweet_id FROM public.tweets WHERE account_id = $1);
            DELETE FROM public.tweet_urls WHERE tweet_id IN (SELECT tweet_id FROM public.tweets WHERE account_id = $1);
            DELETE FROM public.tweet_media WHERE tweet_id IN (SELECT tweet_id FROM public.tweets WHERE account_id = $1);
            DELETE FROM public.likes WHERE account_id = $1;
            DELETE FROM public.tweets WHERE account_id = $1;
            DELETE FROM public.followers WHERE account_id = $1;
            DELETE FROM public.following WHERE account_id = $1;
            DELETE FROM public.profile WHERE account_id = $1;
            DELETE FROM public.archive_upload WHERE account_id = $1;
            DELETE FROM public.account WHERE account_id = $1;
        ')
        USING p_account_id;

    EXCEPTION WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE NOTICE 'Error deleting archives for account %: %', p_account_id, SQLERRM;
        RAISE;
    END;
END;
$_$;
ALTER FUNCTION "public"."delete_all_archives"("p_account_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."drop_temp_tables"("p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '30min'
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
ALTER FUNCTION "public"."drop_temp_tables"("p_suffix" "text") OWNER TO "postgres";
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
        public.profile p ON a.account_id = p.account_id
    WHERE 
        t.reply_to_tweet_id IS NULL
        AND (p_account_id IS NULL OR t.account_id = p_account_id)
    ORDER BY 
        t.created_at DESC
    LIMIT COUNT;
END;
$$;
ALTER FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) RETURNS TABLE("account_id" "text", "created_via" "text", "username" "text", "created_at" timestamp with time zone, "account_display_name" "text", "avatar_media_url" "text", "bio" "text", "website" "text", "location" "text", "header_media_url" "text", "follower_count" bigint)
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
    WHERE 
        p.archive_upload_id = (
            SELECT MAX(p2.archive_upload_id)
            FROM public.profile p2
            WHERE p2.account_id = a.account_id
        )
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
ALTER FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) OWNER TO "postgres";
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
CREATE OR REPLACE FUNCTION "public"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
ALTER FUNCTION "public"."insert_temp_account"("p_account" "jsonb", "p_suffix" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_suffix" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
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
ALTER FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_suffix" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
ALTER FUNCTION "public"."insert_temp_followers"("p_followers" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
ALTER FUNCTION "public"."insert_temp_following"("p_following" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
  BEGIN
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
ALTER FUNCTION "public"."insert_temp_likes"("p_likes" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
ALTER FUNCTION "public"."insert_temp_profiles"("p_profile" "jsonb", "p_account_id" "text", "p_suffix" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."insert_temp_tweets"("p_tweets" "jsonb", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
  BEGIN
    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    -- raise exception 'debug % ', (
    --   SELECT jsonb_pretty(jsonb_agg(tweet->'id_str'))
    --   FROM jsonb_array_elements($1) AS tweet
    -- );
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
CREATE OR REPLACE FUNCTION "public"."pg_search_tweets"("search_query" "text", "p_account_id" "text" DEFAULT NULL::"text") RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "username" "text", "account_display_name" "text", "avatar_media_url" "text")
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
        a.username, 
        a.account_display_name, 
        p.avatar_media_url
    FROM 
        public.tweets t
    INNER JOIN 
        public.account a ON t.account_id = a.account_id
    LEFT JOIN 
        public.profile p ON a.account_id = p.account_id
    WHERE 
        to_tsvector('english', t.full_text) @@ to_tsquery('english', '''' || replace(search_query, '''', '''''') || '''')
        OR t.full_text ILIKE '%' || search_query || '%'
    ORDER BY 
        t.created_at DESC
    LIMIT 100;
END; 
$$;
ALTER FUNCTION "public"."pg_search_tweets"("search_query" "text", "p_account_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."pg_search_tweets_with_trigram"("search_query" "text", "p_account_id" "text" DEFAULT NULL::"text") RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "username" "text", "account_display_name" "text", "avatar_media_url" "text")
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
        a.username, 
        a.account_display_name, 
        p.avatar_media_url
    FROM 
        public.tweets t
    INNER JOIN 
        public.account a ON t.account_id = a.account_id
    LEFT JOIN 
        public.profile p ON a.account_id = p.account_id
    WHERE 
        t.full_text % search_query
    ORDER BY 
        similarity(t.full_text, search_query) DESC,
        t.created_at DESC
    LIMIT 100;
END; 
$$;
ALTER FUNCTION "public"."pg_search_tweets_with_trigram"("search_query" "text", "p_account_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
SET default_tablespace = '';
SET default_table_access_method = "heap";
CREATE TABLE IF NOT EXISTS "dev"."account" (
    "account_id" "text" NOT NULL,
    "created_via" "text" NOT NULL,
    "username" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "account_display_name" "text" NOT NULL
);
ALTER TABLE "dev"."account" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "dev"."archive_upload" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "archive_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "dev"."archive_upload" OWNER TO "postgres";
ALTER TABLE "dev"."archive_upload" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "dev"."archive_upload_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "dev"."followers" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "follower_account_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "dev"."followers" OWNER TO "postgres";
ALTER TABLE "dev"."followers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "dev"."followers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "dev"."following" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "following_account_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "dev"."following" OWNER TO "postgres";
ALTER TABLE "dev"."following" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "dev"."following_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "dev"."liked_tweets" (
    "tweet_id" "text" NOT NULL,
    "full_text" "text" NOT NULL
);
ALTER TABLE "dev"."liked_tweets" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "dev"."likes" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "liked_tweet_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "dev"."likes" OWNER TO "postgres";
ALTER TABLE "dev"."likes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "dev"."likes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "dev"."mentioned_users" (
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "screen_name" "text" NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE "dev"."mentioned_users" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "dev"."profile" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "bio" "text",
    "website" "text",
    "location" "text",
    "avatar_media_url" "text",
    "header_media_url" "text",
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "dev"."profile" OWNER TO "postgres";
ALTER TABLE "dev"."profile" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "dev"."profile_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "dev"."tweet_media" (
    "media_id" bigint NOT NULL,
    "tweet_id" "text" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "dev"."tweet_media" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "dev"."tweet_urls" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "expanded_url" "text" NOT NULL,
    "display_url" "text" NOT NULL,
    "tweet_id" "text" NOT NULL
);
ALTER TABLE "dev"."tweet_urls" OWNER TO "postgres";
ALTER TABLE "dev"."tweet_urls" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "dev"."tweet_urls_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "dev"."tweets" (
    "tweet_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "full_text" "text" NOT NULL,
    "retweet_count" integer NOT NULL,
    "favorite_count" integer NOT NULL,
    "reply_to_tweet_id" "text",
    "reply_to_user_id" "text",
    "reply_to_username" "text",
    "archive_upload_id" bigint NOT NULL,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED
);
ALTER TABLE "dev"."tweets" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "dev"."user_mentions" (
    "id" bigint NOT NULL,
    "mentioned_user_id" "text" NOT NULL,
    "tweet_id" "text" NOT NULL
);
ALTER TABLE "dev"."user_mentions" OWNER TO "postgres";
ALTER TABLE "dev"."user_mentions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "dev"."user_mentions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."account" (
    "account_id" "text" NOT NULL,
    "created_via" "text" NOT NULL,
    "username" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "account_display_name" "text" NOT NULL,
    "num_tweets" integer DEFAULT 0,
    "num_following" integer DEFAULT 0,
    "num_followers" integer DEFAULT 0,
    "num_likes" integer DEFAULT 0
);
ALTER TABLE "public"."account" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."archive_upload" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "archive_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "public"."archive_upload" OWNER TO "postgres";
ALTER TABLE "public"."archive_upload" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."archive_upload_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."followers" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "follower_account_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
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
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "public"."following" OWNER TO "postgres";
ALTER TABLE "public"."following" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."following_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."liked_tweets" (
    "tweet_id" "text" NOT NULL,
    "full_text" "text" NOT NULL
);
ALTER TABLE "public"."liked_tweets" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."likes" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "liked_tweet_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "public"."likes" OWNER TO "postgres";
ALTER TABLE "public"."likes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."likes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."mentioned_users" (
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "screen_name" "text" NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE "public"."mentioned_users" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."profile" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "bio" "text",
    "website" "text",
    "location" "text",
    "avatar_media_url" "text",
    "header_media_url" "text",
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "public"."profile" OWNER TO "postgres";
ALTER TABLE "public"."profile" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."profile_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."tweet_media" (
    "media_id" bigint NOT NULL,
    "tweet_id" "text" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "public"."tweet_media" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."tweet_urls" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "expanded_url" "text" NOT NULL,
    "display_url" "text" NOT NULL,
    "tweet_id" "text" NOT NULL
);
ALTER TABLE "public"."tweet_urls" OWNER TO "postgres";
ALTER TABLE "public"."tweet_urls" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tweet_urls_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
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
    "archive_upload_id" bigint NOT NULL,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED
);
ALTER TABLE "public"."tweets" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."user_mentions" (
    "id" bigint NOT NULL,
    "mentioned_user_id" "text" NOT NULL,
    "tweet_id" "text" NOT NULL
);
ALTER TABLE "public"."user_mentions" OWNER TO "postgres";
ALTER TABLE "public"."user_mentions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_mentions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."account_1038586640" (
    "account_id" "text" NOT NULL,
    "created_via" "text" NOT NULL,
    "username" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "account_display_name" "text" NOT NULL,
    "num_tweets" integer DEFAULT 0,
    "num_following" integer DEFAULT 0,
    "num_followers" integer DEFAULT 0,
    "num_likes" integer DEFAULT 0
);
ALTER TABLE "temp"."account_1038586640" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."account_1378862677871751174" (
    "account_id" "text" NOT NULL,
    "created_via" "text" NOT NULL,
    "username" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "account_display_name" "text" NOT NULL,
    "num_tweets" integer DEFAULT 0,
    "num_following" integer DEFAULT 0,
    "num_followers" integer DEFAULT 0,
    "num_likes" integer DEFAULT 0
);
ALTER TABLE "temp"."account_1378862677871751174" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."account_316970336" (
    "account_id" "text" NOT NULL,
    "created_via" "text" NOT NULL,
    "username" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "account_display_name" "text" NOT NULL,
    "num_tweets" integer DEFAULT 0,
    "num_following" integer DEFAULT 0,
    "num_followers" integer DEFAULT 0,
    "num_likes" integer DEFAULT 0
);
ALTER TABLE "temp"."account_316970336" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."archive_upload_1038586640" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "archive_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "temp"."archive_upload_1038586640" OWNER TO "postgres";
ALTER TABLE "temp"."archive_upload_1038586640" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."archive_upload_1038586640_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."archive_upload_1378862677871751174" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "archive_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "temp"."archive_upload_1378862677871751174" OWNER TO "postgres";
ALTER TABLE "temp"."archive_upload_1378862677871751174" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."archive_upload_1378862677871751174_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."archive_upload_316970336" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "archive_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "temp"."archive_upload_316970336" OWNER TO "postgres";
ALTER TABLE "temp"."archive_upload_316970336" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."archive_upload_316970336_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."followers_1038586640" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "follower_account_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."followers_1038586640" OWNER TO "postgres";
ALTER TABLE "temp"."followers_1038586640" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."followers_1038586640_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."followers_1211134623285047297" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "follower_account_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."followers_1211134623285047297" OWNER TO "postgres";
ALTER TABLE "temp"."followers_1211134623285047297" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."followers_1211134623285047297_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."followers_1378862677871751174" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "follower_account_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."followers_1378862677871751174" OWNER TO "postgres";
ALTER TABLE "temp"."followers_1378862677871751174" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."followers_1378862677871751174_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."followers_316970336" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "follower_account_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."followers_316970336" OWNER TO "postgres";
ALTER TABLE "temp"."followers_316970336" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."followers_316970336_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."following_1038586640" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "following_account_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."following_1038586640" OWNER TO "postgres";
ALTER TABLE "temp"."following_1038586640" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."following_1038586640_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."following_1211134623285047297" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "following_account_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."following_1211134623285047297" OWNER TO "postgres";
ALTER TABLE "temp"."following_1211134623285047297" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."following_1211134623285047297_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."following_1378862677871751174" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "following_account_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."following_1378862677871751174" OWNER TO "postgres";
ALTER TABLE "temp"."following_1378862677871751174" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."following_1378862677871751174_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."following_316970336" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "following_account_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."following_316970336" OWNER TO "postgres";
ALTER TABLE "temp"."following_316970336" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."following_316970336_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."liked_tweets_1038586640" (
    "tweet_id" "text" NOT NULL,
    "full_text" "text" NOT NULL
);
ALTER TABLE "temp"."liked_tweets_1038586640" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."liked_tweets_1211134623285047297" (
    "tweet_id" "text" NOT NULL,
    "full_text" "text" NOT NULL
);
ALTER TABLE "temp"."liked_tweets_1211134623285047297" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."liked_tweets_1378862677871751174" (
    "tweet_id" "text" NOT NULL,
    "full_text" "text" NOT NULL
);
ALTER TABLE "temp"."liked_tweets_1378862677871751174" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."liked_tweets_316970336" (
    "tweet_id" "text" NOT NULL,
    "full_text" "text" NOT NULL
);
ALTER TABLE "temp"."liked_tweets_316970336" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."likes_1038586640" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "liked_tweet_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."likes_1038586640" OWNER TO "postgres";
ALTER TABLE "temp"."likes_1038586640" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."likes_1038586640_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."likes_1211134623285047297" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "liked_tweet_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."likes_1211134623285047297" OWNER TO "postgres";
ALTER TABLE "temp"."likes_1211134623285047297" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."likes_1211134623285047297_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."likes_1378862677871751174" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "liked_tweet_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."likes_1378862677871751174" OWNER TO "postgres";
ALTER TABLE "temp"."likes_1378862677871751174" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."likes_1378862677871751174_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."likes_316970336" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "liked_tweet_id" "text" NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."likes_316970336" OWNER TO "postgres";
ALTER TABLE "temp"."likes_316970336" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."likes_316970336_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."mentioned_users_1038586640" (
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "screen_name" "text" NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE "temp"."mentioned_users_1038586640" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."mentioned_users_1211134623285047297" (
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "screen_name" "text" NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE "temp"."mentioned_users_1211134623285047297" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."mentioned_users_1378862677871751174" (
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "screen_name" "text" NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE "temp"."mentioned_users_1378862677871751174" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."mentioned_users_316970336" (
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "screen_name" "text" NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);
ALTER TABLE "temp"."mentioned_users_316970336" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."profile_1038586640" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "bio" "text",
    "website" "text",
    "location" "text",
    "avatar_media_url" "text",
    "header_media_url" "text",
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."profile_1038586640" OWNER TO "postgres";
ALTER TABLE "temp"."profile_1038586640" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."profile_1038586640_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."profile_1211134623285047297" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "bio" "text",
    "website" "text",
    "location" "text",
    "avatar_media_url" "text",
    "header_media_url" "text",
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."profile_1211134623285047297" OWNER TO "postgres";
ALTER TABLE "temp"."profile_1211134623285047297" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."profile_1211134623285047297_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."profile_1378862677871751174" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "bio" "text",
    "website" "text",
    "location" "text",
    "avatar_media_url" "text",
    "header_media_url" "text",
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."profile_1378862677871751174" OWNER TO "postgres";
ALTER TABLE "temp"."profile_1378862677871751174" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."profile_1378862677871751174_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."profile_316970336" (
    "id" bigint NOT NULL,
    "account_id" "text" NOT NULL,
    "bio" "text",
    "website" "text",
    "location" "text",
    "avatar_media_url" "text",
    "header_media_url" "text",
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."profile_316970336" OWNER TO "postgres";
ALTER TABLE "temp"."profile_316970336" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."profile_316970336_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."tweet_media_1038586640" (
    "media_id" bigint NOT NULL,
    "tweet_id" "text" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."tweet_media_1038586640" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."tweet_media_1211134623285047297" (
    "media_id" bigint NOT NULL,
    "tweet_id" "text" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."tweet_media_1211134623285047297" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."tweet_media_1378862677871751174" (
    "media_id" bigint NOT NULL,
    "tweet_id" "text" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."tweet_media_1378862677871751174" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."tweet_media_316970336" (
    "media_id" bigint NOT NULL,
    "tweet_id" "text" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "archive_upload_id" bigint NOT NULL
);
ALTER TABLE "temp"."tweet_media_316970336" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."tweet_urls_1038586640" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "expanded_url" "text" NOT NULL,
    "display_url" "text" NOT NULL,
    "tweet_id" "text" NOT NULL
);
ALTER TABLE "temp"."tweet_urls_1038586640" OWNER TO "postgres";
ALTER TABLE "temp"."tweet_urls_1038586640" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."tweet_urls_1038586640_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."tweet_urls_1211134623285047297" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "expanded_url" "text" NOT NULL,
    "display_url" "text" NOT NULL,
    "tweet_id" "text" NOT NULL
);
ALTER TABLE "temp"."tweet_urls_1211134623285047297" OWNER TO "postgres";
ALTER TABLE "temp"."tweet_urls_1211134623285047297" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."tweet_urls_1211134623285047297_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."tweet_urls_1378862677871751174" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "expanded_url" "text" NOT NULL,
    "display_url" "text" NOT NULL,
    "tweet_id" "text" NOT NULL
);
ALTER TABLE "temp"."tweet_urls_1378862677871751174" OWNER TO "postgres";
ALTER TABLE "temp"."tweet_urls_1378862677871751174" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."tweet_urls_1378862677871751174_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."tweet_urls_316970336" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "expanded_url" "text" NOT NULL,
    "display_url" "text" NOT NULL,
    "tweet_id" "text" NOT NULL
);
ALTER TABLE "temp"."tweet_urls_316970336" OWNER TO "postgres";
ALTER TABLE "temp"."tweet_urls_316970336" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."tweet_urls_316970336_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."tweets_1038586640" (
    "tweet_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "full_text" "text" NOT NULL,
    "retweet_count" integer NOT NULL,
    "favorite_count" integer NOT NULL,
    "reply_to_tweet_id" "text",
    "reply_to_user_id" "text",
    "reply_to_username" "text",
    "archive_upload_id" bigint NOT NULL,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED
);
ALTER TABLE "temp"."tweets_1038586640" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."tweets_1211134623285047297" (
    "tweet_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "full_text" "text" NOT NULL,
    "retweet_count" integer NOT NULL,
    "favorite_count" integer NOT NULL,
    "reply_to_tweet_id" "text",
    "reply_to_user_id" "text",
    "reply_to_username" "text",
    "archive_upload_id" bigint NOT NULL,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED
);
ALTER TABLE "temp"."tweets_1211134623285047297" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."tweets_1378862677871751174" (
    "tweet_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "full_text" "text" NOT NULL,
    "retweet_count" integer NOT NULL,
    "favorite_count" integer NOT NULL,
    "reply_to_tweet_id" "text",
    "reply_to_user_id" "text",
    "reply_to_username" "text",
    "archive_upload_id" bigint NOT NULL,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED
);
ALTER TABLE "temp"."tweets_1378862677871751174" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."tweets_316970336" (
    "tweet_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "full_text" "text" NOT NULL,
    "retweet_count" integer NOT NULL,
    "favorite_count" integer NOT NULL,
    "reply_to_tweet_id" "text",
    "reply_to_user_id" "text",
    "reply_to_username" "text",
    "archive_upload_id" bigint NOT NULL,
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "full_text")) STORED
);
ALTER TABLE "temp"."tweets_316970336" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "temp"."user_mentions_1038586640" (
    "id" bigint NOT NULL,
    "mentioned_user_id" "text" NOT NULL,
    "tweet_id" "text" NOT NULL
);
ALTER TABLE "temp"."user_mentions_1038586640" OWNER TO "postgres";
ALTER TABLE "temp"."user_mentions_1038586640" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."user_mentions_1038586640_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."user_mentions_1211134623285047297" (
    "id" bigint NOT NULL,
    "mentioned_user_id" "text" NOT NULL,
    "tweet_id" "text" NOT NULL
);
ALTER TABLE "temp"."user_mentions_1211134623285047297" OWNER TO "postgres";
ALTER TABLE "temp"."user_mentions_1211134623285047297" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."user_mentions_1211134623285047297_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."user_mentions_1378862677871751174" (
    "id" bigint NOT NULL,
    "mentioned_user_id" "text" NOT NULL,
    "tweet_id" "text" NOT NULL
);
ALTER TABLE "temp"."user_mentions_1378862677871751174" OWNER TO "postgres";
ALTER TABLE "temp"."user_mentions_1378862677871751174" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."user_mentions_1378862677871751174_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "temp"."user_mentions_316970336" (
    "id" bigint NOT NULL,
    "mentioned_user_id" "text" NOT NULL,
    "tweet_id" "text" NOT NULL
);
ALTER TABLE "temp"."user_mentions_316970336" OWNER TO "postgres";
ALTER TABLE "temp"."user_mentions_316970336" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "temp"."user_mentions_316970336_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
ALTER TABLE ONLY "dev"."account"
    ADD CONSTRAINT "account_pkey" PRIMARY KEY ("account_id");
ALTER TABLE ONLY "dev"."archive_upload"
    ADD CONSTRAINT "archive_upload_account_id_archive_at_key" UNIQUE ("account_id", "archive_at");
ALTER TABLE ONLY "dev"."archive_upload"
    ADD CONSTRAINT "archive_upload_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "dev"."followers"
    ADD CONSTRAINT "followers_account_id_follower_account_id_key" UNIQUE ("account_id", "follower_account_id");
ALTER TABLE ONLY "dev"."followers"
    ADD CONSTRAINT "followers_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "dev"."following"
    ADD CONSTRAINT "following_account_id_following_account_id_key" UNIQUE ("account_id", "following_account_id");
ALTER TABLE ONLY "dev"."following"
    ADD CONSTRAINT "following_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "dev"."liked_tweets"
    ADD CONSTRAINT "liked_tweets_pkey" PRIMARY KEY ("tweet_id");
ALTER TABLE ONLY "dev"."likes"
    ADD CONSTRAINT "likes_account_id_liked_tweet_id_key" UNIQUE ("account_id", "liked_tweet_id");
ALTER TABLE ONLY "dev"."likes"
    ADD CONSTRAINT "likes_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "dev"."mentioned_users"
    ADD CONSTRAINT "mentioned_users_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "dev"."profile"
    ADD CONSTRAINT "profile_account_id_archive_upload_id_key" UNIQUE ("account_id", "archive_upload_id");
ALTER TABLE ONLY "dev"."profile"
    ADD CONSTRAINT "profile_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "dev"."tweet_media"
    ADD CONSTRAINT "tweet_media_pkey" PRIMARY KEY ("media_id");
ALTER TABLE ONLY "dev"."tweet_urls"
    ADD CONSTRAINT "tweet_urls_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "dev"."tweet_urls"
    ADD CONSTRAINT "tweet_urls_tweet_id_url_key" UNIQUE ("tweet_id", "url");
ALTER TABLE ONLY "dev"."tweets"
    ADD CONSTRAINT "tweets_pkey" PRIMARY KEY ("tweet_id");
ALTER TABLE ONLY "dev"."user_mentions"
    ADD CONSTRAINT "user_mentions_mentioned_user_id_tweet_id_key" UNIQUE ("mentioned_user_id", "tweet_id");
ALTER TABLE ONLY "dev"."user_mentions"
    ADD CONSTRAINT "user_mentions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."account"
    ADD CONSTRAINT "account_pkey" PRIMARY KEY ("account_id");
ALTER TABLE ONLY "public"."archive_upload"
    ADD CONSTRAINT "archive_upload_account_id_archive_at_key" UNIQUE ("account_id", "archive_at");
ALTER TABLE ONLY "public"."archive_upload"
    ADD CONSTRAINT "archive_upload_pkey" PRIMARY KEY ("id");
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
ALTER TABLE ONLY "public"."profile"
    ADD CONSTRAINT "profile_account_id_archive_upload_id_key" UNIQUE ("account_id", "archive_upload_id");
ALTER TABLE ONLY "public"."profile"
    ADD CONSTRAINT "profile_account_id_archive_upload_id_unique" UNIQUE ("account_id", "archive_upload_id");
ALTER TABLE ONLY "public"."profile"
    ADD CONSTRAINT "profile_pkey" PRIMARY KEY ("id");
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
ALTER TABLE ONLY "temp"."account_1038586640"
    ADD CONSTRAINT "account_1038586640_pkey" PRIMARY KEY ("account_id");
ALTER TABLE ONLY "temp"."account_1378862677871751174"
    ADD CONSTRAINT "account_1378862677871751174_pkey" PRIMARY KEY ("account_id");
ALTER TABLE ONLY "temp"."account_316970336"
    ADD CONSTRAINT "account_316970336_pkey" PRIMARY KEY ("account_id");
ALTER TABLE ONLY "temp"."archive_upload_1038586640"
    ADD CONSTRAINT "archive_upload_1038586640_account_id_archive_at_key" UNIQUE ("account_id", "archive_at");
ALTER TABLE ONLY "temp"."archive_upload_1038586640"
    ADD CONSTRAINT "archive_upload_1038586640_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."archive_upload_1378862677871751174"
    ADD CONSTRAINT "archive_upload_1378862677871751174_account_id_archive_at_key" UNIQUE ("account_id", "archive_at");
ALTER TABLE ONLY "temp"."archive_upload_1378862677871751174"
    ADD CONSTRAINT "archive_upload_1378862677871751174_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."archive_upload_316970336"
    ADD CONSTRAINT "archive_upload_316970336_account_id_archive_at_key" UNIQUE ("account_id", "archive_at");
ALTER TABLE ONLY "temp"."archive_upload_316970336"
    ADD CONSTRAINT "archive_upload_316970336_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."followers_1038586640"
    ADD CONSTRAINT "followers_1038586640_account_id_follower_account_id_key" UNIQUE ("account_id", "follower_account_id");
ALTER TABLE ONLY "temp"."followers_1038586640"
    ADD CONSTRAINT "followers_1038586640_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."followers_1211134623285047297"
    ADD CONSTRAINT "followers_1211134623285047297_account_id_follower_account_i_key" UNIQUE ("account_id", "follower_account_id");
ALTER TABLE ONLY "temp"."followers_1211134623285047297"
    ADD CONSTRAINT "followers_1211134623285047297_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."followers_1378862677871751174"
    ADD CONSTRAINT "followers_1378862677871751174_account_id_follower_account_i_key" UNIQUE ("account_id", "follower_account_id");
ALTER TABLE ONLY "temp"."followers_1378862677871751174"
    ADD CONSTRAINT "followers_1378862677871751174_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."followers_316970336"
    ADD CONSTRAINT "followers_316970336_account_id_follower_account_id_key" UNIQUE ("account_id", "follower_account_id");
ALTER TABLE ONLY "temp"."followers_316970336"
    ADD CONSTRAINT "followers_316970336_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."following_1038586640"
    ADD CONSTRAINT "following_1038586640_account_id_following_account_id_key" UNIQUE ("account_id", "following_account_id");
ALTER TABLE ONLY "temp"."following_1038586640"
    ADD CONSTRAINT "following_1038586640_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."following_1211134623285047297"
    ADD CONSTRAINT "following_1211134623285047297_account_id_following_account__key" UNIQUE ("account_id", "following_account_id");
ALTER TABLE ONLY "temp"."following_1211134623285047297"
    ADD CONSTRAINT "following_1211134623285047297_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."following_1378862677871751174"
    ADD CONSTRAINT "following_1378862677871751174_account_id_following_account__key" UNIQUE ("account_id", "following_account_id");
ALTER TABLE ONLY "temp"."following_1378862677871751174"
    ADD CONSTRAINT "following_1378862677871751174_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."following_316970336"
    ADD CONSTRAINT "following_316970336_account_id_following_account_id_key" UNIQUE ("account_id", "following_account_id");
ALTER TABLE ONLY "temp"."following_316970336"
    ADD CONSTRAINT "following_316970336_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."liked_tweets_1038586640"
    ADD CONSTRAINT "liked_tweets_1038586640_pkey" PRIMARY KEY ("tweet_id");
ALTER TABLE ONLY "temp"."liked_tweets_1211134623285047297"
    ADD CONSTRAINT "liked_tweets_1211134623285047297_pkey" PRIMARY KEY ("tweet_id");
ALTER TABLE ONLY "temp"."liked_tweets_1378862677871751174"
    ADD CONSTRAINT "liked_tweets_1378862677871751174_pkey" PRIMARY KEY ("tweet_id");
ALTER TABLE ONLY "temp"."liked_tweets_316970336"
    ADD CONSTRAINT "liked_tweets_316970336_pkey" PRIMARY KEY ("tweet_id");
ALTER TABLE ONLY "temp"."likes_1038586640"
    ADD CONSTRAINT "likes_1038586640_account_id_liked_tweet_id_key" UNIQUE ("account_id", "liked_tweet_id");
ALTER TABLE ONLY "temp"."likes_1038586640"
    ADD CONSTRAINT "likes_1038586640_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."likes_1211134623285047297"
    ADD CONSTRAINT "likes_1211134623285047297_account_id_liked_tweet_id_key" UNIQUE ("account_id", "liked_tweet_id");
ALTER TABLE ONLY "temp"."likes_1211134623285047297"
    ADD CONSTRAINT "likes_1211134623285047297_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."likes_1378862677871751174"
    ADD CONSTRAINT "likes_1378862677871751174_account_id_liked_tweet_id_key" UNIQUE ("account_id", "liked_tweet_id");
ALTER TABLE ONLY "temp"."likes_1378862677871751174"
    ADD CONSTRAINT "likes_1378862677871751174_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."likes_316970336"
    ADD CONSTRAINT "likes_316970336_account_id_liked_tweet_id_key" UNIQUE ("account_id", "liked_tweet_id");
ALTER TABLE ONLY "temp"."likes_316970336"
    ADD CONSTRAINT "likes_316970336_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."mentioned_users_1038586640"
    ADD CONSTRAINT "mentioned_users_1038586640_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "temp"."mentioned_users_1211134623285047297"
    ADD CONSTRAINT "mentioned_users_1211134623285047297_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "temp"."mentioned_users_1378862677871751174"
    ADD CONSTRAINT "mentioned_users_1378862677871751174_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "temp"."mentioned_users_316970336"
    ADD CONSTRAINT "mentioned_users_316970336_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "temp"."profile_1038586640"
    ADD CONSTRAINT "profile_1038586640_account_id_archive_upload_id_key" UNIQUE ("account_id", "archive_upload_id");
ALTER TABLE ONLY "temp"."profile_1038586640"
    ADD CONSTRAINT "profile_1038586640_account_id_archive_upload_id_key1" UNIQUE ("account_id", "archive_upload_id");
ALTER TABLE ONLY "temp"."profile_1038586640"
    ADD CONSTRAINT "profile_1038586640_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."profile_1211134623285047297"
    ADD CONSTRAINT "profile_1211134623285047297_account_id_archive_upload_id_key" UNIQUE ("account_id", "archive_upload_id");
ALTER TABLE ONLY "temp"."profile_1211134623285047297"
    ADD CONSTRAINT "profile_1211134623285047297_account_id_archive_upload_id_key1" UNIQUE ("account_id", "archive_upload_id");
ALTER TABLE ONLY "temp"."profile_1211134623285047297"
    ADD CONSTRAINT "profile_1211134623285047297_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."profile_1378862677871751174"
    ADD CONSTRAINT "profile_1378862677871751174_account_id_archive_upload_id_key" UNIQUE ("account_id", "archive_upload_id");
ALTER TABLE ONLY "temp"."profile_1378862677871751174"
    ADD CONSTRAINT "profile_1378862677871751174_account_id_archive_upload_id_key1" UNIQUE ("account_id", "archive_upload_id");
ALTER TABLE ONLY "temp"."profile_1378862677871751174"
    ADD CONSTRAINT "profile_1378862677871751174_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."profile_316970336"
    ADD CONSTRAINT "profile_316970336_account_id_archive_upload_id_key" UNIQUE ("account_id", "archive_upload_id");
ALTER TABLE ONLY "temp"."profile_316970336"
    ADD CONSTRAINT "profile_316970336_account_id_archive_upload_id_key1" UNIQUE ("account_id", "archive_upload_id");
ALTER TABLE ONLY "temp"."profile_316970336"
    ADD CONSTRAINT "profile_316970336_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."tweet_media_1038586640"
    ADD CONSTRAINT "tweet_media_1038586640_pkey" PRIMARY KEY ("media_id");
ALTER TABLE ONLY "temp"."tweet_media_1211134623285047297"
    ADD CONSTRAINT "tweet_media_1211134623285047297_pkey" PRIMARY KEY ("media_id");
ALTER TABLE ONLY "temp"."tweet_media_1378862677871751174"
    ADD CONSTRAINT "tweet_media_1378862677871751174_pkey" PRIMARY KEY ("media_id");
ALTER TABLE ONLY "temp"."tweet_media_316970336"
    ADD CONSTRAINT "tweet_media_316970336_pkey" PRIMARY KEY ("media_id");
ALTER TABLE ONLY "temp"."tweet_urls_1038586640"
    ADD CONSTRAINT "tweet_urls_1038586640_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."tweet_urls_1038586640"
    ADD CONSTRAINT "tweet_urls_1038586640_tweet_id_url_key" UNIQUE ("tweet_id", "url");
ALTER TABLE ONLY "temp"."tweet_urls_1211134623285047297"
    ADD CONSTRAINT "tweet_urls_1211134623285047297_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."tweet_urls_1211134623285047297"
    ADD CONSTRAINT "tweet_urls_1211134623285047297_tweet_id_url_key" UNIQUE ("tweet_id", "url");
ALTER TABLE ONLY "temp"."tweet_urls_1378862677871751174"
    ADD CONSTRAINT "tweet_urls_1378862677871751174_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."tweet_urls_1378862677871751174"
    ADD CONSTRAINT "tweet_urls_1378862677871751174_tweet_id_url_key" UNIQUE ("tweet_id", "url");
ALTER TABLE ONLY "temp"."tweet_urls_316970336"
    ADD CONSTRAINT "tweet_urls_316970336_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."tweet_urls_316970336"
    ADD CONSTRAINT "tweet_urls_316970336_tweet_id_url_key" UNIQUE ("tweet_id", "url");
ALTER TABLE ONLY "temp"."tweets_1038586640"
    ADD CONSTRAINT "tweets_1038586640_pkey" PRIMARY KEY ("tweet_id");
ALTER TABLE ONLY "temp"."tweets_1211134623285047297"
    ADD CONSTRAINT "tweets_1211134623285047297_pkey" PRIMARY KEY ("tweet_id");
ALTER TABLE ONLY "temp"."tweets_1378862677871751174"
    ADD CONSTRAINT "tweets_1378862677871751174_pkey" PRIMARY KEY ("tweet_id");
ALTER TABLE ONLY "temp"."tweets_316970336"
    ADD CONSTRAINT "tweets_316970336_pkey" PRIMARY KEY ("tweet_id");
ALTER TABLE ONLY "temp"."user_mentions_1038586640"
    ADD CONSTRAINT "user_mentions_1038586640_mentioned_user_id_tweet_id_key" UNIQUE ("mentioned_user_id", "tweet_id");
ALTER TABLE ONLY "temp"."user_mentions_1038586640"
    ADD CONSTRAINT "user_mentions_1038586640_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."user_mentions_1211134623285047297"
    ADD CONSTRAINT "user_mentions_1211134623285047297_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."user_mentions_1211134623285047297"
    ADD CONSTRAINT "user_mentions_121113462328504729_mentioned_user_id_tweet_id_key" UNIQUE ("mentioned_user_id", "tweet_id");
ALTER TABLE ONLY "temp"."user_mentions_1378862677871751174"
    ADD CONSTRAINT "user_mentions_1378862677871751174_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "temp"."user_mentions_1378862677871751174"
    ADD CONSTRAINT "user_mentions_137886267787175117_mentioned_user_id_tweet_id_key" UNIQUE ("mentioned_user_id", "tweet_id");
ALTER TABLE ONLY "temp"."user_mentions_316970336"
    ADD CONSTRAINT "user_mentions_316970336_mentioned_user_id_tweet_id_key" UNIQUE ("mentioned_user_id", "tweet_id");
ALTER TABLE ONLY "temp"."user_mentions_316970336"
    ADD CONSTRAINT "user_mentions_316970336_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_archive_upload_account_id" ON "dev"."archive_upload" USING "btree" ("account_id");
CREATE INDEX "idx_followers_account_id" ON "dev"."followers" USING "btree" ("account_id");
CREATE INDEX "idx_followers_archive_upload_id" ON "dev"."followers" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_following_account_id" ON "dev"."following" USING "btree" ("account_id");
CREATE INDEX "idx_following_archive_upload_id" ON "dev"."following" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_likes_account_id" ON "dev"."likes" USING "btree" ("account_id");
CREATE INDEX "idx_likes_archive_upload_id" ON "dev"."likes" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_likes_liked_tweet_id" ON "dev"."likes" USING "btree" ("liked_tweet_id");
CREATE INDEX "idx_profile_account_id" ON "dev"."profile" USING "btree" ("account_id");
CREATE INDEX "idx_profile_archive_upload_id" ON "dev"."profile" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_tweet_media_archive_upload_id" ON "dev"."tweet_media" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_tweet_media_tweet_id" ON "dev"."tweet_media" USING "btree" ("tweet_id");
CREATE INDEX "idx_tweet_urls_tweet_id" ON "dev"."tweet_urls" USING "btree" ("tweet_id");
CREATE INDEX "idx_tweets_account_id" ON "dev"."tweets" USING "btree" ("account_id");
CREATE INDEX "idx_tweets_archive_upload_id" ON "dev"."tweets" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_user_mentions_mentioned_user_id" ON "dev"."user_mentions" USING "btree" ("mentioned_user_id");
CREATE INDEX "idx_user_mentions_tweet_id" ON "dev"."user_mentions" USING "btree" ("tweet_id");
CREATE INDEX "text_fts" ON "dev"."tweets" USING "gin" ("fts");
CREATE INDEX "idx_archive_upload_account_id" ON "public"."archive_upload" USING "btree" ("account_id");
CREATE INDEX "idx_followers_account_id" ON "public"."followers" USING "btree" ("account_id");
CREATE INDEX "idx_followers_archive_upload_id" ON "public"."followers" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_following_account_id" ON "public"."following" USING "btree" ("account_id");
CREATE INDEX "idx_following_archive_upload_id" ON "public"."following" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_likes_account_id" ON "public"."likes" USING "btree" ("account_id");
CREATE INDEX "idx_likes_archive_upload_id" ON "public"."likes" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_likes_liked_tweet_id" ON "public"."likes" USING "btree" ("liked_tweet_id");
CREATE INDEX "idx_profile_account_id" ON "public"."profile" USING "btree" ("account_id");
CREATE INDEX "idx_profile_archive_upload_id" ON "public"."profile" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_tweet_media_archive_upload_id" ON "public"."tweet_media" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_tweet_media_tweet_id" ON "public"."tweet_media" USING "btree" ("tweet_id");
CREATE INDEX "idx_tweet_urls_tweet_id" ON "public"."tweet_urls" USING "btree" ("tweet_id");
CREATE INDEX "idx_tweets_account_id" ON "public"."tweets" USING "btree" ("account_id");
CREATE INDEX "idx_tweets_archive_upload_id" ON "public"."tweets" USING "btree" ("archive_upload_id");
CREATE INDEX "idx_tweets_created_at" ON "public"."tweets" USING "btree" ("created_at" DESC);
CREATE INDEX "idx_user_mentions_mentioned_user_id" ON "public"."user_mentions" USING "btree" ("mentioned_user_id");
CREATE INDEX "idx_user_mentions_tweet_id" ON "public"."user_mentions" USING "btree" ("tweet_id");
CREATE INDEX "text_fts" ON "public"."tweets" USING "gin" ("fts");
CREATE INDEX "archive_upload_1038586640_account_id_idx" ON "temp"."archive_upload_1038586640" USING "btree" ("account_id");
CREATE INDEX "archive_upload_1378862677871751174_account_id_idx" ON "temp"."archive_upload_1378862677871751174" USING "btree" ("account_id");
CREATE INDEX "archive_upload_316970336_account_id_idx" ON "temp"."archive_upload_316970336" USING "btree" ("account_id");
CREATE INDEX "followers_1038586640_account_id_idx" ON "temp"."followers_1038586640" USING "btree" ("account_id");
CREATE INDEX "followers_1038586640_archive_upload_id_idx" ON "temp"."followers_1038586640" USING "btree" ("archive_upload_id");
CREATE INDEX "followers_1211134623285047297_account_id_idx" ON "temp"."followers_1211134623285047297" USING "btree" ("account_id");
CREATE INDEX "followers_1211134623285047297_archive_upload_id_idx" ON "temp"."followers_1211134623285047297" USING "btree" ("archive_upload_id");
CREATE INDEX "followers_1378862677871751174_account_id_idx" ON "temp"."followers_1378862677871751174" USING "btree" ("account_id");
CREATE INDEX "followers_1378862677871751174_archive_upload_id_idx" ON "temp"."followers_1378862677871751174" USING "btree" ("archive_upload_id");
CREATE INDEX "followers_316970336_account_id_idx" ON "temp"."followers_316970336" USING "btree" ("account_id");
CREATE INDEX "followers_316970336_archive_upload_id_idx" ON "temp"."followers_316970336" USING "btree" ("archive_upload_id");
CREATE INDEX "following_1038586640_account_id_idx" ON "temp"."following_1038586640" USING "btree" ("account_id");
CREATE INDEX "following_1038586640_archive_upload_id_idx" ON "temp"."following_1038586640" USING "btree" ("archive_upload_id");
CREATE INDEX "following_1211134623285047297_account_id_idx" ON "temp"."following_1211134623285047297" USING "btree" ("account_id");
CREATE INDEX "following_1211134623285047297_archive_upload_id_idx" ON "temp"."following_1211134623285047297" USING "btree" ("archive_upload_id");
CREATE INDEX "following_1378862677871751174_account_id_idx" ON "temp"."following_1378862677871751174" USING "btree" ("account_id");
CREATE INDEX "following_1378862677871751174_archive_upload_id_idx" ON "temp"."following_1378862677871751174" USING "btree" ("archive_upload_id");
CREATE INDEX "following_316970336_account_id_idx" ON "temp"."following_316970336" USING "btree" ("account_id");
CREATE INDEX "following_316970336_archive_upload_id_idx" ON "temp"."following_316970336" USING "btree" ("archive_upload_id");
CREATE INDEX "likes_1038586640_account_id_idx" ON "temp"."likes_1038586640" USING "btree" ("account_id");
CREATE INDEX "likes_1038586640_archive_upload_id_idx" ON "temp"."likes_1038586640" USING "btree" ("archive_upload_id");
CREATE INDEX "likes_1038586640_liked_tweet_id_idx" ON "temp"."likes_1038586640" USING "btree" ("liked_tweet_id");
CREATE INDEX "likes_1211134623285047297_account_id_idx" ON "temp"."likes_1211134623285047297" USING "btree" ("account_id");
CREATE INDEX "likes_1211134623285047297_archive_upload_id_idx" ON "temp"."likes_1211134623285047297" USING "btree" ("archive_upload_id");
CREATE INDEX "likes_1211134623285047297_liked_tweet_id_idx" ON "temp"."likes_1211134623285047297" USING "btree" ("liked_tweet_id");
CREATE INDEX "likes_1378862677871751174_account_id_idx" ON "temp"."likes_1378862677871751174" USING "btree" ("account_id");
CREATE INDEX "likes_1378862677871751174_archive_upload_id_idx" ON "temp"."likes_1378862677871751174" USING "btree" ("archive_upload_id");
CREATE INDEX "likes_1378862677871751174_liked_tweet_id_idx" ON "temp"."likes_1378862677871751174" USING "btree" ("liked_tweet_id");
CREATE INDEX "likes_316970336_account_id_idx" ON "temp"."likes_316970336" USING "btree" ("account_id");
CREATE INDEX "likes_316970336_archive_upload_id_idx" ON "temp"."likes_316970336" USING "btree" ("archive_upload_id");
CREATE INDEX "likes_316970336_liked_tweet_id_idx" ON "temp"."likes_316970336" USING "btree" ("liked_tweet_id");
CREATE INDEX "profile_1038586640_account_id_idx" ON "temp"."profile_1038586640" USING "btree" ("account_id");
CREATE INDEX "profile_1038586640_archive_upload_id_idx" ON "temp"."profile_1038586640" USING "btree" ("archive_upload_id");
CREATE INDEX "profile_1211134623285047297_account_id_idx" ON "temp"."profile_1211134623285047297" USING "btree" ("account_id");
CREATE INDEX "profile_1211134623285047297_archive_upload_id_idx" ON "temp"."profile_1211134623285047297" USING "btree" ("archive_upload_id");
CREATE INDEX "profile_1378862677871751174_account_id_idx" ON "temp"."profile_1378862677871751174" USING "btree" ("account_id");
CREATE INDEX "profile_1378862677871751174_archive_upload_id_idx" ON "temp"."profile_1378862677871751174" USING "btree" ("archive_upload_id");
CREATE INDEX "profile_316970336_account_id_idx" ON "temp"."profile_316970336" USING "btree" ("account_id");
CREATE INDEX "profile_316970336_archive_upload_id_idx" ON "temp"."profile_316970336" USING "btree" ("archive_upload_id");
CREATE INDEX "tweet_media_1038586640_archive_upload_id_idx" ON "temp"."tweet_media_1038586640" USING "btree" ("archive_upload_id");
CREATE INDEX "tweet_media_1038586640_tweet_id_idx" ON "temp"."tweet_media_1038586640" USING "btree" ("tweet_id");
CREATE INDEX "tweet_media_1211134623285047297_archive_upload_id_idx" ON "temp"."tweet_media_1211134623285047297" USING "btree" ("archive_upload_id");
CREATE INDEX "tweet_media_1211134623285047297_tweet_id_idx" ON "temp"."tweet_media_1211134623285047297" USING "btree" ("tweet_id");
CREATE INDEX "tweet_media_1378862677871751174_archive_upload_id_idx" ON "temp"."tweet_media_1378862677871751174" USING "btree" ("archive_upload_id");
CREATE INDEX "tweet_media_1378862677871751174_tweet_id_idx" ON "temp"."tweet_media_1378862677871751174" USING "btree" ("tweet_id");
CREATE INDEX "tweet_media_316970336_archive_upload_id_idx" ON "temp"."tweet_media_316970336" USING "btree" ("archive_upload_id");
CREATE INDEX "tweet_media_316970336_tweet_id_idx" ON "temp"."tweet_media_316970336" USING "btree" ("tweet_id");
CREATE INDEX "tweet_urls_1038586640_tweet_id_idx" ON "temp"."tweet_urls_1038586640" USING "btree" ("tweet_id");
CREATE INDEX "tweet_urls_1211134623285047297_tweet_id_idx" ON "temp"."tweet_urls_1211134623285047297" USING "btree" ("tweet_id");
CREATE INDEX "tweet_urls_1378862677871751174_tweet_id_idx" ON "temp"."tweet_urls_1378862677871751174" USING "btree" ("tweet_id");
CREATE INDEX "tweet_urls_316970336_tweet_id_idx" ON "temp"."tweet_urls_316970336" USING "btree" ("tweet_id");
CREATE INDEX "tweets_1038586640_account_id_idx" ON "temp"."tweets_1038586640" USING "btree" ("account_id");
CREATE INDEX "tweets_1038586640_archive_upload_id_idx" ON "temp"."tweets_1038586640" USING "btree" ("archive_upload_id");
CREATE INDEX "tweets_1038586640_created_at_idx" ON "temp"."tweets_1038586640" USING "btree" ("created_at" DESC);
CREATE INDEX "tweets_1038586640_fts_idx" ON "temp"."tweets_1038586640" USING "gin" ("fts");
CREATE INDEX "tweets_1211134623285047297_account_id_idx" ON "temp"."tweets_1211134623285047297" USING "btree" ("account_id");
CREATE INDEX "tweets_1211134623285047297_archive_upload_id_idx" ON "temp"."tweets_1211134623285047297" USING "btree" ("archive_upload_id");
CREATE INDEX "tweets_1211134623285047297_fts_idx" ON "temp"."tweets_1211134623285047297" USING "gin" ("fts");
CREATE INDEX "tweets_1378862677871751174_account_id_idx" ON "temp"."tweets_1378862677871751174" USING "btree" ("account_id");
CREATE INDEX "tweets_1378862677871751174_archive_upload_id_idx" ON "temp"."tweets_1378862677871751174" USING "btree" ("archive_upload_id");
CREATE INDEX "tweets_1378862677871751174_created_at_idx" ON "temp"."tweets_1378862677871751174" USING "btree" ("created_at" DESC);
CREATE INDEX "tweets_1378862677871751174_fts_idx" ON "temp"."tweets_1378862677871751174" USING "gin" ("fts");
CREATE INDEX "tweets_316970336_account_id_idx" ON "temp"."tweets_316970336" USING "btree" ("account_id");
CREATE INDEX "tweets_316970336_archive_upload_id_idx" ON "temp"."tweets_316970336" USING "btree" ("archive_upload_id");
CREATE INDEX "tweets_316970336_created_at_idx" ON "temp"."tweets_316970336" USING "btree" ("created_at" DESC);
CREATE INDEX "tweets_316970336_fts_idx" ON "temp"."tweets_316970336" USING "gin" ("fts");
CREATE INDEX "user_mentions_1038586640_mentioned_user_id_idx" ON "temp"."user_mentions_1038586640" USING "btree" ("mentioned_user_id");
CREATE INDEX "user_mentions_1038586640_tweet_id_idx" ON "temp"."user_mentions_1038586640" USING "btree" ("tweet_id");
CREATE INDEX "user_mentions_1211134623285047297_mentioned_user_id_idx" ON "temp"."user_mentions_1211134623285047297" USING "btree" ("mentioned_user_id");
CREATE INDEX "user_mentions_1211134623285047297_tweet_id_idx" ON "temp"."user_mentions_1211134623285047297" USING "btree" ("tweet_id");
CREATE INDEX "user_mentions_1378862677871751174_mentioned_user_id_idx" ON "temp"."user_mentions_1378862677871751174" USING "btree" ("mentioned_user_id");
CREATE INDEX "user_mentions_1378862677871751174_tweet_id_idx" ON "temp"."user_mentions_1378862677871751174" USING "btree" ("tweet_id");
CREATE INDEX "user_mentions_316970336_mentioned_user_id_idx" ON "temp"."user_mentions_316970336" USING "btree" ("mentioned_user_id");
CREATE INDEX "user_mentions_316970336_tweet_id_idx" ON "temp"."user_mentions_316970336" USING "btree" ("tweet_id");
ALTER TABLE ONLY "dev"."archive_upload"
    ADD CONSTRAINT "archive_upload_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "dev"."account"("account_id");
ALTER TABLE ONLY "dev"."followers"
    ADD CONSTRAINT "followers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "dev"."account"("account_id");
ALTER TABLE ONLY "dev"."followers"
    ADD CONSTRAINT "followers_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "dev"."archive_upload"("id");
ALTER TABLE ONLY "dev"."following"
    ADD CONSTRAINT "following_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "dev"."account"("account_id");
ALTER TABLE ONLY "dev"."following"
    ADD CONSTRAINT "following_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "dev"."archive_upload"("id");
ALTER TABLE ONLY "dev"."likes"
    ADD CONSTRAINT "likes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "dev"."account"("account_id");
ALTER TABLE ONLY "dev"."likes"
    ADD CONSTRAINT "likes_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "dev"."archive_upload"("id");
ALTER TABLE ONLY "dev"."likes"
    ADD CONSTRAINT "likes_liked_tweet_id_fkey" FOREIGN KEY ("liked_tweet_id") REFERENCES "dev"."liked_tweets"("tweet_id");
ALTER TABLE ONLY "dev"."profile"
    ADD CONSTRAINT "profile_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "dev"."account"("account_id");
ALTER TABLE ONLY "dev"."profile"
    ADD CONSTRAINT "profile_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "dev"."archive_upload"("id");
ALTER TABLE ONLY "dev"."tweet_media"
    ADD CONSTRAINT "tweet_media_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "dev"."archive_upload"("id");
ALTER TABLE ONLY "dev"."tweet_media"
    ADD CONSTRAINT "tweet_media_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "dev"."tweets"("tweet_id");
ALTER TABLE ONLY "dev"."tweet_urls"
    ADD CONSTRAINT "tweet_urls_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "dev"."tweets"("tweet_id");
ALTER TABLE ONLY "dev"."tweets"
    ADD CONSTRAINT "tweets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "dev"."account"("account_id");
ALTER TABLE ONLY "dev"."tweets"
    ADD CONSTRAINT "tweets_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "dev"."archive_upload"("id");
ALTER TABLE ONLY "dev"."user_mentions"
    ADD CONSTRAINT "user_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "dev"."mentioned_users"("user_id");
ALTER TABLE ONLY "dev"."user_mentions"
    ADD CONSTRAINT "user_mentions_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "dev"."tweets"("tweet_id");
ALTER TABLE ONLY "public"."archive_upload"
    ADD CONSTRAINT "archive_upload_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id");
ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id");
ALTER TABLE ONLY "public"."followers"
    ADD CONSTRAINT "followers_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");
ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id");
ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");
ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id");
ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");
ALTER TABLE ONLY "public"."likes"
    ADD CONSTRAINT "likes_liked_tweet_id_fkey" FOREIGN KEY ("liked_tweet_id") REFERENCES "public"."liked_tweets"("tweet_id");
ALTER TABLE ONLY "public"."profile"
    ADD CONSTRAINT "profile_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id");
ALTER TABLE ONLY "public"."profile"
    ADD CONSTRAINT "profile_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");
ALTER TABLE ONLY "public"."tweet_media"
    ADD CONSTRAINT "tweet_media_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");
ALTER TABLE ONLY "public"."tweet_media"
    ADD CONSTRAINT "tweet_media_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id");
ALTER TABLE ONLY "public"."tweet_urls"
    ADD CONSTRAINT "tweet_urls_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id");
ALTER TABLE ONLY "public"."tweets"
    ADD CONSTRAINT "tweets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."account"("account_id");
ALTER TABLE ONLY "public"."tweets"
    ADD CONSTRAINT "tweets_archive_upload_id_fkey" FOREIGN KEY ("archive_upload_id") REFERENCES "public"."archive_upload"("id");
ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."mentioned_users"("user_id");
ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "public"."tweets"("tweet_id");
CREATE POLICY "Entities are modifiable by their users" ON "dev"."liked_tweets" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "dev"."account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "dev"."account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))));
CREATE POLICY "Entities are modifiable by their users" ON "dev"."mentioned_users" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "dev"."account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "dev"."account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))));
CREATE POLICY "Entities are modifiable by their users" ON "dev"."tweet_media" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "dev"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_media"."tweet_id") AND ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "dev"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_media"."tweet_id") AND ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))));
CREATE POLICY "Entities are modifiable by their users" ON "dev"."tweet_urls" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "dev"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_urls"."tweet_id") AND ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "dev"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_urls"."tweet_id") AND ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))));
CREATE POLICY "Entities are modifiable by their users" ON "dev"."user_mentions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "dev"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "user_mentions"."tweet_id") AND ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "dev"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "user_mentions"."tweet_id") AND ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))));
CREATE POLICY "Entities are publicly visible" ON "dev"."liked_tweets" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "dev"."mentioned_users" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "dev"."tweet_media" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "dev"."tweet_urls" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "dev"."user_mentions" FOR SELECT USING (true);
CREATE POLICY "Tweets are modifiable by their users" ON "dev"."account" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are modifiable by their users" ON "dev"."archive_upload" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are modifiable by their users" ON "dev"."followers" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are modifiable by their users" ON "dev"."following" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are modifiable by their users" ON "dev"."likes" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are modifiable by their users" ON "dev"."profile" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are modifiable by their users" ON "dev"."tweets" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are publicly visible" ON "dev"."account" FOR SELECT USING (true);
CREATE POLICY "Tweets are publicly visible" ON "dev"."archive_upload" FOR SELECT USING (true);
CREATE POLICY "Tweets are publicly visible" ON "dev"."followers" FOR SELECT USING (true);
CREATE POLICY "Tweets are publicly visible" ON "dev"."following" FOR SELECT USING (true);
CREATE POLICY "Tweets are publicly visible" ON "dev"."likes" FOR SELECT USING (true);
CREATE POLICY "Tweets are publicly visible" ON "dev"."profile" FOR SELECT USING (true);
CREATE POLICY "Tweets are publicly visible" ON "dev"."tweets" FOR SELECT USING (true);
ALTER TABLE "dev"."account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev"."archive_upload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev"."followers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev"."following" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev"."liked_tweets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev"."likes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev"."mentioned_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev"."profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev"."tweet_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev"."tweet_urls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev"."tweets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev"."user_mentions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Entities are modifiable by their users" ON "public"."liked_tweets" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))));
CREATE POLICY "Entities are modifiable by their users" ON "public"."mentioned_users" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))));
CREATE POLICY "Entities are modifiable by their users" ON "public"."tweet_media" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_media"."tweet_id") AND ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_media"."tweet_id") AND ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))));
CREATE POLICY "Entities are modifiable by their users" ON "public"."tweet_urls" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_urls"."tweet_id") AND ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_urls"."tweet_id") AND ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))));
CREATE POLICY "Entities are modifiable by their users" ON "public"."user_mentions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "user_mentions"."tweet_id") AND ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "user_mentions"."tweet_id") AND ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))));
CREATE POLICY "Entities are publicly visible" ON "public"."liked_tweets" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "public"."mentioned_users" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "public"."tweet_media" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "public"."tweet_urls" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "public"."user_mentions" FOR SELECT USING (true);
CREATE POLICY "Tweets are modifiable by their users" ON "public"."account" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are modifiable by their users" ON "public"."archive_upload" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are modifiable by their users" ON "public"."followers" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are modifiable by their users" ON "public"."following" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are modifiable by their users" ON "public"."likes" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are modifiable by their users" ON "public"."profile" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are modifiable by their users" ON "public"."tweets" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Tweets are publicly visible" ON "public"."account" FOR SELECT USING (true);
CREATE POLICY "Tweets are publicly visible" ON "public"."archive_upload" FOR SELECT USING (true);
CREATE POLICY "Tweets are publicly visible" ON "public"."followers" FOR SELECT USING (true);
CREATE POLICY "Tweets are publicly visible" ON "public"."following" FOR SELECT USING (true);
CREATE POLICY "Tweets are publicly visible" ON "public"."likes" FOR SELECT USING (true);
CREATE POLICY "Tweets are publicly visible" ON "public"."profile" FOR SELECT USING (true);
CREATE POLICY "Tweets are publicly visible" ON "public"."tweets" FOR SELECT USING (true);
ALTER TABLE "public"."account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."archive_upload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."followers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."following" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."liked_tweets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."likes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."mentioned_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tweet_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tweet_urls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tweets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_mentions" ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";
GRANT USAGE ON SCHEMA "dev" TO "anon";
GRANT USAGE ON SCHEMA "dev" TO "service_role";
GRANT USAGE ON SCHEMA "dev" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "temp" TO "anon";
GRANT USAGE ON SCHEMA "temp" TO "service_role";
GRANT USAGE ON SCHEMA "temp" TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";
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
GRANT ALL ON FUNCTION "public"."commit_temp_data"("p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."commit_temp_data"("p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."commit_temp_data"("p_suffix" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_temp_tables"("p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_temp_tables"("p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_temp_tables"("p_suffix" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_all_archives"("p_account_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_all_archives"("p_account_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_all_archives"("p_account_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."drop_temp_tables"("p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."drop_temp_tables"("p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."drop_temp_tables"("p_suffix" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tweet_count_by_date"("start_date" timestamp with time zone, "end_date" timestamp with time zone, "granularity" "text") TO "service_role";
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
GRANT ALL ON FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_temp_archive_upload"("p_account_id" "text", "p_archive_at" timestamp with time zone, "p_suffix" "text") TO "service_role";
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
GRANT ALL ON FUNCTION "public"."pg_search_tweets"("search_query" "text", "p_account_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pg_search_tweets"("search_query" "text", "p_account_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pg_search_tweets"("search_query" "text", "p_account_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."pg_search_tweets_with_trigram"("search_query" "text", "p_account_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pg_search_tweets_with_trigram"("search_query" "text", "p_account_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pg_search_tweets_with_trigram"("search_query" "text", "p_account_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_and_insert_tweet_entities"("p_tweets" "jsonb", "p_suffix" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."process_archive"("archive_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."process_archive"("archive_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_archive"("archive_data" "jsonb") TO "service_role";
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
GRANT ALL ON TABLE "dev"."account" TO "anon";
GRANT ALL ON TABLE "dev"."account" TO "authenticated";
GRANT ALL ON TABLE "dev"."account" TO "service_role";
GRANT ALL ON TABLE "dev"."archive_upload" TO "anon";
GRANT ALL ON TABLE "dev"."archive_upload" TO "authenticated";
GRANT ALL ON TABLE "dev"."archive_upload" TO "service_role";
GRANT ALL ON SEQUENCE "dev"."archive_upload_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "dev"."archive_upload_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "dev"."archive_upload_id_seq" TO "service_role";
GRANT ALL ON TABLE "dev"."followers" TO "anon";
GRANT ALL ON TABLE "dev"."followers" TO "authenticated";
GRANT ALL ON TABLE "dev"."followers" TO "service_role";
GRANT ALL ON SEQUENCE "dev"."followers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "dev"."followers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "dev"."followers_id_seq" TO "service_role";
GRANT ALL ON TABLE "dev"."following" TO "anon";
GRANT ALL ON TABLE "dev"."following" TO "authenticated";
GRANT ALL ON TABLE "dev"."following" TO "service_role";
GRANT ALL ON SEQUENCE "dev"."following_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "dev"."following_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "dev"."following_id_seq" TO "service_role";
GRANT ALL ON TABLE "dev"."liked_tweets" TO "anon";
GRANT ALL ON TABLE "dev"."liked_tweets" TO "authenticated";
GRANT ALL ON TABLE "dev"."liked_tweets" TO "service_role";
GRANT ALL ON TABLE "dev"."likes" TO "anon";
GRANT ALL ON TABLE "dev"."likes" TO "authenticated";
GRANT ALL ON TABLE "dev"."likes" TO "service_role";
GRANT ALL ON SEQUENCE "dev"."likes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "dev"."likes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "dev"."likes_id_seq" TO "service_role";
GRANT ALL ON TABLE "dev"."mentioned_users" TO "anon";
GRANT ALL ON TABLE "dev"."mentioned_users" TO "authenticated";
GRANT ALL ON TABLE "dev"."mentioned_users" TO "service_role";
GRANT ALL ON TABLE "dev"."profile" TO "anon";
GRANT ALL ON TABLE "dev"."profile" TO "authenticated";
GRANT ALL ON TABLE "dev"."profile" TO "service_role";
GRANT ALL ON SEQUENCE "dev"."profile_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "dev"."profile_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "dev"."profile_id_seq" TO "service_role";
GRANT ALL ON TABLE "dev"."tweet_media" TO "anon";
GRANT ALL ON TABLE "dev"."tweet_media" TO "authenticated";
GRANT ALL ON TABLE "dev"."tweet_media" TO "service_role";
GRANT ALL ON TABLE "dev"."tweet_urls" TO "anon";
GRANT ALL ON TABLE "dev"."tweet_urls" TO "authenticated";
GRANT ALL ON TABLE "dev"."tweet_urls" TO "service_role";
GRANT ALL ON SEQUENCE "dev"."tweet_urls_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "dev"."tweet_urls_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "dev"."tweet_urls_id_seq" TO "service_role";
GRANT ALL ON TABLE "dev"."tweets" TO "anon";
GRANT ALL ON TABLE "dev"."tweets" TO "authenticated";
GRANT ALL ON TABLE "dev"."tweets" TO "service_role";
GRANT ALL ON TABLE "dev"."user_mentions" TO "anon";
GRANT ALL ON TABLE "dev"."user_mentions" TO "authenticated";
GRANT ALL ON TABLE "dev"."user_mentions" TO "service_role";
GRANT ALL ON SEQUENCE "dev"."user_mentions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "dev"."user_mentions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "dev"."user_mentions_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."account" TO "anon";
GRANT ALL ON TABLE "public"."account" TO "authenticated";
GRANT ALL ON TABLE "public"."account" TO "service_role";
GRANT ALL ON TABLE "public"."archive_upload" TO "anon";
GRANT ALL ON TABLE "public"."archive_upload" TO "authenticated";
GRANT ALL ON TABLE "public"."archive_upload" TO "service_role";
GRANT ALL ON SEQUENCE "public"."archive_upload_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."archive_upload_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."archive_upload_id_seq" TO "service_role";
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
GRANT ALL ON TABLE "public"."liked_tweets" TO "anon";
GRANT ALL ON TABLE "public"."liked_tweets" TO "authenticated";
GRANT ALL ON TABLE "public"."liked_tweets" TO "service_role";
GRANT ALL ON TABLE "public"."likes" TO "anon";
GRANT ALL ON TABLE "public"."likes" TO "authenticated";
GRANT ALL ON TABLE "public"."likes" TO "service_role";
GRANT ALL ON SEQUENCE "public"."likes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."likes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."likes_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."mentioned_users" TO "anon";
GRANT ALL ON TABLE "public"."mentioned_users" TO "authenticated";
GRANT ALL ON TABLE "public"."mentioned_users" TO "service_role";
GRANT ALL ON TABLE "public"."profile" TO "anon";
GRANT ALL ON TABLE "public"."profile" TO "authenticated";
GRANT ALL ON TABLE "public"."profile" TO "service_role";
GRANT ALL ON SEQUENCE "public"."profile_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."profile_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."profile_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."tweet_media" TO "anon";
GRANT ALL ON TABLE "public"."tweet_media" TO "authenticated";
GRANT ALL ON TABLE "public"."tweet_media" TO "service_role";
GRANT ALL ON TABLE "public"."tweet_urls" TO "anon";
GRANT ALL ON TABLE "public"."tweet_urls" TO "authenticated";
GRANT ALL ON TABLE "public"."tweet_urls" TO "service_role";
GRANT ALL ON SEQUENCE "public"."tweet_urls_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tweet_urls_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tweet_urls_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."tweets" TO "anon";
GRANT ALL ON TABLE "public"."tweets" TO "authenticated";
GRANT ALL ON TABLE "public"."tweets" TO "service_role";
GRANT ALL ON TABLE "public"."user_mentions" TO "anon";
GRANT ALL ON TABLE "public"."user_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_mentions" TO "service_role";
GRANT ALL ON SEQUENCE "public"."user_mentions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_mentions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_mentions_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."account_1038586640" TO "anon";
GRANT ALL ON TABLE "temp"."account_1038586640" TO "authenticated";
GRANT ALL ON TABLE "temp"."account_1038586640" TO "service_role";
GRANT ALL ON TABLE "temp"."account_1378862677871751174" TO "anon";
GRANT ALL ON TABLE "temp"."account_1378862677871751174" TO "authenticated";
GRANT ALL ON TABLE "temp"."account_1378862677871751174" TO "service_role";
GRANT ALL ON TABLE "temp"."account_316970336" TO "anon";
GRANT ALL ON TABLE "temp"."account_316970336" TO "authenticated";
GRANT ALL ON TABLE "temp"."account_316970336" TO "service_role";
GRANT ALL ON TABLE "temp"."archive_upload_1038586640" TO "anon";
GRANT ALL ON TABLE "temp"."archive_upload_1038586640" TO "authenticated";
GRANT ALL ON TABLE "temp"."archive_upload_1038586640" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."archive_upload_1038586640_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."archive_upload_1038586640_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."archive_upload_1038586640_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."archive_upload_1378862677871751174" TO "anon";
GRANT ALL ON TABLE "temp"."archive_upload_1378862677871751174" TO "authenticated";
GRANT ALL ON TABLE "temp"."archive_upload_1378862677871751174" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."archive_upload_1378862677871751174_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."archive_upload_1378862677871751174_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."archive_upload_1378862677871751174_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."archive_upload_316970336" TO "anon";
GRANT ALL ON TABLE "temp"."archive_upload_316970336" TO "authenticated";
GRANT ALL ON TABLE "temp"."archive_upload_316970336" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."archive_upload_316970336_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."archive_upload_316970336_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."archive_upload_316970336_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."followers_1038586640" TO "anon";
GRANT ALL ON TABLE "temp"."followers_1038586640" TO "authenticated";
GRANT ALL ON TABLE "temp"."followers_1038586640" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."followers_1038586640_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."followers_1038586640_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."followers_1038586640_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."followers_1211134623285047297" TO "anon";
GRANT ALL ON TABLE "temp"."followers_1211134623285047297" TO "authenticated";
GRANT ALL ON TABLE "temp"."followers_1211134623285047297" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."followers_1211134623285047297_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."followers_1211134623285047297_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."followers_1211134623285047297_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."followers_1378862677871751174" TO "anon";
GRANT ALL ON TABLE "temp"."followers_1378862677871751174" TO "authenticated";
GRANT ALL ON TABLE "temp"."followers_1378862677871751174" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."followers_1378862677871751174_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."followers_1378862677871751174_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."followers_1378862677871751174_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."followers_316970336" TO "anon";
GRANT ALL ON TABLE "temp"."followers_316970336" TO "authenticated";
GRANT ALL ON TABLE "temp"."followers_316970336" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."followers_316970336_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."followers_316970336_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."followers_316970336_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."following_1038586640" TO "anon";
GRANT ALL ON TABLE "temp"."following_1038586640" TO "authenticated";
GRANT ALL ON TABLE "temp"."following_1038586640" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."following_1038586640_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."following_1038586640_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."following_1038586640_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."following_1211134623285047297" TO "anon";
GRANT ALL ON TABLE "temp"."following_1211134623285047297" TO "authenticated";
GRANT ALL ON TABLE "temp"."following_1211134623285047297" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."following_1211134623285047297_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."following_1211134623285047297_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."following_1211134623285047297_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."following_1378862677871751174" TO "anon";
GRANT ALL ON TABLE "temp"."following_1378862677871751174" TO "authenticated";
GRANT ALL ON TABLE "temp"."following_1378862677871751174" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."following_1378862677871751174_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."following_1378862677871751174_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."following_1378862677871751174_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."following_316970336" TO "anon";
GRANT ALL ON TABLE "temp"."following_316970336" TO "authenticated";
GRANT ALL ON TABLE "temp"."following_316970336" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."following_316970336_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."following_316970336_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."following_316970336_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."liked_tweets_1038586640" TO "anon";
GRANT ALL ON TABLE "temp"."liked_tweets_1038586640" TO "authenticated";
GRANT ALL ON TABLE "temp"."liked_tweets_1038586640" TO "service_role";
GRANT ALL ON TABLE "temp"."liked_tweets_1211134623285047297" TO "anon";
GRANT ALL ON TABLE "temp"."liked_tweets_1211134623285047297" TO "authenticated";
GRANT ALL ON TABLE "temp"."liked_tweets_1211134623285047297" TO "service_role";
GRANT ALL ON TABLE "temp"."liked_tweets_1378862677871751174" TO "anon";
GRANT ALL ON TABLE "temp"."liked_tweets_1378862677871751174" TO "authenticated";
GRANT ALL ON TABLE "temp"."liked_tweets_1378862677871751174" TO "service_role";
GRANT ALL ON TABLE "temp"."liked_tweets_316970336" TO "anon";
GRANT ALL ON TABLE "temp"."liked_tweets_316970336" TO "authenticated";
GRANT ALL ON TABLE "temp"."liked_tweets_316970336" TO "service_role";
GRANT ALL ON TABLE "temp"."likes_1038586640" TO "anon";
GRANT ALL ON TABLE "temp"."likes_1038586640" TO "authenticated";
GRANT ALL ON TABLE "temp"."likes_1038586640" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."likes_1038586640_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."likes_1038586640_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."likes_1038586640_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."likes_1211134623285047297" TO "anon";
GRANT ALL ON TABLE "temp"."likes_1211134623285047297" TO "authenticated";
GRANT ALL ON TABLE "temp"."likes_1211134623285047297" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."likes_1211134623285047297_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."likes_1211134623285047297_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."likes_1211134623285047297_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."likes_1378862677871751174" TO "anon";
GRANT ALL ON TABLE "temp"."likes_1378862677871751174" TO "authenticated";
GRANT ALL ON TABLE "temp"."likes_1378862677871751174" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."likes_1378862677871751174_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."likes_1378862677871751174_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."likes_1378862677871751174_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."likes_316970336" TO "anon";
GRANT ALL ON TABLE "temp"."likes_316970336" TO "authenticated";
GRANT ALL ON TABLE "temp"."likes_316970336" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."likes_316970336_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."likes_316970336_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."likes_316970336_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."mentioned_users_1038586640" TO "anon";
GRANT ALL ON TABLE "temp"."mentioned_users_1038586640" TO "authenticated";
GRANT ALL ON TABLE "temp"."mentioned_users_1038586640" TO "service_role";
GRANT ALL ON TABLE "temp"."mentioned_users_1211134623285047297" TO "anon";
GRANT ALL ON TABLE "temp"."mentioned_users_1211134623285047297" TO "authenticated";
GRANT ALL ON TABLE "temp"."mentioned_users_1211134623285047297" TO "service_role";
GRANT ALL ON TABLE "temp"."mentioned_users_1378862677871751174" TO "anon";
GRANT ALL ON TABLE "temp"."mentioned_users_1378862677871751174" TO "authenticated";
GRANT ALL ON TABLE "temp"."mentioned_users_1378862677871751174" TO "service_role";
GRANT ALL ON TABLE "temp"."mentioned_users_316970336" TO "anon";
GRANT ALL ON TABLE "temp"."mentioned_users_316970336" TO "authenticated";
GRANT ALL ON TABLE "temp"."mentioned_users_316970336" TO "service_role";
GRANT ALL ON TABLE "temp"."profile_1038586640" TO "anon";
GRANT ALL ON TABLE "temp"."profile_1038586640" TO "authenticated";
GRANT ALL ON TABLE "temp"."profile_1038586640" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."profile_1038586640_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."profile_1038586640_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."profile_1038586640_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."profile_1211134623285047297" TO "anon";
GRANT ALL ON TABLE "temp"."profile_1211134623285047297" TO "authenticated";
GRANT ALL ON TABLE "temp"."profile_1211134623285047297" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."profile_1211134623285047297_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."profile_1211134623285047297_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."profile_1211134623285047297_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."profile_1378862677871751174" TO "anon";
GRANT ALL ON TABLE "temp"."profile_1378862677871751174" TO "authenticated";
GRANT ALL ON TABLE "temp"."profile_1378862677871751174" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."profile_1378862677871751174_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."profile_1378862677871751174_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."profile_1378862677871751174_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."profile_316970336" TO "anon";
GRANT ALL ON TABLE "temp"."profile_316970336" TO "authenticated";
GRANT ALL ON TABLE "temp"."profile_316970336" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."profile_316970336_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."profile_316970336_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."profile_316970336_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."tweet_media_1038586640" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_media_1038586640" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_media_1038586640" TO "service_role";
GRANT ALL ON TABLE "temp"."tweet_media_1211134623285047297" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_media_1211134623285047297" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_media_1211134623285047297" TO "service_role";
GRANT ALL ON TABLE "temp"."tweet_media_1378862677871751174" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_media_1378862677871751174" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_media_1378862677871751174" TO "service_role";
GRANT ALL ON TABLE "temp"."tweet_media_316970336" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_media_316970336" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_media_316970336" TO "service_role";
GRANT ALL ON TABLE "temp"."tweet_urls_1038586640" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_urls_1038586640" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_urls_1038586640" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_1038586640_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_1038586640_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_1038586640_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."tweet_urls_1211134623285047297" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_urls_1211134623285047297" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_urls_1211134623285047297" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_1211134623285047297_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_1211134623285047297_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_1211134623285047297_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."tweet_urls_1378862677871751174" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_urls_1378862677871751174" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_urls_1378862677871751174" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_1378862677871751174_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_1378862677871751174_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_1378862677871751174_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."tweet_urls_316970336" TO "anon";
GRANT ALL ON TABLE "temp"."tweet_urls_316970336" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweet_urls_316970336" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_316970336_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_316970336_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."tweet_urls_316970336_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."tweets_1038586640" TO "anon";
GRANT ALL ON TABLE "temp"."tweets_1038586640" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweets_1038586640" TO "service_role";
GRANT ALL ON TABLE "temp"."tweets_1211134623285047297" TO "anon";
GRANT ALL ON TABLE "temp"."tweets_1211134623285047297" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweets_1211134623285047297" TO "service_role";
GRANT ALL ON TABLE "temp"."tweets_1378862677871751174" TO "anon";
GRANT ALL ON TABLE "temp"."tweets_1378862677871751174" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweets_1378862677871751174" TO "service_role";
GRANT ALL ON TABLE "temp"."tweets_316970336" TO "anon";
GRANT ALL ON TABLE "temp"."tweets_316970336" TO "authenticated";
GRANT ALL ON TABLE "temp"."tweets_316970336" TO "service_role";
GRANT ALL ON TABLE "temp"."user_mentions_1038586640" TO "anon";
GRANT ALL ON TABLE "temp"."user_mentions_1038586640" TO "authenticated";
GRANT ALL ON TABLE "temp"."user_mentions_1038586640" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."user_mentions_1038586640_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."user_mentions_1038586640_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."user_mentions_1038586640_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."user_mentions_1211134623285047297" TO "anon";
GRANT ALL ON TABLE "temp"."user_mentions_1211134623285047297" TO "authenticated";
GRANT ALL ON TABLE "temp"."user_mentions_1211134623285047297" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."user_mentions_1211134623285047297_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."user_mentions_1211134623285047297_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."user_mentions_1211134623285047297_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."user_mentions_1378862677871751174" TO "anon";
GRANT ALL ON TABLE "temp"."user_mentions_1378862677871751174" TO "authenticated";
GRANT ALL ON TABLE "temp"."user_mentions_1378862677871751174" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."user_mentions_1378862677871751174_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."user_mentions_1378862677871751174_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."user_mentions_1378862677871751174_id_seq" TO "service_role";
GRANT ALL ON TABLE "temp"."user_mentions_316970336" TO "anon";
GRANT ALL ON TABLE "temp"."user_mentions_316970336" TO "authenticated";
GRANT ALL ON TABLE "temp"."user_mentions_316970336" TO "service_role";
GRANT ALL ON SEQUENCE "temp"."user_mentions_316970336_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "temp"."user_mentions_316970336_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "temp"."user_mentions_316970336_id_seq" TO "service_role";
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
RESET ALL;
