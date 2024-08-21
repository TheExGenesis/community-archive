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
    created_via TEXT,
    username TEXT,
    -- account_id TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE,
    account_display_name TEXT
  );

-- Create table for profiles
CREATE TABLE
  public.archive_upload (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT,
    archive_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (account_id, archive_at),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id)
  );

-- Create table for profiles
CREATE TABLE
  public.profile (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT UNIQUE, 
    bio TEXT,
    website TEXT,
    LOCATION TEXT,
    avatar_media_url TEXT,
    header_media_url TEXT,
    archive_upload_id BIGINT,
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id)
  );

-- Create table for tweets
CREATE TABLE
  public.tweets (
    tweet_id TEXT PRIMARY KEY,
    account_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    full_text TEXT,
    retweet_count INTEGER,
    favorite_count INTEGER,
    reply_to_tweet_id TEXT,
    reply_to_user_id TEXT,
    reply_to_username TEXT,
    archive_upload_id BIGINT,
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id)
  );

-- Create table for mentioned users
CREATE TABLE
  public.mentioned_users (
    user_id TEXT PRIMARY KEY,
    name TEXT,
    screen_name TEXT,
    updated_at TIMESTAMP WITH TIME ZONE
  ) ;

CREATE TABLE
  public.user_mentions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    mentioned_user_id TEXT,
    tweet_id TEXT,
    foreign key (tweet_id) references public.tweets (tweet_id),
    foreign key (mentioned_user_id) references public.mentioned_users (user_id),
    unique(mentioned_user_id, tweet_id)
  );

-- Create table for URLs
CREATE TABLE
  public.tweet_urls (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    url TEXT,
    expanded_url TEXT,
    display_url TEXT,
    tweet_id TEXT,
    foreign key (tweet_id) references public.tweets (tweet_id),
    unique(tweet_id, url)
  );



-- Create table for tweet media
CREATE TABLE
  public.tweet_media (
    media_id BIGINT PRIMARY KEY,
    tweet_id TEXT,
    media_url TEXT,
    media_type TEXT,
    WIDTH INTEGER,
    HEIGHT INTEGER,
    archive_upload_id BIGINT,
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id)
  );

-- Create table for followers
CREATE TABLE
  public.followers (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT,
    follower_account_id TEXT,
    archive_upload_id BIGINT,
    UNIQUE (account_id, follower_account_id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id)
  );

-- Create table for following
CREATE TABLE
  public.following (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT,
    following_account_id TEXT,
    archive_upload_id BIGINT,
    UNIQUE (account_id, following_account_id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id)
  );

CREATE TABLE
  public.liked_tweets (
    tweet_id TEXT PRIMARY KEY,
    full_text TEXT
  );

-- Create table for likes
CREATE TABLE
  public.likes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT,
    liked_tweet_id TEXT,
    archive_upload_id BIGINT,
    UNIQUE (account_id, liked_tweet_id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id),
    FOREIGN KEY (liked_tweet_id) REFERENCES public.liked_tweets (tweet_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id)
  );


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

    EXECUTE format('CREATE POLICY "Tweets are publicly visible" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
    EXECUTE format('CREATE POLICY "Tweets are modifiable by their users" ON %I.%I FOR ALL USING (account_id = auth.jwt() -> ''app_metadata'' ->> ''provider_id'') WITH CHECK (account_id = auth.jwt() -> ''app_metadata'' ->> ''provider_id'')', schema_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Function to apply RLS policies for entity tables
CREATE OR REPLACE FUNCTION public.apply_public_entities_rls_policies(schema_name TEXT, table_name TEXT) RETURNS void AS $$
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
    EXECUTE format('CREATE POLICY "Entities are modifiable by their users" ON %I.%I FOR ALL USING (EXISTS (SELECT 1 FROM public.tweets dt WHERE dt.account_id = auth.jwt() -> ''app_metadata'' ->> ''provider_id'' AND dt.tweet_id = %I.%I.tweet_id)) WITH CHECK (EXISTS (SELECT 1 FROM public.tweets dt WHERE dt.account_id = auth.jwt() -> ''app_metadata'' ->> ''provider_id'' AND dt.tweet_id = %I.%I.tweet_id))', schema_name, table_name, schema_name, table_name, schema_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Function to apply RLS policies for entity tables
CREATE OR REPLACE FUNCTION public.apply_public_liked_tweets_rls_policies(schema_name TEXT, table_name TEXT) RETURNS void AS $$
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
    EXECUTE format('CREATE POLICY "Entities are modifiable by their users" ON %I.%I FOR ALL USING (EXISTS (SELECT 1 FROM public.account dt WHERE dt.account_id = auth.jwt() -> ''app_metadata'' ->> ''provider_id'')) WITH CHECK (EXISTS (SELECT 1 FROM public.account dt WHERE dt.account_id = auth.jwt() -> ''app_metadata'' ->> ''provider_id''))', schema_name, table_name, schema_name, table_name, schema_name, table_name);
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
