DROP FUNCTION IF EXISTS "public"."get_top_accounts_with_followers"(integer);
CREATE OR REPLACE FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) 
RETURNS TABLE(
    "account_id" "text", 
    "created_via" "text", 
    "username" "text", 
    "created_at" timestamp with time zone, 
    "account_display_name" "text", 
    "avatar_media_url" "text", 
    "bio" "text", 
    "website" "text", 
    "location" "text", 
    "header_media_url" "text", 
    "num_followers" integer, 
    "num_tweets" integer
)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.account_id,
        a.created_via,
        a.username,
        a.created_at,
        a.account_display_name,
        p.avatar_media_url,
        p.bio,
        p.website,
        p.location,
        p.header_media_url,
        a.num_followers,
        a.num_tweets
    FROM 
        public.account a
    LEFT JOIN 
        public.profile p ON a.account_id = p.account_id
    WHERE 
        p.archive_upload_id = (
            SELECT MAX(p2.archive_upload_id)
            FROM public.profile p2
            WHERE p2.account_id = a.account_id
        )
    ORDER BY 
        a.num_followers DESC
    LIMIT 
        limit_count;
END; 
$$;
ALTER FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text" DEFAULT NULL::"text") RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "avatar_media_url" "text", "username" "text", "account_display_name" "text")
    LANGUAGE "plpgsql"
    AS $$
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
        p.avatar_media_url,
        a.username,
        a.account_display_name
    FROM 
        public.tweets t
    INNER JOIN 
        public.account a ON t.account_id = a.account_id
    INNER JOIN 
        (SELECT DISTINCT ON (p.account_id)
            p.account_id,
            p.avatar_media_url
         FROM public.profile p
         ORDER BY p.account_id, p.archive_upload_id DESC
        ) p ON a.account_id = p.account_id
    WHERE 
        t.reply_to_tweet_id IS NULL
        AND (p_account_id IS NULL OR t.account_id = p_account_id)
    ORDER BY 
        t.created_at DESC
    LIMIT COUNT;
END;
$$;
ALTER FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text") OWNER TO "postgres";
