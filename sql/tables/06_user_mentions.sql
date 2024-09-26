CREATE TABLE IF NOT EXISTS public.user_mentions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    mentioned_user_id TEXT NOT NULL,
    tweet_id TEXT NOT NULL,
    FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id),
    FOREIGN KEY (mentioned_user_id) REFERENCES public.mentioned_users (user_id),
    UNIQUE(mentioned_user_id, tweet_id)
);