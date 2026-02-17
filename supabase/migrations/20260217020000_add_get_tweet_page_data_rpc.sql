-- Single RPC to replace ~24 HTTP calls per tweet page view
CREATE OR REPLACE FUNCTION "public"."get_tweet_page_data"("p_tweet_id" "text")
RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY INVOKER
AS $$
DECLARE
    v_result jsonb;
    v_tweet_row record;
    v_conversation_id text;
    v_conversation_tweet_ids text[];
BEGIN
    -- 1. Get the main tweet from enriched_tweets view
    SELECT * INTO v_tweet_row
    FROM public.enriched_tweets
    WHERE tweet_id = p_tweet_id;

    IF v_tweet_row IS NULL THEN
        RETURN jsonb_build_object(
            'tweet', NULL,
            'media', '[]'::jsonb,
            'mentioned_users', '[]'::jsonb,
            'conversation_tweets', '[]'::jsonb,
            'conversation_media', '[]'::jsonb,
            'quoted_tweets', '[]'::jsonb
        );
    END IF;

    -- Get conversation_id
    v_conversation_id := v_tweet_row.conversation_id;

    -- 2. Collect conversation tweet IDs once (used by multiple subqueries)
    SELECT array_agg(sub.tweet_id) INTO v_conversation_tweet_ids
    FROM (
        SELECT et.tweet_id
        FROM public.enriched_tweets et
        WHERE (
            (v_conversation_id IS NOT NULL AND et.conversation_id = v_conversation_id)
            OR
            (v_conversation_id IS NULL AND (
                et.tweet_id = p_tweet_id
                OR et.reply_to_tweet_id = p_tweet_id
            ))
        )
        ORDER BY et.created_at ASC
        LIMIT 500
    ) sub;

    -- 3. Build the complete result in a single query
    SELECT jsonb_build_object(
        'tweet', to_jsonb(v_tweet_row),
        'media', COALESCE((
            SELECT jsonb_agg(to_jsonb(tm))
            FROM public.tweet_media tm
            WHERE tm.tweet_id = p_tweet_id
        ), '[]'::jsonb),
        'mentioned_users', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'tweet_id', um.tweet_id,
                'user_id', mu.user_id,
                'name', mu.name,
                'screen_name', mu.screen_name,
                'account_id', aa.account_id,
                'account_username', aa.username,
                'account_display_name', aa.account_display_name,
                'avatar_media_url', ap.avatar_media_url
            ))
            FROM public.user_mentions um
            JOIN public.mentioned_users mu ON um.mentioned_user_id = mu.user_id
            LEFT JOIN public.all_account aa ON aa.username = mu.screen_name
            LEFT JOIN LATERAL (
                SELECT all_profile.avatar_media_url
                FROM public.all_profile
                WHERE all_profile.account_id = aa.account_id
                ORDER BY all_profile.archive_upload_id DESC
                LIMIT 1
            ) ap ON true
            WHERE um.tweet_id = p_tweet_id
        ), '[]'::jsonb),
        'conversation_tweets', COALESCE((
            SELECT jsonb_agg(to_jsonb(ct) ORDER BY ct.created_at)
            FROM public.enriched_tweets ct
            WHERE ct.tweet_id = ANY(v_conversation_tweet_ids)
        ), '[]'::jsonb),
        'conversation_media', COALESCE((
            SELECT jsonb_agg(to_jsonb(cm))
            FROM public.tweet_media cm
            WHERE cm.tweet_id = ANY(v_conversation_tweet_ids)
        ), '[]'::jsonb),
        'quoted_tweets', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'tweet_id', qt_tweet.tweet_id,
                'source_tweet_id', qt.tweet_id,
                'account_id', qt_tweet.account_id,
                'created_at', qt_tweet.created_at,
                'full_text', qt_tweet.full_text,
                'retweet_count', qt_tweet.retweet_count,
                'favorite_count', qt_tweet.favorite_count,
                'username', qt_tweet.username,
                'account_display_name', qt_tweet.account_display_name,
                'avatar_media_url', qt_tweet.avatar_media_url,
                'media', COALESCE((
                    SELECT jsonb_agg(to_jsonb(qtm))
                    FROM public.tweet_media qtm
                    WHERE qtm.tweet_id = qt_tweet.tweet_id
                ), '[]'::jsonb)
            ))
            FROM public.quote_tweets qt
            JOIN public.enriched_tweets qt_tweet ON qt_tweet.tweet_id = qt.quoted_tweet_id
            WHERE qt.tweet_id = ANY(v_conversation_tweet_ids)
            AND qt.quoted_tweet_id IS NOT NULL
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."get_tweet_page_data"("p_tweet_id" "text") OWNER TO "postgres";
