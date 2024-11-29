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
  -- (SELECT json_agg(row_to_json(l)) FROM (
  --   SELECT * FROM get_account_most_liked_tweets_archive_users(a.username, 20)
  -- ) l) AS most_liked_tweets_by_archive_users,
  -- (SELECT json_agg(row_to_json(r)) FROM (
  --   SELECT * FROM get_account_most_replied_tweets_by_archive_users(a.username, 20)
  -- ) r) AS most_replied_tweets_by_archive_users,
  (SELECT json_agg(row_to_json(rt)) FROM (
    SELECT * FROM get_account_top_retweet_count_tweets(a.username, 20)
  ) rt) AS most_retweeted_tweets,
  (SELECT json_agg(row_to_json(f)) FROM (
    SELECT * FROM get_account_top_favorite_count_tweets(a.username, 20)
  ) f) AS most_favorited_tweets
FROM public.account a;
-- DROP FUNCTION IF EXISTS refresh_account_activity_summary() CASCADE;

-- CREATE OR REPLACE FUNCTION refresh_account_activity_summary()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   REFRESH MATERIALIZED VIEW public.account_activity_summary;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- DROP TRIGGER IF EXISTS update_account_activity_summary ON public.archive_upload;

-- CREATE TRIGGER update_account_activity_summary
-- AFTER UPDATE OF upload_phase ON public.archive_upload
-- FOR EACH ROW
-- WHEN (NEW.upload_phase = 'completed')
-- EXECUTE FUNCTION refresh_account_activity_summary();;
