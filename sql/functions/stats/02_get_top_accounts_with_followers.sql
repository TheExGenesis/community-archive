
CREATE OR REPLACE FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) RETURNS TABLE("account_id" "text", "created_via" "text", "username" "text", "created_at" timestamp with time zone, "account_display_name" "text", "avatar_media_url" "text", "bio" "text", "website" "text", "location" "text", "header_media_url" "text", "follower_count" bigint)
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
        COUNT(f.follower_account_id) AS follower_count
    FROM 
        public.account a
    LEFT JOIN 
        public.followers f ON a.account_id = f.account_id
    LEFT JOIN 
        public.profile p ON a.account_id = p.account_id
    WHERE 
        p.archive_upload_id = (
            SELECT MAX(p2.archive_upload_id)
            FROM public.profile p2
            WHERE p2.account_id = a.account_id
        )
    GROUP BY 
        a.account_id, 
        a.created_via, 
        a.username, 
        a.created_at, 
        a.account_display_name, 
        p.avatar_media_url, 
        p.bio, 
        p.website, 
        p.location, 
        p.header_media_url
    ORDER BY 
        follower_count DESC
    LIMIT 
        limit_count;
END; 
$$;

ALTER FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) OWNER TO "postgres";
