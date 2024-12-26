CREATE INDEX IF NOT EXISTS idx_tweets_reply_to_user_id ON public.tweets USING btree (reply_to_user_id) TABLESPACE pg_default;
CREATE VIEW
  public.tweet_replies_view AS
SELECT
  reply_to_tweet_id,
  reply_to_user_id
FROM
  public.tweets
WHERE
  reply_to_tweet_id IS NOT NULL;
