CREATE OR REPLACE FUNCTION "public"."search_tweets"("search_query" "text", "from_user" "text" DEFAULT NULL::"text", "to_user" "text" DEFAULT NULL::"text", "since_date" "date" DEFAULT NULL::"date", "until_date" "date" DEFAULT NULL::"date", "limit_" integer DEFAULT 50, "offset_" integer DEFAULT 0) RETURNS TABLE("tweet_id" "text", "account_id" "text", "created_at" timestamp with time zone, "full_text" "text", "retweet_count" integer, "favorite_count" integer, "reply_to_tweet_id" "text", "avatar_media_url" "text", "archive_upload_id" bigint, "username" "text", "account_display_name" "text", "media" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '5min'
    AS $$
DECLARE
    from_account_id TEXT;
    to_account_id TEXT;
    current_user_account_id TEXT;
BEGIN
    -- Get the current logged-in user's account_id
    BEGIN
        current_user_account_id := (SELECT (auth.jwt() -> 'app_metadata'::text) ->> 'account_id'::text);
    EXCEPTION
        WHEN OTHERS THEN
            current_user_account_id := NULL;
    END;

    -- Get account_id for from_user
    IF from_user IS NOT NULL THEN
        SELECT a.account_id INTO from_account_id
        FROM public.all_account AS a
        WHERE LOWER(a.username) = LOWER(from_user);

        IF from_account_id IS NULL THEN
            RETURN;
        END IF;
    END IF;

    -- Get account_id for to_user
    IF to_user IS NOT NULL THEN
        SELECT a.account_id INTO to_account_id
        FROM public.all_account AS a
        WHERE LOWER(a.username) = LOWER(to_user);

        IF to_account_id IS NULL THEN
            RETURN;
        END IF;
    END IF;

    RETURN QUERY
    WITH matching_tweets AS (
        SELECT t.tweet_id
        FROM public.tweets t
        LEFT JOIN public.archive_upload au ON t.archive_upload_id = au.id
        WHERE (search_query = '' OR search_query IS NULL OR t.fts @@ to_tsquery('english', search_query))
          AND (from_account_id IS NULL OR t.account_id = from_account_id)
          AND (to_account_id IS NULL OR t.reply_to_user_id = to_account_id)
          AND (since_date IS NULL OR t.created_at >= since_date)
          AND (until_date IS NULL OR t.created_at <= until_date)
          AND (au.id IS NULL OR au.keep_private IS FALSE OR t.account_id = current_user_account_id OR current_user_account_id IS NULL)
        ORDER BY t.created_at DESC
        OFFSET offset_
        LIMIT limit_
    )
    SELECT
        t.tweet_id,
        t.account_id,
        t.created_at,
        t.full_text,
        t.retweet_count,
        t.favorite_count,
        t.reply_to_tweet_id,
        p.avatar_media_url,
        p.archive_upload_id AS profile_archive_upload_id,
        a.username,
        a.account_display_name,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'media_url', tm.media_url,
                'media_type', tm.media_type,
                'width', tm.width,
                'height', tm.height
            ) ORDER BY tm.media_id)
            FROM public.tweet_media tm
            WHERE tm.tweet_id = t.tweet_id
        ) AS media
    FROM matching_tweets mt
    JOIN public.tweets t ON mt.tweet_id = t.tweet_id
    JOIN public.all_account a ON t.account_id = a.account_id
    LEFT JOIN LATERAL (
        SELECT prof.avatar_media_url, prof.archive_upload_id
        FROM public.all_profile AS prof
        WHERE prof.account_id = t.account_id
        ORDER BY prof.archive_upload_id DESC NULLS LAST, prof.updated_at DESC
        LIMIT 1
    ) p ON true
    ORDER BY t.created_at DESC;
END;
$$;
