-- Function 4: get_top_mentioned_users_not_uploaded
DROP FUNCTION IF EXISTS public.get_top_mentioned_users_not_uploaded();
CREATE OR REPLACE FUNCTION public.get_top_mentioned_users_not_uploaded()
RETURNS TABLE (
    mentioned_user_id TEXT,
    name TEXT,
    screen_name TEXT,
    mention_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH TopMentionedUsers AS (
        SELECT
            um.mentioned_user_id,
            COUNT(*) AS mention_count
        FROM
            public.user_mentions um
        GROUP BY
            um.mentioned_user_id
        ORDER BY
            mention_count DESC
        LIMIT
            100
    )
    SELECT
        t.mentioned_user_id,
        mu.name,
        mu.screen_name,
        t.mention_count
    FROM
        TopMentionedUsers t
        JOIN public.mentioned_users mu ON t.mentioned_user_id = mu.user_id
        LEFT JOIN public.profile u ON t.mentioned_user_id = u.account_id
    WHERE
        u.id IS NULL
    ORDER BY
        t.mention_count DESC;
END;
$$ LANGUAGE plpgsql;
-- Function 5: get_account_most_liked_tweets_archive_users
DROP FUNCTION IF EXISTS public.get_account_most_liked_tweets_archive_users(TEXT, INTEGER);
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
-- Function 6: get_account_most_replied_tweets_by_archive_users
DROP FUNCTION IF EXISTS public.get_account_most_replied_tweets_by_archive_users(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.get_account_most_replied_tweets_by_archive_users (
    username_ TEXT, 
    limit_count INTEGER
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
-- Function 7: get_account_top_retweet_count_tweets
DROP FUNCTION IF EXISTS public.get_account_top_retweet_count_tweets(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.get_account_top_retweet_count_tweets (
    username_ TEXT, 
    limit_ INTEGER
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
  archive_upload_id BIGINT
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
        t.archive_upload_id 
    FROM 
        public.tweets t 
    JOIN 
        public.account a ON t.account_id = a.account_id 
    WHERE 
        a.username = username_
    ORDER BY 
        t.retweet_count DESC 
    LIMIT 
        limit_;
END;
$$ LANGUAGE plpgsql;
-- Function 8: get_account_most_mentioned_accounts
DROP FUNCTION IF EXISTS public.get_account_most_mentioned_accounts(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.get_account_most_mentioned_accounts (
    username_ TEXT, 
    limit_ INTEGER
) RETURNS TABLE (
  mentioned_user_id TEXT,
  mentioned_username TEXT,
  mention_count BIGINT
) AS $$
DECLARE
    user_id text;
BEGIN
    -- Get the user_id based on the provided username
    SELECT account_id INTO user_id
    FROM public.account
    WHERE username = username_;

    -- If the user_id is not found, return an empty result
    IF user_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH TopMentionedUsers AS (
        SELECT
            um.mentioned_user_id,
            COUNT(*) AS mention_count
        FROM
            public.user_mentions um
        JOIN
            public.tweets t ON um.tweet_id = t.tweet_id
        WHERE
            t.account_id = user_id
            AND um.mentioned_user_id <> '-1'
        GROUP BY
            um.mentioned_user_id
        ORDER BY
            mention_count DESC
        LIMIT limit_
    )
    SELECT
        t.mentioned_user_id,
        mu.screen_name AS mentioned_username,
        t.mention_count
    FROM
        TopMentionedUsers t
    LEFT JOIN
        public.mentioned_users mu ON t.mentioned_user_id = mu.user_id
    ORDER BY
        t.mention_count DESC;
END;
$$ LANGUAGE plpgsql;
