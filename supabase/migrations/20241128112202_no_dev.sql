drop function if exists "private"."count_liked_tweets_in_replies"();

drop function if exists "private"."get_reply_to_user_counts"();


drop function if exists "public"."get_tweets_in_user_conversations"(username_ text);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.tes_get_followers(user_id text)
 RETURNS TABLE(account_id text, username text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        f1.follower_account_id AS account_id,
        mu.screen_name AS username
    FROM public.followers f1
    LEFT JOIN mentioned_users mu ON mu.user_id = f1.follower_account_id
    WHERE f1.account_id = get_followers.user_id and mu.screen_name is not null;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tes_get_followings(user_id text)
 RETURNS TABLE(account_id text, username text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        f2.following_account_id AS account_id,
        mu.screen_name AS username
    FROM public.following f2
    LEFT JOIN mentioned_users mu ON mu.user_id = f2.following_account_id
    WHERE f2.account_id = get_followings.user_id and mu.screen_name is not null; 
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tes_get_moots(user_id text)
 RETURNS TABLE(account_id text, username text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
    f1.follower_account_id as account_id,
	mu.screen_name as username
    FROM public.followers f1
    INNER JOIN public.following f2 
        ON f1.account_id = f2.account_id 
        AND f1.follower_account_id = f2.following_account_id
	left join mentioned_users mu on mu.user_id = f1.follower_account_id
    where f1.account_id = get_moots.user_id;
END;
$function$
;



