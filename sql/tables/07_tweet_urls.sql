CREATE TABLE IF NOT EXISTS public.tweet_urls (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    url TEXT NOT NULL,
    expanded_url TEXT NOT NULL,
    display_url TEXT NOT NULL,
    tweet_id TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id),
    UNIQUE(tweet_id, url)
);

CREATE INDEX "idx_tweet_urls_tweet_id" ON "public"."tweet_urls" USING "btree" ("tweet_id");
CREATE INDEX IF NOT EXISTS idx_tweet_urls_expanded_url_gin ON public.tweet_urls USING gin (expanded_url gin_trgm_ops);
