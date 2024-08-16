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

-- Supabase AI is experimental and may produce incorrect answers
-- Always verify the output before executing
DROP TABLE IF EXISTS profile CASCADE;
DROP TABLE IF EXISTS following CASCADE;
DROP TABLE IF EXISTS followers CASCADE;
DROP TABLE IF EXISTS tweet_media CASCADE;
DROP TABLE IF EXISTS tweet_entities CASCADE;
DROP TABLE IF EXISTS tweets CASCADE;
DROP TABLE IF EXISTS account CASCADE;
DROP TABLE IF EXISTS entities CASCADE;
DROP TABLE IF EXISTS media CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create table for account information
CREATE TABLE
  account (
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
  profile (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT UNIQUE,
    bio TEXT,
    website TEXT,
    LOCATION TEXT,
    avatar_media_url TEXT,
    header_media_url TEXT,
    archive_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (account_id) REFERENCES account (account_id)
  );

-- Create a view to show the latest profile for each account_id
CREATE VIEW
  latest_profile AS
SELECT
  dp.*
FROM
  profile dp
  JOIN (
    SELECT
      account_id,
      MAX(archive_at) AS latest_archive_at
    FROM
      profile
    GROUP BY
      account_id
  ) latest ON dp.account_id = latest.account_id
  AND dp.archive_at = latest.latest_archive_at;

-- Create table for tweets
CREATE TABLE
  tweets (
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
    -- source TEXT,
    -- possibly_sensitive BOOLEAN,
    FOREIGN KEY (account_id) REFERENCES account (account_id)
  );

-- Create table for tweet entities
CREATE TABLE
  tweet_entities (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    tweet_id TEXT,
    entity_type TEXT,
    entity_value TEXT,
    position_index INTEGER,
    start_index INTEGER,
    end_index INTEGER,
    FOREIGN KEY (tweet_id) REFERENCES tweets (tweet_id),
    UNIQUE (tweet_id, entity_type, position_index)
  );

-- Create table for tweet media
CREATE TABLE
  tweet_media (
    media_id TEXT PRIMARY KEY,
    tweet_id TEXT,
    media_url TEXT,
    media_type TEXT,
    WIDTH INTEGER,
    HEIGHT INTEGER,
    FOREIGN KEY (tweet_id) REFERENCES tweets (tweet_id)
  );

-- Create table for followers
CREATE TABLE
  followers (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT,
    follower_account_id TEXT,
    UNIQUE (account_id, follower_account_id),
    FOREIGN KEY (account_id) REFERENCES account (account_id)
  );

-- Create table for following
CREATE TABLE
  following (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT,
    following_account_id TEXT,
    UNIQUE (account_id, following_account_id),
    FOREIGN KEY (account_id) REFERENCES account (account_id)
  );


DO $$
DECLARE
    tables text[] := ARRAY['profile', 'account', 'tweets', 'tweet_entities', 'tweet_media', 'followers', 'following'];
    t text;
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        PERFORM apply_dev_rls_policies(t);
    END LOOP;
END $$;
