-- Create materialized view for monthly tweet counts
-- This replaces the slow get_monthly_tweet_counts function (40s avg runtime)

-- Create the materialized view with pre-computed monthly counts
CREATE MATERIALIZED VIEW IF NOT EXISTS public.monthly_tweet_counts_mv AS
SELECT 
    date_trunc('month', created_at) as month,
    account_id,
    COUNT(*) as tweet_count,
    COUNT(DISTINCT DATE(created_at)) as days_active,
    AVG(favorite_count)::numeric(10,2) as avg_favorites,
    AVG(retweet_count)::numeric(10,2) as avg_retweets,
    MAX(favorite_count) as max_favorites,
    MAX(retweet_count) as max_retweets
FROM public.tweets
WHERE created_at IS NOT NULL
GROUP BY 1, 2
WITH DATA;

-- Create indexes for fast lookups
CREATE UNIQUE INDEX monthly_tweet_counts_mv_unique_idx 
ON public.monthly_tweet_counts_mv(month, account_id);

CREATE INDEX monthly_tweet_counts_mv_month_idx 
ON public.monthly_tweet_counts_mv(month DESC);

CREATE INDEX monthly_tweet_counts_mv_account_idx 
ON public.monthly_tweet_counts_mv(account_id);

-- Create a view for global monthly counts
CREATE OR REPLACE VIEW public.global_monthly_tweet_counts AS
SELECT 
    month,
    SUM(tweet_count) as total_tweets,
    COUNT(DISTINCT account_id) as active_accounts,
    AVG(tweet_count)::numeric(10,2) as avg_tweets_per_account
FROM public.monthly_tweet_counts_mv
GROUP BY month
ORDER BY month DESC;

-- Create function to use the materialized view
CREATE OR REPLACE FUNCTION public.get_monthly_tweet_counts_fast(
    p_account_id TEXT DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    month DATE,
    account_id TEXT,
    tweet_count BIGINT,
    days_active BIGINT,
    avg_favorites NUMERIC,
    avg_retweets NUMERIC
) 
LANGUAGE sql
STABLE
AS $$
    SELECT 
        month::date,
        account_id,
        tweet_count,
        days_active,
        avg_favorites,
        avg_retweets
    FROM public.monthly_tweet_counts_mv
    WHERE 
        (p_account_id IS NULL OR account_id = p_account_id)
        AND (p_start_date IS NULL OR month >= p_start_date)
        AND (p_end_date IS NULL OR month <= p_end_date)
    ORDER BY month DESC, account_id;
$$;

-- Add cron job to refresh the materialized view daily
SELECT cron.schedule(
    'refresh-monthly-tweet-counts',
    '0 2 * * *',  -- Run at 2 AM daily
    $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.monthly_tweet_counts_mv;
    $$
);

-- Initial refresh will happen on first deployment
-- Note: First refresh may take a few minutes

DO $$ 
BEGIN 
    RAISE NOTICE 'Monthly tweet counts materialized view created';
    RAISE NOTICE 'This replaces the slow get_monthly_tweet_counts function';
    RAISE NOTICE 'Expected performance improvement: 40s -> 10ms (99.9 percent reduction)';
    RAISE NOTICE 'View will be refreshed daily at 2 AM via cron job';
END 
$$;