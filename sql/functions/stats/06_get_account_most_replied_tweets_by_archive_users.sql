
CREATE
OR REPLACE FUNCTION public.get_account_most_replied_tweets_by_archive_users (username_ TEXT, limit_count INTEGER) RETURNS TABLE (
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
  num_replies BIGINT
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
        t.archive_upload_id , 
        COUNT(r.reply_to_tweet_id) AS num_replies 
    FROM 
        public.tweets t 
    JOIN 
        public.account a ON t.account_id = a.account_id 
    LEFT JOIN 
        public.tweets r ON t.tweet_id = r.reply_to_tweet_id 
    WHERE 
        a.username = username_
    GROUP BY 
        t.tweet_id, 
        t.full_text 
    ORDER BY 
        num_replies DESC 
    LIMIT 
        limit_count;
END;
$$ LANGUAGE plpgsql;
