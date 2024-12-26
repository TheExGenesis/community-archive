CREATE VIEW
  public.tweet_replies_view AS
SELECT
  reply_to_tweet_id,
  reply_to_user_id
FROM
  public.tweets
WHERE
  reply_to_tweet_id IS NOT NULL;
  