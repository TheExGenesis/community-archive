



DROP VIEW IF EXISTS public.enriched_tweets;
DROP MATERIALIZED VIEW IF EXISTS public.quote_tweets;

-- Create table for Quote Tweets - stores relationships between tweets and their quoted tweets
CREATE TABLE IF NOT EXISTS public.quote_tweets (
    tweet_id TEXT NOT NULL,
    quoted_tweet_id TEXT NOT NULL,
    
    -- Composite primary key
    PRIMARY KEY (tweet_id, quoted_tweet_id),
    
    -- Foreign key constraints
    CONSTRAINT fk_quote_tweets_tweet_id FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.retweets (
    tweet_id TEXT NOT NULL PRIMARY KEY,
    retweeted_tweet_id TEXT NULL,
       
    CONSTRAINT fk_retweets_tweet_id FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id) ON DELETE CASCADE,
    CONSTRAINT fk_retweets_retweeted_tweet_id FOREIGN KEY (retweeted_tweet_id) REFERENCES public.tweets (tweet_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_quote_tweets_tweet_id ON public.quote_tweets (tweet_id);
CREATE INDEX IF NOT EXISTS idx_quote_tweets_quoted_tweet_id ON public.quote_tweets (quoted_tweet_id);

CREATE INDEX IF NOT EXISTS idx_retweets_tweet_id ON public.retweets (tweet_id);
CREATE INDEX IF NOT EXISTS idx_retweets_retweeted_tweet_id ON public.retweets (retweeted_tweet_id);

COMMENT ON TABLE public.quote_tweets IS 'Stores relationships between tweets and their quoted tweets';
COMMENT ON COLUMN public.quote_tweets.tweet_id IS 'The ID of the tweet that contains the quote';
COMMENT ON COLUMN public.quote_tweets.quoted_tweet_id IS 'The ID of the tweet being quoted';

COMMENT ON TABLE public.retweets IS 'Stores relationships between tweets and their retweeted tweets';
COMMENT ON COLUMN public.retweets.tweet_id IS 'The ID of the retweet';
COMMENT ON COLUMN public.retweets.retweeted_tweet_id IS 'The ID of the original tweet being retweeted';


CREATE OR REPLACE VIEW public.enriched_tweets AS
SELECT 
    t.tweet_id,
    t.account_id,
    a.username,
    a.account_display_name,
    t.created_at,
    t.full_text,
    t.retweet_count,
    t.favorite_count,
    t.reply_to_tweet_id,
    t.reply_to_user_id,
    t.reply_to_username,
    qt.quoted_tweet_id,
    c.conversation_id,
    p.avatar_media_url,
    t.archive_upload_id
FROM tweets t
JOIN all_account a ON t.account_id = a.account_id
LEFT JOIN conversations c ON t.tweet_id = c.tweet_id
LEFT JOIN quote_tweets qt ON t.tweet_id = qt.tweet_id
LEFT JOIN LATERAL (
    SELECT avatar_media_url
    FROM all_profile
    WHERE all_profile.account_id = t.account_id
    ORDER BY archive_upload_id DESC
    LIMIT 1
) p ON true; 


-- Create a temporary table to batch process the data
CREATE TEMP TABLE temp_quote_tweets AS
SELECT
  DISTINCT
  t.tweet_id AS tweet_id,
  SUBSTRING(
    tu.expanded_url
    FROM
      'status/([0-9]+)'
  ) AS quoted_tweet_id
FROM
  public.tweet_urls tu
  JOIN public.tweets t ON tu.tweet_id = t.tweet_id
WHERE
  (tu.expanded_url LIKE '%twitter.com/%/status/%'
  OR tu.expanded_url LIKE '%x.com/%/status/%')
  AND tu.expanded_url ~ 'status/[0-9]+(/|$|\?)';

-- Create index on temp table for better performance
CREATE INDEX ON temp_quote_tweets (tweet_id, quoted_tweet_id);

-- Insert in batches to avoid memory issues
INSERT INTO public.quote_tweets (tweet_id, quoted_tweet_id)
SELECT tweet_id, quoted_tweet_id
FROM temp_quote_tweets
WHERE quoted_tweet_id IS NOT NULL;

-- Clean up temp table
DROP TABLE temp_quote_tweets;
