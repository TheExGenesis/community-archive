
CREATE OR REPLACE FUNCTION public.get_account_most_liked_tweets_archive_users(
    username_ TEXT,
    limit_ INTEGER DEFAULT NULL
) RETURNS TABLE (
  tweet_id TEXT,
  account_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  full_text TEXT,
  retweet_count INTEGER,
  favorite_count INTEGER,
  reply_to_tweet_id TEXT,
  reply_to_user_id TEXT,
  reply_to_username TEXT,
  archive_upload_id BIGINT,
  num_likes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tweet_id, 
        t.account_id, 
        t.created_at, 
        t.full_text, 
        t.retweet_count, 
        t.favorite_count, 
        t.reply_to_tweet_id, 
        t.reply_to_user_id, 
        t.reply_to_username, 
        t.archive_upload_id, 
        COUNT(l.liked_tweet_id) AS num_likes 
    FROM 
        public.tweets t 
    JOIN 
        public.account a ON t.account_id = a.account_id 
    LEFT JOIN 
        public.likes l ON t.tweet_id = l.liked_tweet_id 
    WHERE 
        a.username = username_ 
    GROUP BY 
        t.tweet_id, 
        t.full_text 
    ORDER BY 
        num_likes DESC
    LIMIT limit_;
END;
$$ LANGUAGE plpgsql;