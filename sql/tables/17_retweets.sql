CREATE TABLE IF NOT EXISTS public.retweets (
    tweet_id TEXT NOT NULL PRIMARY KEY,
    retweeted_tweet_id TEXT NULL,
       
    CONSTRAINT fk_retweets_tweet_id FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id) ON DELETE CASCADE,
    CONSTRAINT fk_retweets_retweeted_tweet_id FOREIGN KEY (retweeted_tweet_id) REFERENCES public.tweets (tweet_id) ON DELETE SET NULL
);