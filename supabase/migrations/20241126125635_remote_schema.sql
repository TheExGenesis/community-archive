CREATE INDEX IF NOT EXISTS idx_archive_upload_account_id ON dev.archive_upload USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_followers_account_id ON dev.followers USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_followers_archive_upload_id ON dev.followers USING btree (archive_upload_id);
CREATE INDEX IF NOT EXISTS idx_following_account_id ON dev.following USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_following_archive_upload_id ON dev.following USING btree (archive_upload_id);
CREATE INDEX IF NOT EXISTS idx_likes_account_id ON dev.likes USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_likes_archive_upload_id ON dev.likes USING btree (archive_upload_id);
CREATE INDEX IF NOT EXISTS idx_likes_liked_tweet_id ON dev.likes USING btree (liked_tweet_id);
CREATE INDEX IF NOT EXISTS idx_profile_account_id ON dev.profile USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_profile_archive_upload_id ON dev.profile USING btree (archive_upload_id);
CREATE INDEX IF NOT EXISTS idx_tweet_media_archive_upload_id ON dev.tweet_media USING btree (archive_upload_id);
CREATE INDEX IF NOT EXISTS idx_tweet_media_tweet_id ON dev.tweet_media USING btree (tweet_id);
CREATE INDEX IF NOT EXISTS idx_tweet_urls_tweet_id ON dev.tweet_urls USING btree (tweet_id);
CREATE INDEX IF NOT EXISTS idx_tweets_account_id ON dev.tweets USING btree (account_id);
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION private.count_liked_tweets_in_replies()
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
DECLARE
    liked_tweets_count BIGINT;
BEGIN
    -- This function counts how many of the tweets in the liked_tweets table
    -- are present in the reply_to_tweet_id column of the tweet_replies_view.
    
    SELECT
        COUNT(*) INTO liked_tweets_count
    FROM
        public.liked_tweets lt
    JOIN
        public.tweet_replies_view tr ON lt.tweet_id = tr.reply_to_tweet_id;

    RETURN liked_tweets_count;
END;
$function$;
CREATE OR REPLACE FUNCTION private.get_reply_to_user_counts()
 RETURNS TABLE(unique_reply_to_users bigint, mentioned_users_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- This function returns the count of unique users in the reply_to_user_id column
    -- of the public.tweets table and the count of those users that exist in the
    -- public.mentioned_users table.
    
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT t.reply_to_user_id) AS unique_reply_to_users,
        COUNT(DISTINCT mu.user_id) AS mentioned_users_count
    FROM 
        public.tweets t
    LEFT JOIN 
        public.mentioned_users mu ON t.reply_to_user_id = mu.user_id
    WHERE 
        t.reply_to_user_id IS NOT NULL;
END;
$function$;
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.get_tweets_in_user_conversations(username_ text)
 RETURNS TABLE(conversation_id text, tweet_id text, created_at timestamp with time zone, full_text text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT c.conversation_id, 
           t.tweet_id, 
           t.created_at, 
           t.full_text
    FROM tweets t
    JOIN conversations c ON t.tweet_id = c.tweet_id
    WHERE c.conversation_id IN (
        SELECT c.conversation_id
        FROM tweets t
        JOIN account a ON t.account_id = a.account_id
        JOIN conversations c ON t.tweet_id = c.tweet_id
        WHERE a.username = username_
    );
END;
$function$;
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
    WHERE f1.account_id = $1 and mu.screen_name is not null;
END;
$function$;
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
    WHERE f2.account_id = $1 and mu.screen_name is not null; 
END;
$function$;
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
    where f1.account_id = $1;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tes_get_tweet_counts_by_date(p_account_id text)
 RETURNS TABLE(tweet_date date, tweet_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(created_at) AS tweet_date,
        COUNT(*) AS tweet_count
    FROM 
        public.tweets
    WHERE 
        account_id = p_account_id
    GROUP BY 
        DATE(created_at)
    ORDER BY 
        tweet_date;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tes_get_tweets_on_this_day(p_limit integer DEFAULT NULL::integer, p_account_id text DEFAULT NULL::text)
 RETURNS TABLE(tweet_id text, account_id text, created_at timestamp with time zone, full_text text, retweet_count integer, favorite_count integer, reply_to_tweet_id text, reply_to_user_id text, reply_to_username text, username text, account_display_name text, avatar_media_url text)
 LANGUAGE plpgsql
AS $function$
DECLARE
    current_month INTEGER;
    current_day INTEGER;
BEGIN
    -- Get the current month and day
    SELECT EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(DAY FROM CURRENT_DATE)
    INTO current_month, current_day;

    RETURN QUERY
    SELECT 
        t.tweet_id, t.account_id, t.created_at, t.full_text, t.retweet_count,
        t.favorite_count, t.reply_to_tweet_id, t.reply_to_user_id, t.reply_to_username,
		a.username,a.account_display_name,p.avatar_media_url
    FROM 
        public.tweets t
		inner join account a on t.account_id = a.account_id
		inner join profile p on t.account_id = p.account_id
    WHERE 
        EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'UTC') = current_month
        AND EXTRACT(DAY FROM t.created_at AT TIME ZONE 'UTC') = current_day
        AND EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'UTC') < EXTRACT(YEAR FROM CURRENT_DATE)
        AND (p_account_id IS NULL OR t.account_id = p_account_id)
    ORDER BY 
        t.favorite_count DESC,t.retweet_count DESC
    LIMIT p_limit;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tes_search_liked_tweets(search_query text, from_user text DEFAULT NULL::text, to_user text DEFAULT NULL::text, since_date date DEFAULT NULL::date, until_date date DEFAULT NULL::date, min_likes integer DEFAULT 0, min_retweets integer DEFAULT 0, max_likes integer DEFAULT 100000000, max_retweets integer DEFAULT 100000000, limit_ integer DEFAULT 50, auth_account_id text DEFAULT NULL::text)
 RETURNS TABLE(tweet_id text, account_id text, created_at timestamp with time zone, full_text text, retweet_count integer, favorite_count integer, reply_to_tweet_id text, avatar_media_url text, archive_upload_id bigint, username text, account_display_name text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  from_account_id TEXT;
  to_account_id TEXT;
BEGIN
  -- Get account_id for from_user
  IF from_user IS NOT NULL THEN
    SELECT a.account_id INTO from_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(from_user);
    
    -- Return empty if from_user not found
    IF from_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  -- Get account_id for to_user
  IF to_user IS NOT NULL THEN
    SELECT a.account_id INTO to_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(to_user);
    
    -- Return empty if to_user not found
    IF to_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH combined_tweets AS (
    SELECT 
      COALESCE(t.tweet_id,lt.tweet_id) as tweet_id,
      t.account_id,
      t.created_at,
      COALESCE(t.full_text, lt.full_text) as full_text,
      t.retweet_count,
      t.favorite_count,
      t.reply_to_user_id,
      t.reply_to_tweet_id
    FROM (
      SELECT lt.tweet_id, lt.full_text 
      FROM liked_tweets lt
      left JOIN likes l ON lt.tweet_id = l.liked_tweet_id 
      WHERE l.account_id = auth_account_id 

    ) lt
    LEFT JOIN tweets t ON lt.tweet_id = t.tweet_id

  ),
  matching_tweets AS (
    SELECT ct.tweet_id,ct.full_text
    FROM combined_tweets ct
    WHERE (search_query = '' OR to_tsvector('english', ct.full_text) @@ websearch_to_tsquery('english', search_query))
      AND (from_account_id IS NULL OR ct.account_id = from_account_id)
      AND (to_account_id IS NULL OR ct.reply_to_user_id = to_account_id)
      AND (since_date IS NULL OR ct.created_at >= since_date OR ct.created_at IS NULL)
      AND (until_date IS NULL OR ct.created_at <= until_date OR ct.created_at IS NULL)
      AND (min_likes IS NULL OR ct.favorite_count >= min_likes OR ct.favorite_count IS NULL)
      AND (max_likes IS NULL OR ct.favorite_count <= max_likes OR ct.favorite_count IS NULL)
      AND (min_retweets IS NULL OR ct.retweet_count >= min_retweets OR ct.retweet_count IS NULL)
      AND (max_retweets IS NULL OR ct.retweet_count <= max_retweets OR ct.retweet_count IS NULL)
    ORDER BY COALESCE(ct.created_at, '2099-12-31'::timestamp) DESC
    LIMIT limit_
  )
  SELECT 
    COALESCE (mt.tweet_id,t.tweet_id), 
    t.account_id, 
    t.created_at, 
    COALESCE (mt.full_text,t.full_text), 
    t.retweet_count, 
    t.favorite_count,
    t.reply_to_tweet_id,
    p.avatar_media_url,
    p.archive_upload_id,
    a.username,
    a.account_display_name
  FROM matching_tweets mt
  LEFT JOIN tweets t ON mt.tweet_id = t.tweet_id
  LEFT JOIN account a ON t.account_id = a.account_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(p.avatar_media_url,'none.com') as avatar_media_url, p.archive_upload_id
    FROM profile as p
    WHERE p.account_id = t.account_id
    ORDER BY p.archive_upload_id DESC
    LIMIT 1
  ) p ON true
  ORDER BY t.created_at DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tes_search_tweets(search_query text, from_user text DEFAULT NULL::text, to_user text DEFAULT NULL::text, since_date date DEFAULT NULL::date, until_date date DEFAULT NULL::date, min_likes integer DEFAULT 0, min_retweets integer DEFAULT 0, max_likes integer DEFAULT 100000000, max_retweets integer DEFAULT 100000000, limit_ integer DEFAULT 50)
 RETURNS TABLE(tweet_id text, account_id text, created_at timestamp with time zone, full_text text, retweet_count integer, favorite_count integer, reply_to_tweet_id text, avatar_media_url text, archive_upload_id bigint, username text, account_display_name text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  from_account_id TEXT;
  to_account_id TEXT;
BEGIN
  -- Get account_id for from_user
  IF from_user IS NOT NULL THEN
    SELECT a.account_id INTO from_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(from_user);
    
    -- Return empty if from_user not found
    IF from_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  -- Get account_id for to_user
  IF to_user IS NOT NULL THEN
    SELECT a.account_id INTO to_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(to_user);
    
    -- Return empty if to_user not found
    IF to_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH matching_tweets AS (
    SELECT t.tweet_id
    FROM tweets t
    WHERE (search_query = '' OR t.fts @@ to_tsquery('english', search_query))
      AND (from_account_id IS NULL OR t.account_id = from_account_id)
      AND (to_account_id IS NULL OR t.reply_to_user_id = to_account_id)
      AND (since_date IS NULL OR t.created_at >= since_date)
      AND (until_date IS NULL OR t.created_at <= until_date)
      AND (min_likes IS NULL OR t.favorite_count >= min_likes)
      AND (max_likes IS NULL OR t.favorite_count <= max_likes)
      AND (min_retweets IS NULL OR t.retweet_count >= min_retweets)
      AND (max_retweets IS NULL OR t.retweet_count <= max_retweets)
    ORDER BY t.created_at DESC
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
    p.archive_upload_id,
    a.username,
    a.account_display_name
  FROM matching_tweets mt
  JOIN tweets t ON mt.tweet_id = t.tweet_id
  JOIN account a ON t.account_id = a.account_id
  LEFT JOIN LATERAL (
    SELECT p.avatar_media_url, p.archive_upload_id
    FROM profile as p
    WHERE p.account_id = t.account_id
    ORDER BY p.archive_upload_id DESC
    LIMIT 1
  ) p ON true
  ORDER BY t.created_at DESC;
END;
$function$;
create table "temp"."account_1195529113169039360" (
    "account_id" text not null,
    "created_via" text not null,
    "username" text not null,
    "created_at" timestamp with time zone not null,
    "account_display_name" text not null,
    "num_tweets" integer default 0,
    "num_following" integer default 0,
    "num_followers" integer default 0,
    "num_likes" integer default 0
);
create table "temp"."archive_upload_1195529113169039360" (
    "id" bigint generated always as identity not null,
    "account_id" text not null,
    "archive_at" timestamp with time zone not null,
    "created_at" timestamp with time zone default CURRENT_TIMESTAMP,
    "keep_private" boolean default false,
    "upload_likes" boolean default true,
    "start_date" date,
    "end_date" date,
    "upload_phase" upload_phase_enum default 'uploading'::upload_phase_enum
);
create table "temp"."followers_1195529113169039360" (
    "id" bigint generated always as identity not null,
    "account_id" text not null,
    "follower_account_id" text not null,
    "archive_upload_id" bigint not null
);
create table "temp"."following_1195529113169039360" (
    "id" bigint generated always as identity not null,
    "account_id" text not null,
    "following_account_id" text not null,
    "archive_upload_id" bigint not null
);
create table "temp"."liked_tweets_1195529113169039360" (
    "tweet_id" text not null,
    "full_text" text not null
);
create table "temp"."likes_1195529113169039360" (
    "id" bigint generated always as identity not null,
    "account_id" text not null,
    "liked_tweet_id" text not null,
    "archive_upload_id" bigint not null
);
create table "temp"."mentioned_users_1195529113169039360" (
    "user_id" text not null,
    "name" text not null,
    "screen_name" text not null,
    "updated_at" timestamp with time zone not null
);
create table "temp"."profile_1195529113169039360" (
    "id" bigint generated always as identity not null,
    "account_id" text not null,
    "bio" text,
    "website" text,
    "location" text,
    "avatar_media_url" text,
    "header_media_url" text,
    "archive_upload_id" bigint not null
);
create table "temp"."tweet_media_1195529113169039360" (
    "media_id" bigint not null,
    "tweet_id" text not null,
    "media_url" text not null,
    "media_type" text not null,
    "width" integer not null,
    "height" integer not null,
    "archive_upload_id" bigint not null
);
create table "temp"."tweet_urls_1195529113169039360" (
    "id" bigint generated always as identity not null,
    "url" text not null,
    "expanded_url" text not null,
    "display_url" text not null,
    "tweet_id" text not null
);
create table "temp"."tweets_1195529113169039360" (
    "tweet_id" text not null,
    "account_id" text not null,
    "created_at" timestamp with time zone not null,
    "full_text" text not null,
    "retweet_count" integer not null,
    "favorite_count" integer not null,
    "reply_to_tweet_id" text,
    "reply_to_user_id" text,
    "reply_to_username" text,
    "archive_upload_id" bigint not null,
    "fts" tsvector generated always as (to_tsvector('english'::regconfig, full_text)) stored
);
create table "temp"."user_mentions_1195529113169039360" (
    "id" bigint generated always as identity not null,
    "mentioned_user_id" text not null,
    "tweet_id" text not null
);
CREATE UNIQUE INDEX account_1195529113169039360_pkey ON temp.account_1195529113169039360 USING btree (account_id);
CREATE UNIQUE INDEX archive_upload_1195529113169039360_account_id_archive_at_key ON temp.archive_upload_1195529113169039360 USING btree (account_id, archive_at);
CREATE INDEX IF NOT EXISTS archive_upload_1195529113169039360_account_id_idx ON temp.archive_upload_1195529113169039360 USING btree (account_id);
CREATE UNIQUE INDEX archive_upload_1195529113169039360_pkey ON temp.archive_upload_1195529113169039360 USING btree (id);
CREATE UNIQUE INDEX followers_1195529113169039360_account_id_follower_account_i_key ON temp.followers_1195529113169039360 USING btree (account_id, follower_account_id);
CREATE INDEX IF NOT EXISTS followers_1195529113169039360_account_id_idx ON temp.followers_1195529113169039360 USING btree (account_id);
CREATE INDEX IF NOT EXISTS followers_1195529113169039360_archive_upload_id_idx ON temp.followers_1195529113169039360 USING btree (archive_upload_id);
CREATE UNIQUE INDEX followers_1195529113169039360_pkey ON temp.followers_1195529113169039360 USING btree (id);
CREATE UNIQUE INDEX following_1195529113169039360_account_id_following_account__key ON temp.following_1195529113169039360 USING btree (account_id, following_account_id);
CREATE INDEX IF NOT EXISTS following_1195529113169039360_account_id_idx ON temp.following_1195529113169039360 USING btree (account_id);
CREATE INDEX IF NOT EXISTS following_1195529113169039360_archive_upload_id_idx ON temp.following_1195529113169039360 USING btree (archive_upload_id);
CREATE UNIQUE INDEX following_1195529113169039360_pkey ON temp.following_1195529113169039360 USING btree (id);
CREATE UNIQUE INDEX liked_tweets_1195529113169039360_pkey ON temp.liked_tweets_1195529113169039360 USING btree (tweet_id);
CREATE INDEX IF NOT EXISTS likes_1195529113169039360_account_id_idx ON temp.likes_1195529113169039360 USING btree (account_id);
CREATE UNIQUE INDEX likes_1195529113169039360_account_id_liked_tweet_id_key ON temp.likes_1195529113169039360 USING btree (account_id, liked_tweet_id);
CREATE INDEX IF NOT EXISTS likes_1195529113169039360_archive_upload_id_idx ON temp.likes_1195529113169039360 USING btree (archive_upload_id);
CREATE INDEX IF NOT EXISTS likes_1195529113169039360_liked_tweet_id_idx ON temp.likes_1195529113169039360 USING btree (liked_tweet_id);
CREATE UNIQUE INDEX likes_1195529113169039360_pkey ON temp.likes_1195529113169039360 USING btree (id);
CREATE UNIQUE INDEX mentioned_users_1195529113169039360_pkey ON temp.mentioned_users_1195529113169039360 USING btree (user_id);
CREATE UNIQUE INDEX profile_1195529113169039360_account_id_archive_upload_id_key ON temp.profile_1195529113169039360 USING btree (account_id, archive_upload_id);
CREATE UNIQUE INDEX profile_1195529113169039360_account_id_archive_upload_id_key1 ON temp.profile_1195529113169039360 USING btree (account_id, archive_upload_id);
CREATE INDEX IF NOT EXISTS profile_1195529113169039360_account_id_idx ON temp.profile_1195529113169039360 USING btree (account_id);
CREATE INDEX IF NOT EXISTS profile_1195529113169039360_archive_upload_id_idx ON temp.profile_1195529113169039360 USING btree (archive_upload_id);
CREATE UNIQUE INDEX profile_1195529113169039360_pkey ON temp.profile_1195529113169039360 USING btree (id);
CREATE INDEX IF NOT EXISTS tweet_media_1195529113169039360_archive_upload_id_idx ON temp.tweet_media_1195529113169039360 USING btree (archive_upload_id);
CREATE UNIQUE INDEX tweet_media_1195529113169039360_pkey ON temp.tweet_media_1195529113169039360 USING btree (media_id);
CREATE INDEX IF NOT EXISTS tweet_media_1195529113169039360_tweet_id_idx ON temp.tweet_media_1195529113169039360 USING btree (tweet_id);
CREATE UNIQUE INDEX tweet_urls_1195529113169039360_pkey ON temp.tweet_urls_1195529113169039360 USING btree (id);
CREATE INDEX IF NOT EXISTS tweet_urls_1195529113169039360_tweet_id_idx ON temp.tweet_urls_1195529113169039360 USING btree (tweet_id);
CREATE UNIQUE INDEX tweet_urls_1195529113169039360_tweet_id_url_key ON temp.tweet_urls_1195529113169039360 USING btree (tweet_id, url);
CREATE INDEX IF NOT EXISTS tweets_1195529113169039360_account_id_idx ON temp.tweets_1195529113169039360 USING btree (account_id);
CREATE INDEX IF NOT EXISTS tweets_1195529113169039360_archive_upload_id_idx ON temp.tweets_1195529113169039360 USING btree (archive_upload_id);
CREATE INDEX IF NOT EXISTS tweets_1195529113169039360_created_at_idx ON temp.tweets_1195529113169039360 USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS tweets_1195529113169039360_fts_idx ON temp.tweets_1195529113169039360 USING gin (fts);
CREATE UNIQUE INDEX tweets_1195529113169039360_pkey ON temp.tweets_1195529113169039360 USING btree (tweet_id);
CREATE INDEX IF NOT EXISTS tweets_1195529113169039360_reply_to_user_id_idx ON temp.tweets_1195529113169039360 USING btree (reply_to_user_id);
CREATE INDEX IF NOT EXISTS user_mentions_1195529113169039360_mentioned_user_id_idx ON temp.user_mentions_1195529113169039360 USING btree (mentioned_user_id);
CREATE UNIQUE INDEX user_mentions_1195529113169039360_pkey ON temp.user_mentions_1195529113169039360 USING btree (id);
CREATE INDEX IF NOT EXISTS user_mentions_1195529113169039360_tweet_id_idx ON temp.user_mentions_1195529113169039360 USING btree (tweet_id);
CREATE UNIQUE INDEX user_mentions_119552911316903936_mentioned_user_id_tweet_id_key ON temp.user_mentions_1195529113169039360 USING btree (mentioned_user_id, tweet_id);
alter table "temp"."account_1195529113169039360" add constraint "account_1195529113169039360_pkey" PRIMARY KEY using index "account_1195529113169039360_pkey";
alter table "temp"."archive_upload_1195529113169039360" add constraint "archive_upload_1195529113169039360_pkey" PRIMARY KEY using index "archive_upload_1195529113169039360_pkey";
alter table "temp"."followers_1195529113169039360" add constraint "followers_1195529113169039360_pkey" PRIMARY KEY using index "followers_1195529113169039360_pkey";
alter table "temp"."following_1195529113169039360" add constraint "following_1195529113169039360_pkey" PRIMARY KEY using index "following_1195529113169039360_pkey";
alter table "temp"."liked_tweets_1195529113169039360" add constraint "liked_tweets_1195529113169039360_pkey" PRIMARY KEY using index "liked_tweets_1195529113169039360_pkey";
alter table "temp"."likes_1195529113169039360" add constraint "likes_1195529113169039360_pkey" PRIMARY KEY using index "likes_1195529113169039360_pkey";
alter table "temp"."mentioned_users_1195529113169039360" add constraint "mentioned_users_1195529113169039360_pkey" PRIMARY KEY using index "mentioned_users_1195529113169039360_pkey";
alter table "temp"."profile_1195529113169039360" add constraint "profile_1195529113169039360_pkey" PRIMARY KEY using index "profile_1195529113169039360_pkey";
alter table "temp"."tweet_media_1195529113169039360" add constraint "tweet_media_1195529113169039360_pkey" PRIMARY KEY using index "tweet_media_1195529113169039360_pkey";
alter table "temp"."tweet_urls_1195529113169039360" add constraint "tweet_urls_1195529113169039360_pkey" PRIMARY KEY using index "tweet_urls_1195529113169039360_pkey";
alter table "temp"."tweets_1195529113169039360" add constraint "tweets_1195529113169039360_pkey" PRIMARY KEY using index "tweets_1195529113169039360_pkey";
alter table "temp"."user_mentions_1195529113169039360" add constraint "user_mentions_1195529113169039360_pkey" PRIMARY KEY using index "user_mentions_1195529113169039360_pkey";
alter table "temp"."archive_upload_1195529113169039360" add constraint "archive_upload_1195529113169039360_account_id_archive_at_key" UNIQUE using index "archive_upload_1195529113169039360_account_id_archive_at_key";
alter table "temp"."followers_1195529113169039360" add constraint "followers_1195529113169039360_account_id_follower_account_i_key" UNIQUE using index "followers_1195529113169039360_account_id_follower_account_i_key";
alter table "temp"."following_1195529113169039360" add constraint "following_1195529113169039360_account_id_following_account__key" UNIQUE using index "following_1195529113169039360_account_id_following_account__key";
alter table "temp"."likes_1195529113169039360" add constraint "likes_1195529113169039360_account_id_liked_tweet_id_key" UNIQUE using index "likes_1195529113169039360_account_id_liked_tweet_id_key";
alter table "temp"."profile_1195529113169039360" add constraint "profile_1195529113169039360_account_id_archive_upload_id_key" UNIQUE using index "profile_1195529113169039360_account_id_archive_upload_id_key";
alter table "temp"."profile_1195529113169039360" add constraint "profile_1195529113169039360_account_id_archive_upload_id_key1" UNIQUE using index "profile_1195529113169039360_account_id_archive_upload_id_key1";
alter table "temp"."tweet_urls_1195529113169039360" add constraint "tweet_urls_1195529113169039360_tweet_id_url_key" UNIQUE using index "tweet_urls_1195529113169039360_tweet_id_url_key";
alter table "temp"."user_mentions_1195529113169039360" add constraint "user_mentions_119552911316903936_mentioned_user_id_tweet_id_key" UNIQUE using index "user_mentions_119552911316903936_mentioned_user_id_tweet_id_key";
grant delete on table "temp"."account_1195529113169039360" to "anon";
grant insert on table "temp"."account_1195529113169039360" to "anon";
grant references on table "temp"."account_1195529113169039360" to "anon";
grant select on table "temp"."account_1195529113169039360" to "anon";
grant trigger on table "temp"."account_1195529113169039360" to "anon";
grant truncate on table "temp"."account_1195529113169039360" to "anon";
grant update on table "temp"."account_1195529113169039360" to "anon";
grant delete on table "temp"."account_1195529113169039360" to "authenticated";
grant insert on table "temp"."account_1195529113169039360" to "authenticated";
grant references on table "temp"."account_1195529113169039360" to "authenticated";
grant select on table "temp"."account_1195529113169039360" to "authenticated";
grant trigger on table "temp"."account_1195529113169039360" to "authenticated";
grant truncate on table "temp"."account_1195529113169039360" to "authenticated";
grant update on table "temp"."account_1195529113169039360" to "authenticated";
grant delete on table "temp"."account_1195529113169039360" to "service_role";
grant insert on table "temp"."account_1195529113169039360" to "service_role";
grant references on table "temp"."account_1195529113169039360" to "service_role";
grant select on table "temp"."account_1195529113169039360" to "service_role";
grant trigger on table "temp"."account_1195529113169039360" to "service_role";
grant truncate on table "temp"."account_1195529113169039360" to "service_role";
grant update on table "temp"."account_1195529113169039360" to "service_role";
grant delete on table "temp"."archive_upload_1195529113169039360" to "anon";
grant insert on table "temp"."archive_upload_1195529113169039360" to "anon";
grant references on table "temp"."archive_upload_1195529113169039360" to "anon";
grant select on table "temp"."archive_upload_1195529113169039360" to "anon";
grant trigger on table "temp"."archive_upload_1195529113169039360" to "anon";
grant truncate on table "temp"."archive_upload_1195529113169039360" to "anon";
grant update on table "temp"."archive_upload_1195529113169039360" to "anon";
grant delete on table "temp"."archive_upload_1195529113169039360" to "authenticated";
grant insert on table "temp"."archive_upload_1195529113169039360" to "authenticated";
grant references on table "temp"."archive_upload_1195529113169039360" to "authenticated";
grant select on table "temp"."archive_upload_1195529113169039360" to "authenticated";
grant trigger on table "temp"."archive_upload_1195529113169039360" to "authenticated";
grant truncate on table "temp"."archive_upload_1195529113169039360" to "authenticated";
grant update on table "temp"."archive_upload_1195529113169039360" to "authenticated";
grant delete on table "temp"."archive_upload_1195529113169039360" to "service_role";
grant insert on table "temp"."archive_upload_1195529113169039360" to "service_role";
grant references on table "temp"."archive_upload_1195529113169039360" to "service_role";
grant select on table "temp"."archive_upload_1195529113169039360" to "service_role";
grant trigger on table "temp"."archive_upload_1195529113169039360" to "service_role";
grant truncate on table "temp"."archive_upload_1195529113169039360" to "service_role";
grant update on table "temp"."archive_upload_1195529113169039360" to "service_role";
grant delete on table "temp"."followers_1195529113169039360" to "anon";
grant insert on table "temp"."followers_1195529113169039360" to "anon";
grant references on table "temp"."followers_1195529113169039360" to "anon";
grant select on table "temp"."followers_1195529113169039360" to "anon";
grant trigger on table "temp"."followers_1195529113169039360" to "anon";
grant truncate on table "temp"."followers_1195529113169039360" to "anon";
grant update on table "temp"."followers_1195529113169039360" to "anon";
grant delete on table "temp"."followers_1195529113169039360" to "authenticated";
grant insert on table "temp"."followers_1195529113169039360" to "authenticated";
grant references on table "temp"."followers_1195529113169039360" to "authenticated";
grant select on table "temp"."followers_1195529113169039360" to "authenticated";
grant trigger on table "temp"."followers_1195529113169039360" to "authenticated";
grant truncate on table "temp"."followers_1195529113169039360" to "authenticated";
grant update on table "temp"."followers_1195529113169039360" to "authenticated";
grant delete on table "temp"."followers_1195529113169039360" to "service_role";
grant insert on table "temp"."followers_1195529113169039360" to "service_role";
grant references on table "temp"."followers_1195529113169039360" to "service_role";
grant select on table "temp"."followers_1195529113169039360" to "service_role";
grant trigger on table "temp"."followers_1195529113169039360" to "service_role";
grant truncate on table "temp"."followers_1195529113169039360" to "service_role";
grant update on table "temp"."followers_1195529113169039360" to "service_role";
grant delete on table "temp"."following_1195529113169039360" to "anon";
grant insert on table "temp"."following_1195529113169039360" to "anon";
grant references on table "temp"."following_1195529113169039360" to "anon";
grant select on table "temp"."following_1195529113169039360" to "anon";
grant trigger on table "temp"."following_1195529113169039360" to "anon";
grant truncate on table "temp"."following_1195529113169039360" to "anon";
grant update on table "temp"."following_1195529113169039360" to "anon";
grant delete on table "temp"."following_1195529113169039360" to "authenticated";
grant insert on table "temp"."following_1195529113169039360" to "authenticated";
grant references on table "temp"."following_1195529113169039360" to "authenticated";
grant select on table "temp"."following_1195529113169039360" to "authenticated";
grant trigger on table "temp"."following_1195529113169039360" to "authenticated";
grant truncate on table "temp"."following_1195529113169039360" to "authenticated";
grant update on table "temp"."following_1195529113169039360" to "authenticated";
grant delete on table "temp"."following_1195529113169039360" to "service_role";
grant insert on table "temp"."following_1195529113169039360" to "service_role";
grant references on table "temp"."following_1195529113169039360" to "service_role";
grant select on table "temp"."following_1195529113169039360" to "service_role";
grant trigger on table "temp"."following_1195529113169039360" to "service_role";
grant truncate on table "temp"."following_1195529113169039360" to "service_role";
grant update on table "temp"."following_1195529113169039360" to "service_role";
grant delete on table "temp"."liked_tweets_1195529113169039360" to "anon";
grant insert on table "temp"."liked_tweets_1195529113169039360" to "anon";
grant references on table "temp"."liked_tweets_1195529113169039360" to "anon";
grant select on table "temp"."liked_tweets_1195529113169039360" to "anon";
grant trigger on table "temp"."liked_tweets_1195529113169039360" to "anon";
grant truncate on table "temp"."liked_tweets_1195529113169039360" to "anon";
grant update on table "temp"."liked_tweets_1195529113169039360" to "anon";
grant delete on table "temp"."liked_tweets_1195529113169039360" to "authenticated";
grant insert on table "temp"."liked_tweets_1195529113169039360" to "authenticated";
grant references on table "temp"."liked_tweets_1195529113169039360" to "authenticated";
grant select on table "temp"."liked_tweets_1195529113169039360" to "authenticated";
grant trigger on table "temp"."liked_tweets_1195529113169039360" to "authenticated";
grant truncate on table "temp"."liked_tweets_1195529113169039360" to "authenticated";
grant update on table "temp"."liked_tweets_1195529113169039360" to "authenticated";
grant delete on table "temp"."liked_tweets_1195529113169039360" to "service_role";
grant insert on table "temp"."liked_tweets_1195529113169039360" to "service_role";
grant references on table "temp"."liked_tweets_1195529113169039360" to "service_role";
grant select on table "temp"."liked_tweets_1195529113169039360" to "service_role";
grant trigger on table "temp"."liked_tweets_1195529113169039360" to "service_role";
grant truncate on table "temp"."liked_tweets_1195529113169039360" to "service_role";
grant update on table "temp"."liked_tweets_1195529113169039360" to "service_role";
grant delete on table "temp"."likes_1195529113169039360" to "anon";
grant insert on table "temp"."likes_1195529113169039360" to "anon";
grant references on table "temp"."likes_1195529113169039360" to "anon";
grant select on table "temp"."likes_1195529113169039360" to "anon";
grant trigger on table "temp"."likes_1195529113169039360" to "anon";
grant truncate on table "temp"."likes_1195529113169039360" to "anon";
grant update on table "temp"."likes_1195529113169039360" to "anon";
grant delete on table "temp"."likes_1195529113169039360" to "authenticated";
grant insert on table "temp"."likes_1195529113169039360" to "authenticated";
grant references on table "temp"."likes_1195529113169039360" to "authenticated";
grant select on table "temp"."likes_1195529113169039360" to "authenticated";
grant trigger on table "temp"."likes_1195529113169039360" to "authenticated";
grant truncate on table "temp"."likes_1195529113169039360" to "authenticated";
grant update on table "temp"."likes_1195529113169039360" to "authenticated";
grant delete on table "temp"."likes_1195529113169039360" to "service_role";
grant insert on table "temp"."likes_1195529113169039360" to "service_role";
grant references on table "temp"."likes_1195529113169039360" to "service_role";
grant select on table "temp"."likes_1195529113169039360" to "service_role";
grant trigger on table "temp"."likes_1195529113169039360" to "service_role";
grant truncate on table "temp"."likes_1195529113169039360" to "service_role";
grant update on table "temp"."likes_1195529113169039360" to "service_role";
grant delete on table "temp"."mentioned_users_1195529113169039360" to "anon";
grant insert on table "temp"."mentioned_users_1195529113169039360" to "anon";
grant references on table "temp"."mentioned_users_1195529113169039360" to "anon";
grant select on table "temp"."mentioned_users_1195529113169039360" to "anon";
grant trigger on table "temp"."mentioned_users_1195529113169039360" to "anon";
grant truncate on table "temp"."mentioned_users_1195529113169039360" to "anon";
grant update on table "temp"."mentioned_users_1195529113169039360" to "anon";
grant delete on table "temp"."mentioned_users_1195529113169039360" to "authenticated";
grant insert on table "temp"."mentioned_users_1195529113169039360" to "authenticated";
grant references on table "temp"."mentioned_users_1195529113169039360" to "authenticated";
grant select on table "temp"."mentioned_users_1195529113169039360" to "authenticated";
grant trigger on table "temp"."mentioned_users_1195529113169039360" to "authenticated";
grant truncate on table "temp"."mentioned_users_1195529113169039360" to "authenticated";
grant update on table "temp"."mentioned_users_1195529113169039360" to "authenticated";
grant delete on table "temp"."mentioned_users_1195529113169039360" to "service_role";
grant insert on table "temp"."mentioned_users_1195529113169039360" to "service_role";
grant references on table "temp"."mentioned_users_1195529113169039360" to "service_role";
grant select on table "temp"."mentioned_users_1195529113169039360" to "service_role";
grant trigger on table "temp"."mentioned_users_1195529113169039360" to "service_role";
grant truncate on table "temp"."mentioned_users_1195529113169039360" to "service_role";
grant update on table "temp"."mentioned_users_1195529113169039360" to "service_role";
grant delete on table "temp"."profile_1195529113169039360" to "anon";
grant insert on table "temp"."profile_1195529113169039360" to "anon";
grant references on table "temp"."profile_1195529113169039360" to "anon";
grant select on table "temp"."profile_1195529113169039360" to "anon";
grant trigger on table "temp"."profile_1195529113169039360" to "anon";
grant truncate on table "temp"."profile_1195529113169039360" to "anon";
grant update on table "temp"."profile_1195529113169039360" to "anon";
grant delete on table "temp"."profile_1195529113169039360" to "authenticated";
grant insert on table "temp"."profile_1195529113169039360" to "authenticated";
grant references on table "temp"."profile_1195529113169039360" to "authenticated";
grant select on table "temp"."profile_1195529113169039360" to "authenticated";
grant trigger on table "temp"."profile_1195529113169039360" to "authenticated";
grant truncate on table "temp"."profile_1195529113169039360" to "authenticated";
grant update on table "temp"."profile_1195529113169039360" to "authenticated";
grant delete on table "temp"."profile_1195529113169039360" to "service_role";
grant insert on table "temp"."profile_1195529113169039360" to "service_role";
grant references on table "temp"."profile_1195529113169039360" to "service_role";
grant select on table "temp"."profile_1195529113169039360" to "service_role";
grant trigger on table "temp"."profile_1195529113169039360" to "service_role";
grant truncate on table "temp"."profile_1195529113169039360" to "service_role";
grant update on table "temp"."profile_1195529113169039360" to "service_role";
grant delete on table "temp"."tweet_media_1195529113169039360" to "anon";
grant insert on table "temp"."tweet_media_1195529113169039360" to "anon";
grant references on table "temp"."tweet_media_1195529113169039360" to "anon";
grant select on table "temp"."tweet_media_1195529113169039360" to "anon";
grant trigger on table "temp"."tweet_media_1195529113169039360" to "anon";
grant truncate on table "temp"."tweet_media_1195529113169039360" to "anon";
grant update on table "temp"."tweet_media_1195529113169039360" to "anon";
grant delete on table "temp"."tweet_media_1195529113169039360" to "authenticated";
grant insert on table "temp"."tweet_media_1195529113169039360" to "authenticated";
grant references on table "temp"."tweet_media_1195529113169039360" to "authenticated";
grant select on table "temp"."tweet_media_1195529113169039360" to "authenticated";
grant trigger on table "temp"."tweet_media_1195529113169039360" to "authenticated";
grant truncate on table "temp"."tweet_media_1195529113169039360" to "authenticated";
grant update on table "temp"."tweet_media_1195529113169039360" to "authenticated";
grant delete on table "temp"."tweet_media_1195529113169039360" to "service_role";
grant insert on table "temp"."tweet_media_1195529113169039360" to "service_role";
grant references on table "temp"."tweet_media_1195529113169039360" to "service_role";
grant select on table "temp"."tweet_media_1195529113169039360" to "service_role";
grant trigger on table "temp"."tweet_media_1195529113169039360" to "service_role";
grant truncate on table "temp"."tweet_media_1195529113169039360" to "service_role";
grant update on table "temp"."tweet_media_1195529113169039360" to "service_role";
grant delete on table "temp"."tweet_urls_1195529113169039360" to "anon";
grant insert on table "temp"."tweet_urls_1195529113169039360" to "anon";
grant references on table "temp"."tweet_urls_1195529113169039360" to "anon";
grant select on table "temp"."tweet_urls_1195529113169039360" to "anon";
grant trigger on table "temp"."tweet_urls_1195529113169039360" to "anon";
grant truncate on table "temp"."tweet_urls_1195529113169039360" to "anon";
grant update on table "temp"."tweet_urls_1195529113169039360" to "anon";
grant delete on table "temp"."tweet_urls_1195529113169039360" to "authenticated";
grant insert on table "temp"."tweet_urls_1195529113169039360" to "authenticated";
grant references on table "temp"."tweet_urls_1195529113169039360" to "authenticated";
grant select on table "temp"."tweet_urls_1195529113169039360" to "authenticated";
grant trigger on table "temp"."tweet_urls_1195529113169039360" to "authenticated";
grant truncate on table "temp"."tweet_urls_1195529113169039360" to "authenticated";
grant update on table "temp"."tweet_urls_1195529113169039360" to "authenticated";
grant delete on table "temp"."tweet_urls_1195529113169039360" to "service_role";
grant insert on table "temp"."tweet_urls_1195529113169039360" to "service_role";
grant references on table "temp"."tweet_urls_1195529113169039360" to "service_role";
grant select on table "temp"."tweet_urls_1195529113169039360" to "service_role";
grant trigger on table "temp"."tweet_urls_1195529113169039360" to "service_role";
grant truncate on table "temp"."tweet_urls_1195529113169039360" to "service_role";
grant update on table "temp"."tweet_urls_1195529113169039360" to "service_role";
grant delete on table "temp"."tweets_1195529113169039360" to "anon";
grant insert on table "temp"."tweets_1195529113169039360" to "anon";
grant references on table "temp"."tweets_1195529113169039360" to "anon";
grant select on table "temp"."tweets_1195529113169039360" to "anon";
grant trigger on table "temp"."tweets_1195529113169039360" to "anon";
grant truncate on table "temp"."tweets_1195529113169039360" to "anon";
grant update on table "temp"."tweets_1195529113169039360" to "anon";
grant delete on table "temp"."tweets_1195529113169039360" to "authenticated";
grant insert on table "temp"."tweets_1195529113169039360" to "authenticated";
grant references on table "temp"."tweets_1195529113169039360" to "authenticated";
grant select on table "temp"."tweets_1195529113169039360" to "authenticated";
grant trigger on table "temp"."tweets_1195529113169039360" to "authenticated";
grant truncate on table "temp"."tweets_1195529113169039360" to "authenticated";
grant update on table "temp"."tweets_1195529113169039360" to "authenticated";
grant delete on table "temp"."tweets_1195529113169039360" to "service_role";
grant insert on table "temp"."tweets_1195529113169039360" to "service_role";
grant references on table "temp"."tweets_1195529113169039360" to "service_role";
grant select on table "temp"."tweets_1195529113169039360" to "service_role";
grant trigger on table "temp"."tweets_1195529113169039360" to "service_role";
grant truncate on table "temp"."tweets_1195529113169039360" to "service_role";
grant update on table "temp"."tweets_1195529113169039360" to "service_role";
grant delete on table "temp"."user_mentions_1195529113169039360" to "anon";
grant insert on table "temp"."user_mentions_1195529113169039360" to "anon";
grant references on table "temp"."user_mentions_1195529113169039360" to "anon";
grant select on table "temp"."user_mentions_1195529113169039360" to "anon";
grant trigger on table "temp"."user_mentions_1195529113169039360" to "anon";
grant truncate on table "temp"."user_mentions_1195529113169039360" to "anon";
grant update on table "temp"."user_mentions_1195529113169039360" to "anon";
grant delete on table "temp"."user_mentions_1195529113169039360" to "authenticated";
grant insert on table "temp"."user_mentions_1195529113169039360" to "authenticated";
grant references on table "temp"."user_mentions_1195529113169039360" to "authenticated";
grant select on table "temp"."user_mentions_1195529113169039360" to "authenticated";
grant trigger on table "temp"."user_mentions_1195529113169039360" to "authenticated";
grant truncate on table "temp"."user_mentions_1195529113169039360" to "authenticated";
grant update on table "temp"."user_mentions_1195529113169039360" to "authenticated";
grant delete on table "temp"."user_mentions_1195529113169039360" to "service_role";
grant insert on table "temp"."user_mentions_1195529113169039360" to "service_role";
grant references on table "temp"."user_mentions_1195529113169039360" to "service_role";
grant select on table "temp"."user_mentions_1195529113169039360" to "service_role";
grant trigger on table "temp"."user_mentions_1195529113169039360" to "service_role";
grant truncate on table "temp"."user_mentions_1195529113169039360" to "service_role";
grant update on table "temp"."user_mentions_1195529113169039360" to "service_role";
