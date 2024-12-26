DROP FUNCTION IF EXISTS get_account_most_mentioned_accounts(TEXT, INTEGER);
CREATE
OR REPLACE FUNCTION get_account_most_mentioned_accounts (username_ TEXT, limit_ INTEGER) RETURNS TABLE (
  user_id TEXT,
  name TEXT,
  screen_name TEXT,
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
        t.mentioned_user_id as user_id,
        mu.name,
        mu.screen_name,
        t.mention_count
    FROM
        TopMentionedUsers t
    LEFT JOIN
        public.mentioned_users mu ON t.mentioned_user_id = mu.user_id
    ORDER BY
        t.mention_count DESC;
END;
$$ LANGUAGE plpgsql;
