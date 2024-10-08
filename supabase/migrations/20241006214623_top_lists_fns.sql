DROP FUNCTION IF EXISTS "public"."get_top_mentioned_users"();
DROP FUNCTION IF EXISTS "public"."get_top_mentioned_users"(INT);

CREATE OR REPLACE FUNCTION public.get_top_mentioned_users(limit_ INT)
RETURNS TABLE (
    user_id TEXT,
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
        WHERE
            um.mentioned_user_id <> '-1'
        GROUP BY
            um.mentioned_user_id
        ORDER BY
            mention_count DESC
        LIMIT
            limit_
    )
    SELECT
        t.mentioned_user_id as user_id,
        mu.name,
        mu.screen_name,
        t.mention_count
    FROM
        TopMentionedUsers t
        JOIN public.mentioned_users mu ON t.mentioned_user_id = mu.user_id
        LEFT JOIN public.profile u ON t.mentioned_user_id = u.account_id
    ORDER BY
        t.mention_count DESC;
END;
$$ LANGUAGE plpgsql;