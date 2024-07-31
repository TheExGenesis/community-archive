-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create table for account information
CREATE TABLE dev_account (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT,
    created_via TEXT,
    username TEXT,
    account_id TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE,
    account_display_name TEXT
);

-- Create table for tweets
CREATE TABLE dev_tweets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tweet_id TEXT UNIQUE,
    account_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    full_text TEXT,
    lang TEXT,
    retweet_count INTEGER,
    favorite_count INTEGER,
    reply_to_tweet_id TEXT,
    reply_to_user_id TEXT,
    reply_to_username TEXT,
    is_retweet BOOLEAN,
    source TEXT,
    possibly_sensitive BOOLEAN,
    FOREIGN KEY (account_id) REFERENCES dev_account(account_id)
);

-- Create table for tweet entities
CREATE TABLE dev_tweet_entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tweet_id TEXT,
    entity_type TEXT,
    entity_value TEXT,
    position_index INTEGER,
    start_index INTEGER,
    end_index INTEGER,
    FOREIGN KEY (tweet_id) REFERENCES dev_tweets(tweet_id),
    UNIQUE (tweet_id, entity_type, position_index)
);


-- Create table for tweet media
CREATE TABLE dev_tweet_media (
    media_id TEXT PRIMARY KEY,
    tweet_id TEXT,
    media_url TEXT,
    media_type TEXT,
    width INTEGER,
    height INTEGER,
    FOREIGN KEY (tweet_id) REFERENCES dev_tweets(tweet_id)
);

-- Create table for followers
CREATE TABLE dev_followers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id TEXT,
    follower_account_id TEXT,
    FOREIGN KEY (account_id) REFERENCES dev_account(account_id)
);

-- Create table for following
CREATE TABLE dev_following (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id TEXT,
    following_account_id TEXT,
    FOREIGN KEY (account_id) REFERENCES dev_account(account_id)
);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE dev_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_tweets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_tweet_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_tweet_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_following ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to dev_account table" ON dev_account;
CREATE POLICY "Allow full access to dev_account table" ON dev_account USING (true) WITH CHECK (true);

-- Tweets table policy
DROP POLICY IF EXISTS "Allow full access to dev_tweets table" ON dev_tweets;
CREATE POLICY "Allow full access to dev_tweets table" ON dev_tweets USING (true) WITH CHECK (true);

-- Tweet entities table policy
DROP POLICY IF EXISTS "Allow full access to dev_tweet_entities table" ON dev_tweet_entities;
CREATE POLICY "Allow full access to dev_tweet_entities table" ON dev_tweet_entities USING (true) WITH CHECK (true);

-- Tweet media table policy
DROP POLICY IF EXISTS "Allow full access to dev_tweet_media table" ON dev_tweet_media;
CREATE POLICY "Allow full access to dev_tweet_media table" ON dev_tweet_media USING (true) WITH CHECK (true);

-- Followers table policy
DROP POLICY IF EXISTS "Allow full access to dev_followers table" ON dev_followers;
CREATE POLICY "Allow full access to dev_followers table" ON dev_followers USING (true) WITH CHECK (true);

-- Following table policy
DROP POLICY IF EXISTS "Allow full access to dev_following table" ON dev_following;
CREATE POLICY "Allow full access to dev_following table" ON dev_following USING (true) WITH CHECK (true);

