CREATE TABLE IF NOT EXISTS public.all_account (
    account_id TEXT PRIMARY KEY,
    created_via TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    account_display_name TEXT NOT NULL,
    num_tweets INTEGER DEFAULT 0,
    num_following INTEGER DEFAULT 0,
    num_followers INTEGER DEFAULT 0,
    num_likes INTEGER DEFAULT 0
);