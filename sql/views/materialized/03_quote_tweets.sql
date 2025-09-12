CREATE OR REPLACE MATERIALIZED VIEW
  public.quote_tweets AS
SELECT
  t.tweet_id AS TWEET_ID,
  SUBSTRING(
    tu.expanded_url
    FROM
      'status/([0-9]+)'
  ) AS QUOTED_TWEET_ID
FROM
  public.tweet_urls tu
  JOIN public.tweets t ON tu.tweet_id = t.tweet_id
WHERE
  tu.expanded_url LIKE 'https://twitter.com/%/status/%'
  OR tu.expanded_url LIKE 'https://x.com/%/status/%';

CREATE INDEX IF NOT EXISTS idx_quote_tweets_quoted_tweet_id ON public.quote_tweets (QUOTED_TWEET_ID);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_quote_tweets ON public.quote_tweets (TWEET_ID, QUOTED_TWEET_ID);