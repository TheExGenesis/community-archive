SET search_path TO '';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'archives') THEN
        INSERT INTO storage.buckets (id, name) VALUES ('archives', 'archives');
    END IF;
END $$;


GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

DROP TABLE IF EXISTS public.archive_upload CASCADE;
DROP TABLE IF EXISTS public.profile CASCADE;
DROP TABLE IF EXISTS public.following CASCADE;
DROP TABLE IF EXISTS public.followers CASCADE;
DROP TABLE IF EXISTS public.tweet_media CASCADE;
DROP TABLE IF EXISTS public.tweets CASCADE;
DROP TABLE IF EXISTS public.likes CASCADE;
DROP TABLE IF EXISTS public.liked_tweets CASCADE;
DROP TABLE IF EXISTS public.account CASCADE;
DROP TABLE IF EXISTS public.entities CASCADE;
DROP TABLE IF EXISTS public.media CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.user_mentions CASCADE;
DROP TABLE IF EXISTS public.mentioned_users CASCADE;
DROP TABLE IF EXISTS public.tweet_urls CASCADE;
DROP TABLE IF EXISTS public.tweet_entities CASCADE;


-- Supabase AI is experimental and may produce incorrect answers
-- Always verify the output before executing


-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Create table for account information
CREATE TABLE
  public.account (
    account_id TEXT PRIMARY KEY,
    created_via TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    account_display_name TEXT NOT NULL
  );

-- Create table for archive uploads
CREATE TABLE
  public.archive_upload (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT NOT NULL,
    archive_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (account_id, archive_at),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id)
  );

-- Create table for profiles
CREATE TABLE
  public.profile (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT NOT NULL, 
    bio TEXT,
    website TEXT,
    LOCATION TEXT,
    avatar_media_url TEXT,
    header_media_url TEXT,
    archive_upload_id BIGINT NOT NULL,
    UNIQUE (account_id, archive_upload_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id)
  );

-- Create table for tweets
CREATE TABLE
  public.tweets (
    tweet_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    full_text TEXT NOT NULL,
    retweet_count INTEGER NOT NULL,
    favorite_count INTEGER NOT NULL,
    reply_to_tweet_id TEXT,
    reply_to_user_id TEXT,
    reply_to_username TEXT,
    archive_upload_id BIGINT NOT NULL,
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id)
  );

-- Create table for mentioned users
CREATE TABLE
  public.mentioned_users (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    screen_name TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
  );

CREATE TABLE
  public.user_mentions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    mentioned_user_id TEXT NOT NULL,
    tweet_id TEXT NOT NULL,
    FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id),
    FOREIGN KEY (mentioned_user_id) REFERENCES public.mentioned_users (user_id),
    UNIQUE(mentioned_user_id, tweet_id)
  );

-- Create table for URLs
CREATE TABLE
  public.tweet_urls (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    url TEXT NOT NULL,
    expanded_url TEXT NOT NULL,
    display_url TEXT NOT NULL,
    tweet_id TEXT NOT NULL,
    FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id),
    UNIQUE(tweet_id, url)
  );



-- Create table for tweet media
CREATE TABLE
  public.tweet_media (
    media_id BIGINT PRIMARY KEY,
    tweet_id TEXT NOT NULL,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL,
    WIDTH INTEGER NOT NULL,
    HEIGHT INTEGER NOT NULL,
    archive_upload_id BIGINT NOT NULL,
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id)
  );

-- Create table for followers
CREATE TABLE
  public.followers (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT NOT NULL,
    follower_account_id TEXT NOT NULL,
    archive_upload_id BIGINT NOT NULL,
    UNIQUE (account_id, follower_account_id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id)
  );

-- Create table for following
CREATE TABLE
  public.following (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT NOT NULL,
    following_account_id TEXT NOT NULL,
    archive_upload_id BIGINT NOT NULL,
    UNIQUE (account_id, following_account_id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id)
  );

CREATE TABLE
  public.liked_tweets (
    tweet_id TEXT PRIMARY KEY,
    full_text TEXT NOT NULL
  );

-- Create table for likes
CREATE TABLE
  public.likes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT NOT NULL,
    liked_tweet_id TEXT NOT NULL,
    archive_upload_id BIGINT NOT NULL,
    UNIQUE (account_id, liked_tweet_id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id),
    FOREIGN KEY (liked_tweet_id) REFERENCES public.liked_tweets (tweet_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id)
  );

-- Indices for public.archive_upload
CREATE INDEX idx_archive_upload_account_id ON public.archive_upload(account_id);

-- Indices for public.profile
CREATE INDEX idx_profile_account_id ON public.profile(account_id);
CREATE INDEX idx_profile_archive_upload_id ON public.profile(archive_upload_id);

-- Indices for public.tweets
CREATE INDEX idx_tweets_account_id ON public.tweets(account_id);
CREATE INDEX idx_tweets_archive_upload_id ON public.tweets(archive_upload_id);

-- Indices for public.user_mentions
CREATE INDEX idx_user_mentions_mentioned_user_id ON public.user_mentions(mentioned_user_id);
CREATE INDEX idx_user_mentions_tweet_id ON public.user_mentions(tweet_id);

-- Indices for public.tweet_urls
CREATE INDEX idx_tweet_urls_tweet_id ON public.tweet_urls(tweet_id);

-- Indices for public.tweet_media
CREATE INDEX idx_tweet_media_tweet_id ON public.tweet_media(tweet_id);
CREATE INDEX idx_tweet_media_archive_upload_id ON public.tweet_media(archive_upload_id);

-- Indices for public.followers
CREATE INDEX idx_followers_account_id ON public.followers(account_id);
CREATE INDEX idx_followers_archive_upload_id ON public.followers(archive_upload_id);

-- Indices for public.following
CREATE INDEX idx_following_account_id ON public.following(account_id);
CREATE INDEX idx_following_archive_upload_id ON public.following(archive_upload_id);

-- Indices for public.likes
CREATE INDEX idx_likes_account_id ON public.likes(account_id);
CREATE INDEX idx_likes_liked_tweet_id ON public.likes(liked_tweet_id);
CREATE INDEX idx_likes_archive_upload_id ON public.likes(archive_upload_id);



--- PERMISSIONS
-- Function to apply RLS policies for most tables
CREATE OR REPLACE FUNCTION public.apply_public_rls_policies(schema_name TEXT, table_name TEXT) RETURNS void AS $$
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

    -- EXECUTE format('CREATE POLICY "Tweets are publicly visible" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
    EXECUTE format('
        CREATE POLICY "Tweets are modifiable by their users" ON %I.%I to authenticated 
        USING (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        ) 
        WITH CHECK (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        )', schema_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Function to apply RLS policies for entity tables
CREATE OR REPLACE FUNCTION public.apply_public_entities_rls_policies(schema_name TEXT, table_name TEXT) RETURNS void
set search_path TO ''
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

    -- EXECUTE format('CREATE POLICY "Entities are publicly visible" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
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
$$ LANGUAGE plpgsql;

-- Function to apply RLS policies for entity tables
CREATE OR REPLACE FUNCTION public.apply_public_liked_tweets_rls_policies(schema_name TEXT, table_name TEXT) RETURNS void
set search_path TO ''
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

    -- EXECUTE format('CREATE POLICY "Entities are publicly visible" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
    EXECUTE format('CREATE POLICY "Entities are modifiable by their users" ON %I.%I to authenticated  USING (EXISTS (SELECT 1 FROM public.account dt WHERE dt.account_id = (select auth.jwt()) -> ''app_metadata'' ->> ''provider_id'')) WITH CHECK (EXISTS (SELECT 1 FROM public.account dt WHERE dt.account_id = (select auth.jwt()) -> ''app_metadata'' ->> ''provider_id''))', schema_name, table_name, schema_name, table_name, schema_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Script to apply policies to multiple tables
DO $$
DECLARE
    tables text[][] := ARRAY[
        ARRAY['public', 'profile'],
        ARRAY['public', 'archive_upload'],
        ARRAY['public', 'account'],
        ARRAY['public', 'tweets'],
        ARRAY['public', 'likes'],
        ARRAY['public', 'followers'],
        ARRAY['public', 'following']
    ];
    t text[];
BEGIN
    FOREACH t SLICE 1 IN ARRAY tables
    LOOP
        PERFORM public.apply_public_rls_policies(t[1], t[2]);
    END LOOP;
END $$;

-- Apply entity policies
SELECT public.apply_public_entities_rls_policies('public', 'tweet_media');
SELECT public.apply_public_entities_rls_policies('public', 'tweet_urls');
SELECT public.apply_public_entities_rls_policies('public', 'user_mentions');
SELECT public.apply_public_liked_tweets_rls_policies('public', 'liked_tweets');
SELECT public.apply_public_liked_tweets_rls_policies('public', 'mentioned_users');

-- FTS index
alter table public.tweets
drop column if exists fts;

alter table public.tweets
add column fts tsvector generated always as (to_tsvector('english', full_text)) stored;


create index text_fts on public.tweets using gin (fts);

--DELETE
CREATE OR REPLACE FUNCTION public.delete_all_archives(p_account_id TEXT)
RETURNS VOID
set search_path TO ''
 AS $$
DECLARE
    v_schema_name TEXT := 'public';
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
$$ LANGUAGE plpgsql
set statement_timeout TO '20min';





-- Function to drop functions if they exist
CREATE OR REPLACE FUNCTION public.drop_function_if_exists(function_name text, function_args text[])
RETURNS void AS $$
DECLARE
    full_function_name text;
    func_oid oid;
BEGIN
    -- Find the function OID
    SELECT p.oid INTO func_oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = function_name
      AND array_length(p.proargtypes, 1) = array_length(function_args, 1)
      AND array_to_string(p.proargtypes::regtype[], ',') = array_to_string(function_args::regtype[], ',');

    -- If the function exists, drop it
    IF func_oid IS NOT NULL THEN
        full_function_name := 'public.' || function_name || '(' || array_to_string(function_args, ', ') || ')';
        EXECUTE 'DROP FUNCTION ' || full_function_name;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- -- Drop all functions in the public schema
-- DO $$
-- DECLARE
--     func_record RECORD;
-- BEGIN
--     FOR func_record IN 
--         SELECT ns.nspname AS schema_name, p.proname AS function_name, 
--                pg_get_function_identity_arguments(p.oid) AS function_args
--         FROM pg_proc p
--         JOIN pg_namespace ns ON p.pronamespace = ns.oid
--         WHERE ns.nspname = 'public'
--     LOOP
--         EXECUTE 'DROP FUNCTION IF EXISTS ' || 
--                 quote_ident(func_record.schema_name) || '.' || 
--                 quote_ident(func_record.function_name) || 
--                 '(' || func_record.function_args || ') CASCADE';
--     END LOOP;
-- END $$;

-- Inform user that functions have been dropped
DO $$
BEGIN
    RAISE NOTICE 'All functions in the public schema have been dropped.';
END $$;
-- Drop all functions in reverse order of dependency
DROP FUNCTION IF EXISTS public.process_archive CASCADE;
DROP FUNCTION IF EXISTS public.commit_temp_data CASCADE;
DROP FUNCTION IF EXISTS public.insert_temp_data CASCADE;
DROP FUNCTION IF EXISTS public.insert_temp_account CASCADE;
DROP FUNCTION IF EXISTS public.insert_temp_profiles CASCADE;
DROP FUNCTION IF EXISTS public.insert_temp_followers CASCADE;
DROP FUNCTION IF EXISTS public.insert_temp_following CASCADE;
DROP FUNCTION IF EXISTS public.create_temp_tables CASCADE;
DROP FUNCTION IF EXISTS public.insert_temp_likes CASCADE;
DROP FUNCTION IF EXISTS public.insert_temp_archive_upload CASCADE;
DROP FUNCTION IF EXISTS public.insert_temp_tweets CASCADE;
DROP FUNCTION IF EXISTS public.process_and_insert_tweet_entities CASCADE;
DROP FUNCTION IF EXISTS public.drop_temp_tables CASCADE;

  -- Inform user that functions have been dropped
  DO $$
  BEGIN
      RAISE NOTICE 'All related functions have been dropped.';
  END $$; 

  CREATE SCHEMA IF NOT EXISTS temp;

GRANT USAGE ON SCHEMA temp TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA temp TO authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA temp TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA temp TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA temp GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA temp GRANT ALL ON ROUTINES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA temp GRANT ALL ON SEQUENCES TO authenticated, service_role;
  -- Grant usage on the temp schema to authenticated users
  -- GRANT USAGE ON SCHEMA temp TO authenticated;

  -- Grant all privileges on all tables in the temp schema to authenticated users
  ALTER DEFAULT PRIVILEGES IN SCHEMA temp GRANT ALL ON TABLES TO authenticated;

  CREATE OR REPLACE FUNCTION public.create_temp_tables(p_suffix TEXT)
  RETURNS VOID
  set search_path TO '' AS $$
  BEGIN
      -- Check if the user is authenticated or is the postgres role
      IF auth.uid() IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF p_suffix != ((select (aselect uth.jwt())) -> 'app_metadata' ->> 'provider_id') AND current_user != 'postgres' THEN
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
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE OR REPLACE FUNCTION public.insert_temp_account(p_account JSONB, p_suffix TEXT)
  RETURNS VOID
  set search_path TO ''
   AS $$
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
  $$ LANGUAGE plpgsql SECURITY DEFINER;


  -- Function to insert profiles into temporary table
  CREATE OR REPLACE FUNCTION public.insert_temp_profiles(p_profile JSONB, p_account_id TEXT, p_suffix TEXT)
  RETURNS VOID 
  set search_path TO ''
  AS $$
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
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE OR REPLACE FUNCTION public.insert_temp_archive_upload(p_account_id TEXT, p_archive_at TIMESTAMP WITH TIME ZONE, p_suffix TEXT)
  RETURNS BIGINT
  set search_path TO '' 
   AS $$
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
  $$ LANGUAGE plpgsql SECURITY DEFINER;


    -- Modified insert_temp_tweets function
  CREATE OR REPLACE FUNCTION public.insert_temp_tweets(p_tweets JSONB, p_suffix TEXT)
  RETURNS VOID
  set search_path TO ''
   AS $$
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
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  -- Modified process_and_insert_tweet_entities function
  CREATE OR REPLACE FUNCTION public.process_and_insert_tweet_entities(p_tweets JSONB, p_suffix TEXT)
  RETURNS VOID
  set search_path TO ''
   AS $$
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
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE OR REPLACE FUNCTION public.insert_temp_followers(p_followers JSONB, p_account_id TEXT, p_suffix TEXT)
  RETURNS VOID
  set search_path TO ''
   AS $$
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
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE OR REPLACE FUNCTION public.insert_temp_following(p_following JSONB, p_account_id TEXT, p_suffix TEXT)
  RETURNS VOID
  set search_path TO '' AS $$
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
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE OR REPLACE FUNCTION public.insert_temp_likes(p_likes JSONB, p_account_id TEXT, p_suffix TEXT)
  RETURNS VOID
  set search_path TO ''
   AS $$
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
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  -- New function to drop temporary tables
  CREATE OR REPLACE FUNCTION public.drop_temp_tables(p_suffix TEXT)
  RETURNS VOID
  set search_path TO '' AS $$
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
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE OR REPLACE FUNCTION public.commit_temp_data(p_suffix TEXT)
  RETURNS VOID
  set search_path TO ''
   AS $$
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

      -- 2. Get the latest archive_at from temp.archive_upload
      EXECUTE format('
          SELECT archive_at 
          FROM temp.archive_upload_%s 
          ORDER BY archive_at DESC 
          LIMIT 1
      ', p_suffix) INTO v_archive_at;

      -- 3. Insert or update archive_upload and get the ID
      INSERT INTO public.archive_upload (account_id, archive_at, created_at)
      VALUES (v_account_id, v_archive_at, CURRENT_TIMESTAMP)
      ON CONFLICT (account_id, archive_at) 
      DO UPDATE SET 
          account_id = EXCLUDED.account_id, -- This effectively does nothing, but allows us to use RETURNING
          created_at = CURRENT_TIMESTAMP
      RETURNING id INTO v_archive_upload_id;

      -- Insert profile data
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

      -- raise exception 'check tweets and media suffix: % tweets:  % media: %', p_suffix, (select tweet_id from public.tweets where archive_upload_id = v_archive_upload_id), (select tweet_id from temp.tweet_media_322603863);


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


      -- Insert mentioned_users data (no archive_upload_id needed)
      EXECUTE format('
          INSERT INTO public.mentioned_users (user_id, name, screen_name, updated_at)
          SELECT user_id, name, screen_name, updated_at
          FROM temp.mentioned_users_%s
          ON CONFLICT (user_id) DO UPDATE SET 
              name = EXCLUDED.name, 
              screen_name = EXCLUDED.screen_name, 
              updated_at = EXCLUDED.updated_at
      ', p_suffix);

      -- Insert user_mentions data (no archive_upload_id needed)
      EXECUTE format('
          INSERT INTO public.user_mentions (mentioned_user_id, tweet_id)
          SELECT um.mentioned_user_id, um.tweet_id
          FROM temp.user_mentions_%s um
          JOIN public.mentioned_users mu ON um.mentioned_user_id = mu.user_id
          JOIN public.tweets t ON um.tweet_id = t.tweet_id
          ON CONFLICT (mentioned_user_id, tweet_id) DO NOTHING
      ', p_suffix);

      -- Insert tweet_urls data (no archive_upload_id needed)
      EXECUTE format('
          INSERT INTO public.tweet_urls (url, expanded_url, display_url, tweet_id)
          SELECT tu.url, tu.expanded_url, tu.display_url, tu.tweet_id
          FROM temp.tweet_urls_%s tu
          JOIN public.tweets t ON tu.tweet_id = t.tweet_id
          ON CONFLICT (tweet_id, url) DO NOTHING
      ', p_suffix);

      -- Insert followers data
      EXECUTE format('
          INSERT INTO public.followers (account_id, follower_account_id, archive_upload_id)
          SELECT f.account_id, f.follower_account_id, $1
          FROM temp.followers_%s f
          ON CONFLICT (account_id, follower_account_id) DO UPDATE SET
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;

      -- Insert following data
      EXECUTE format('
          INSERT INTO public.following (account_id, following_account_id, archive_upload_id)
          SELECT f.account_id, f.following_account_id, $1
          FROM temp.following_%s f
          ON CONFLICT (account_id, following_account_id) DO UPDATE SET
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;

      -- Insert liked_tweets data (no archive_upload_id needed)
      EXECUTE format('
          INSERT INTO public.liked_tweets (tweet_id, full_text)
          SELECT lt.tweet_id, lt.full_text
          FROM temp.liked_tweets_%s lt
          ON CONFLICT (tweet_id) DO NOTHING
      ', p_suffix);

      -- Insert likes data
      EXECUTE format('
          INSERT INTO public.likes (account_id, liked_tweet_id, archive_upload_id)
          SELECT l.account_id, l.liked_tweet_id, $1
          FROM temp.likes_%s l
          ON CONFLICT (account_id, liked_tweet_id) DO UPDATE SET
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;

      -- Call the function to drop temporary tables
      PERFORM public.drop_temp_tables(p_suffix);
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER
  set statement_timeout TO '10min'; -- set custom timeout





  CREATE OR REPLACE FUNCTION public.process_archive(archive_data JSONB)
  RETURNS VOID
  set search_path TO ''
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
  $$ LANGUAGE plpgsql SECURITY DEFINER
  set statement_timeout TO '10min'; -- set custom timeout
