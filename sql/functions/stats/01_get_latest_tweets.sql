CREATE OR REPLACE FUNCTION "public"."get_latest_tweets"("count" integer, "p_account_id" "text" DEFAULT NULL::"text")
RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "avatar_media_url" "text", "username" "text", "account_display_name" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RAISE NOTICE 'Executing get_latest_tweets with count % and account_id %', count, p_account_id;
    
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

