CREATE TABLE IF NOT EXISTS public.quote_tweets (
    tweet_id TEXT NOT NULL,
    quoted_tweet_id TEXT NOT NULL,
    
    -- Composite primary key
    PRIMARY KEY (tweet_id, quoted_tweet_id),
    
    -- Foreign key constraints
    CONSTRAINT fk_quote_tweets_tweet_id FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id) ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_quote_tweets_quoted_tweet_id ON public.quote_tweets (quoted_tweet_id);
CREATE INDEX IF NOT EXISTS idx_quote_tweets_tweet_id ON public.quote_tweets (tweet_id);