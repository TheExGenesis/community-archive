-- Create a function to apply restrictive RLS policies
CREATE OR REPLACE FUNCTION apply_dev_rls_policies(table_name text)
RETURNS void AS $$
BEGIN
    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    
    -- Create a policy that only allows access (read and write) when using the service role
    EXECUTE format('CREATE POLICY "dev tables can be read and written to by anyone" ON %I FOR ALL USING  (true)', table_name);
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT apply_dev_rls_policies('dev_table1');
-- SELECT apply_dev_rls_policies('dev_table2');

DROP TABLE IF EXISTS dev_profile CASCADE;
DROP TABLE IF EXISTS dev_following CASCADE;
DROP TABLE IF EXISTS dev_followers CASCADE;
DROP TABLE IF EXISTS dev_tweet_media CASCADE;
DROP TABLE IF EXISTS dev_tweet_entities CASCADE;
DROP TABLE IF EXISTS dev_tweets CASCADE;
DROP TABLE IF EXISTS dev_account CASCADE;
DROP TABLE IF EXISTS dev_entities CASCADE;
DROP TABLE IF EXISTS dev_media CASCADE;
DROP TABLE IF EXISTS dev_users CASCADE;


-- Supabase AI is experimental and may produce incorrect answers
-- Always verify the output before executing


-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create table for account information
CREATE TABLE
  dev_account (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    -- email TEXT,
    created_via TEXT,
    username TEXT,
    account_id TEXT UNIQUE,
    archive_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    account_display_name TEXT
  );


-- Create table for profiles
CREATE TABLE
  dev_profile (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT UNIQUE,
    bio TEXT,
    website TEXT,
    LOCATION TEXT,
    avatar_media_url TEXT,
    header_media_url TEXT,
    archive_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (account_id) REFERENCES dev_account (account_id)
  );

-- Create a view to show the latest profile for each account_id
CREATE VIEW
  latest_dev_profile AS
SELECT
  dp.*
FROM
  dev_profile dp
  JOIN (
    SELECT
      account_id,
      MAX(archive_at) AS latest_archive_at
    FROM
      dev_profile
    GROUP BY
      account_id
  ) latest ON dp.account_id = latest.account_id
  AND dp.archive_at = latest.latest_archive_at;

-- Create table for tweets
CREATE TABLE
  dev_tweets (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    tweet_id TEXT UNIQUE,
    account_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    full_text TEXT,
    -- lang TEXT,
    retweet_count INTEGER,
    favorite_count INTEGER,
    reply_to_tweet_id TEXT,
    reply_to_user_id TEXT,
    reply_to_username TEXT,
    is_retweet BOOLEAN,
    FOREIGN KEY (account_id) REFERENCES dev_account (account_id)
  );

-- Create table for tweet entities
CREATE TABLE
  dev_tweet_entities (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    tweet_id TEXT,
    entity_type TEXT,
    entity_value TEXT,
    position_index INTEGER,
    start_index INTEGER,
    end_index INTEGER,
    FOREIGN KEY (tweet_id) REFERENCES dev_tweets (tweet_id),
    UNIQUE (tweet_id, entity_type, position_index)
  );

-- Create table for tweet media
CREATE TABLE
  dev_tweet_media (
    media_id TEXT PRIMARY KEY,
    tweet_id TEXT,
    media_url TEXT,
    media_type TEXT,
    WIDTH INTEGER,
    HEIGHT INTEGER,
    FOREIGN KEY (tweet_id) REFERENCES dev_tweets (tweet_id)
  );

-- Create table for followers
CREATE TABLE
  dev_followers (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT,
    follower_account_id TEXT,
    UNIQUE (account_id, follower_account_id),
    FOREIGN KEY (account_id) REFERENCES dev_account (account_id)
  );

-- Create table for following
CREATE TABLE
  dev_following (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT,
    following_account_id TEXT,
    UNIQUE (account_id, following_account_id),
    FOREIGN KEY (account_id) REFERENCES dev_account (account_id)
  );



DO $$
DECLARE
    tables text[] := ARRAY['dev_profile', 'dev_account', 'dev_tweets', 'dev_tweet_entities', 'dev_tweet_media', 'dev_followers', 'dev_following'];
    t text;
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        PERFORM apply_dev_rls_policies(t);
    END LOOP;
END $$;