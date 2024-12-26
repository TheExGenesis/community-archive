drop policy "Data is publicly visible" on "public"."profile";
drop function if exists "public"."get_top_mentioned_users_not_uploaded"();
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.get_most_liked_tweets_by_username(username_ text)
 RETURNS TABLE(tweet_id text, full_text text, num_likes bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        t.tweet_id, 
        t.full_text, 
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
        num_likes DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_most_mentioned_accounts_by_username(username_ text)
 RETURNS TABLE(mentioned_user_id text, mentioned_username text, mention_count bigint)
 LANGUAGE plpgsql
AS $function$
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
        GROUP BY
            um.mentioned_user_id
        ORDER BY
            mention_count DESC
        LIMIT 100
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
$function$;
CREATE OR REPLACE FUNCTION public.get_top_liked_users()
 RETURNS TABLE(tweet_id text, full_text text, like_count bigint, reply_to_tweet_id text, reply_to_user_id text, reply_to_username text)
 LANGUAGE plpgsql
 SET statement_timeout TO '30min'
AS $function$
BEGIN
    -- Set the statement timeout to 5 minutes

    RETURN QUERY
    WITH TopLikedUsers AS (
        SELECT
            lt.tweet_id,
            lt.full_text,
            COUNT(*) AS like_count
        FROM
            public.likes l
        JOIN
            public.liked_tweets lt ON l.liked_tweet_id = lt.tweet_id
        GROUP BY
            lt.tweet_id
        ORDER BY
            like_count DESC
        LIMIT
            100
    )
    SELECT
        tl.tweet_id,
        tl.full_text,
        tl.like_count,
        t.reply_to_tweet_id,
        t.reply_to_user_id,
        t.reply_to_username
    FROM
        TopLikedUsers tl
    JOIN
        public.tweets t ON t.reply_to_tweet_id = tl.tweet_id
    JOIN
        public.mentioned_users um ON um.user_id = t.reply_to_user_id
    ORDER BY
        tl.like_count DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_top_retweeted_tweets_by_username(username_ text, limit_ integer)
 RETURNS TABLE(tweet_id text, account_id text, created_at timestamp with time zone, full_text text, retweet_count integer, favorite_count integer, reply_to_tweet_id text, reply_to_user_id text, reply_to_username text, archive_upload_id bigint)
 LANGUAGE plpgsql
AS $function$
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
$function$;
create policy "Data is publicly visible unless marked private"
on "public"."profile"
as permissive
for select
to public
using (((( SELECT COALESCE(au.keep_private, false) AS "coalesce"
   FROM archive_upload au
  WHERE (au.id = profile.archive_upload_id)) = false) OR (account_id = ( SELECT ((auth.jwt() -> 'app_metadata'::text) ->> 'provider_id'::text)))));
