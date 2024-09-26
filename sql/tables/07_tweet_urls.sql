CREATE TABLE IF NOT EXISTS public.tweet_urls (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    url TEXT NOT NULL,
    expanded_url TEXT NOT NULL,
    display_url TEXT NOT NULL,
    tweet_id TEXT NOT NULL,
    FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id),
    UNIQUE(tweet_id, url)
);