DROP MATERIALIZED VIEW IF EXISTS public.account_activity_summary;

CREATE MATERIALIZED VIEW public.account_activity_summary AS
WITH tweet_stats AS (
  -- Pre-calculate tweet metrics in one pass
  SELECT 
    account_id,
    COUNT(*) as tweet_count,
    COUNT(DISTINCT um.mentioned_user_id) as unique_mentions,
    COUNT(um.mentioned_user_id) as total_mentions
  FROM public.tweets t
  LEFT JOIN public.user_mentions um ON t.tweet_id = um.tweet_id
  GROUP BY account_id
),
account_mentions AS (
  -- Optimize mentions aggregation with window function
  SELECT DISTINCT ON (account_id, mentioned_user_id)
    t.account_id,
    um.mentioned_user_id,
    mu.name,
    mu.screen_name,
    COUNT(*) OVER (PARTITION BY t.account_id, um.mentioned_user_id) as mention_count,
    ROW_NUMBER() OVER (PARTITION BY t.account_id ORDER BY COUNT(*) OVER (PARTITION BY t.account_id, um.mentioned_user_id) DESC) as mention_rank
  FROM public.tweets t
  JOIN public.user_mentions um ON t.tweet_id = um.tweet_id
  LEFT JOIN public.mentioned_users mu ON mu.user_id = um.mentioned_user_id
),
top_tweets AS (
  -- Optimize engagement calculation
  SELECT 
    account_id,
    json_agg(tweet_data ORDER BY engagement_score DESC) FILTER (WHERE rank <= 100) as top_engaged_tweets
  FROM (
    SELECT 
      account_id,
      json_build_object(
        'tweet_id', tweet_id,
        'account_id', account_id,
        'created_at', created_at,
        'full_text', full_text,
        'retweet_count', retweet_count,
        'favorite_count', favorite_count,
        'reply_to_tweet_id', reply_to_tweet_id,
        'reply_to_user_id', reply_to_user_id,
        'reply_to_username', reply_to_username,
        'archive_upload_id', archive_upload_id,
        'engagement_score', retweet_count + favorite_count
      ) as tweet_data,
      retweet_count + favorite_count as engagement_score,
      ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY (retweet_count + favorite_count) DESC) as rank
    FROM public.tweets
  ) ranked
  GROUP BY account_id
),
like_counts AS (
  -- Pre-calculate likes
  SELECT account_id, COUNT(*) as total_likes
  FROM public.likes
  GROUP BY account_id
)
SELECT
  a.account_id,
  a.username,
  a.num_tweets,
  a.num_followers,
  COALESCE(l.total_likes, 0) AS total_likes,
  COALESCE(ts.total_mentions, 0) AS total_mentions,
  COALESCE(
    (SELECT json_agg(json_build_object(
      'user_id', mentioned_user_id,
      'name', name,
      'screen_name', screen_name,
      'mention_count', mention_count
    ))
    FROM account_mentions am 
    WHERE am.account_id = a.account_id 
    AND mention_rank <= 20), 
    '[]'::json
  ) AS mentioned_accounts,
  COALESCE(tt.top_engaged_tweets, '[]'::json) AS top_engaged_tweets,
  COALESCE(tt.top_engaged_tweets, '[]'::json) AS most_favorited_tweets,
  COALESCE(tt.top_engaged_tweets, '[]'::json) AS most_retweeted_tweets,
  CURRENT_TIMESTAMP AS last_updated
FROM public.account a
LEFT JOIN tweet_stats ts ON ts.account_id = a.account_id
LEFT JOIN like_counts l ON l.account_id = a.account_id
LEFT JOIN top_tweets tt ON tt.account_id = a.account_id;

CREATE UNIQUE INDEX idx_account_activity_summary_account_id
ON public.account_activity_summary (account_id);

CREATE TABLE IF NOT EXISTS private.materialized_view_refresh_logs (
    view_name text NOT NULL,
    refresh_started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    refresh_completed_at timestamptz,
    duration_ms bigint
);

CREATE OR REPLACE FUNCTION private.refresh_account_activity_summary()
RETURNS void AS $$
DECLARE
    start_time timestamptz;
    end_time timestamptz;
BEGIN
    start_time := CURRENT_TIMESTAMP;
    
    INSERT INTO private.materialized_view_refresh_logs (view_name)
    VALUES ('account_activity_summary');

    REFRESH MATERIALIZED VIEW public.account_activity_summary;
    
    end_time := CURRENT_TIMESTAMP;
    
    UPDATE private.materialized_view_refresh_logs
    SET refresh_completed_at = end_time,
        duration_ms = EXTRACT(EPOCH FROM (end_time - start_time)) * 1000
    WHERE view_name = 'account_activity_summary'
    AND refresh_started_at = start_time;
END;
$$ LANGUAGE plpgsql;
