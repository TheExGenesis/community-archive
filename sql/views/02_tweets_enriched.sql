CREATE OR REPLACE VIEW public.tweets_enriched AS
SELECT 
    t.tweet_id,
    t.account_id,
    a.username,
    a.account_display_name,
    t.created_at,
    t.full_text,
    t.retweet_count,
    t.favorite_count,
    t.reply_to_tweet_id,
    t.reply_to_user_id,
    t.reply_to_username,
    -- Get quoted tweet info
    qt.quoted_tweet_id,
    c.conversation_id,
    -- Get latest avatar URL from profile
    (SELECT p.avatar_media_url
     FROM profile p 
     WHERE p.account_id = t.account_id
     ORDER BY p.archive_upload_id DESC 
     LIMIT 1) as avatar_media_url,
    t.archive_upload_id
FROM tweets t
JOIN account a ON t.account_id = a.account_id
LEFT JOIN conversations c ON t.tweet_id = c.tweet_id
LEFT JOIN quote_tweets qt ON t.tweet_id = qt.tweet_id; 