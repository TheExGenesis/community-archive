DROP MATERIALIZED VIEW IF EXISTS public.global_activity_summary;

CREATE MATERIALIZED VIEW
  public.global_activity_summary AS
SELECT
  (
    SELECT COUNT(DISTINCT account_id) FROM public.account
  ) AS total_accounts,
  (
    SELECT COUNT(DISTINCT tweet_id) FROM public.tweets
  ) AS total_tweets,
  (
    SELECT COUNT(DISTINCT liked_tweet_id) FROM public.likes
  ) AS total_likes,
  (
    SELECT COUNT(DISTINCT tweet_id) FROM public.user_mentions
  ) AS total_user_mentions,
  (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT * FROM public.get_top_mentioned_users(30)
    ) t
  ) AS top_mentioned_users,
  (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT * FROM public.get_top_accounts_with_followers(10)
    ) t
  ) AS top_accounts_with_followers,
  CURRENT_TIMESTAMP AS last_updated;

-- Add a unique index on the last_updated column
CREATE UNIQUE INDEX idx_global_activity_summary_last_updated 
ON public.global_activity_summary (last_updated);


DROP MATERIALIZED VIEW IF EXISTS public.account_activity_summary;

CREATE MATERIALIZED VIEW public.account_activity_summary AS
SELECT
  a.account_id,
  a.username,
  a.num_tweets,
  a.num_followers,
  (SELECT COUNT(*) FROM public.likes l WHERE l.account_id = a.account_id) AS total_likes,
  (SELECT COUNT(*) FROM public.user_mentions um JOIN public.tweets t ON um.tweet_id = t.tweet_id WHERE t.account_id = a.account_id) AS total_mentions,
  (SELECT json_agg(row_to_json(m)) FROM (
    SELECT * FROM get_account_most_mentioned_accounts(a.username, 20)
  ) m) AS mentioned_accounts,
  (SELECT json_agg(row_to_json(rt)) FROM (
    SELECT * FROM get_account_top_retweet_count_tweets(a.username, 100)
  ) rt) AS most_retweeted_tweets,
  (SELECT json_agg(row_to_json(f)) FROM (
    SELECT * FROM get_account_top_favorite_count_tweets(a.username, 100)
  ) f) AS most_favorited_tweets,
  CURRENT_TIMESTAMP AS last_updated
FROM public.account a;

CREATE UNIQUE INDEX idx_account_activity_summary_account_id
ON public.account_activity_summary (account_id);
