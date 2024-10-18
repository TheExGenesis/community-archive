CREATE OR REPLACE FUNCTION public.get_monthly_tweet_counts () RETURNS TABLE (
  MONTH TIMESTAMP WITH TIME ZONE,
  tweet_count bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE_TRUNC('month', created_at) AS month,
        COUNT(tweet_id) AS tweet_count
    FROM 
        public.tweets
    GROUP BY 
        month
    ORDER BY 
        month;
END;
$$ LANGUAGE plpgsql
SET statement_timeout TO '5min';;
