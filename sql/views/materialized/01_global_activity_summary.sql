DROP MATERIALIZED VIEW IF EXISTS public.global_activity_summary;

CREATE MATERIALIZED VIEW
  public.global_activity_summary AS
SELECT
  (
    SELECT COUNT(*)
    FROM public.account
  ) AS total_accounts,
  (
    SELECT c.reltuples::bigint AS estimate
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'tweets'
    AND n.nspname = 'public'
  ) AS total_tweets,
  (
    SELECT c.reltuples::bigint AS estimate
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'liked_tweets'
    AND n.nspname = 'public'
  ) AS total_likes,
  (
    SELECT c.reltuples::bigint AS estimate
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'user_mentions'
    AND n.nspname = 'public'
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


