CREATE TABLE IF NOT EXISTS public.liked_tweets (
    tweet_id TEXT PRIMARY KEY,
    full_text TEXT NOT NULL
);