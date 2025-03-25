CREATE OR REPLACE VIEW public.enriched_tweets AS
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
    qt.quoted_tweet_id,
    c.conversation_id,
    p.avatar_media_url,
    t.archive_upload_id
FROM tweets t
JOIN all_account a ON t.account_id = a.account_id
LEFT JOIN conversations c ON t.tweet_id = c.tweet_id
LEFT JOIN quote_tweets qt ON t.tweet_id = qt.tweet_id
LEFT JOIN LATERAL (
    SELECT avatar_media_url
    FROM profile
    WHERE profile.account_id = t.account_id
    ORDER BY archive_upload_id DESC
    LIMIT 1
) p ON true;

CREATE INDEX IF NOT EXISTS idx_profile_account_id_archive_upload_id ON profile(account_id, archive_upload_id DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_tweet_id ON conversations(tweet_id);
CREATE INDEX IF NOT EXISTS idx_quote_tweets_tweet_id ON quote_tweets(tweet_id);