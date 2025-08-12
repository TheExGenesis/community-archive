-- Fix enriched_tweets view to use correct all_profile table
-- This migration fixes the enriched_tweets view to use all_profile instead of profile

DROP VIEW IF EXISTS public.enriched_tweets;

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
    FROM all_profile
    WHERE all_profile.account_id = t.account_id
    ORDER BY archive_upload_id DESC
    LIMIT 1
) p ON true;

-- Grant necessary permissions
GRANT SELECT ON public.enriched_tweets TO anon, authenticated;

-- Add RLS policy if needed
ALTER VIEW public.enriched_tweets OWNER TO postgres;