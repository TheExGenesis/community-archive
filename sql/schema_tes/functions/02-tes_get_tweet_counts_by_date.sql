DROP FUNCTION IF EXISTS tes.get_tweet_counts_by_date;

CREATE OR REPLACE FUNCTION tes.get_tweet_counts_by_date(p_account_id TEXT)
RETURNS TABLE (tweet_date DATE, tweet_count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(created_at) AS tweet_date,
        COUNT(*) AS tweet_count
    FROM 
        public.tweets
    WHERE 
        account_id = p_account_id
    GROUP BY 
        DATE(created_at)
    ORDER BY 
        tweet_date;
END;
$$ LANGUAGE plpgsql;