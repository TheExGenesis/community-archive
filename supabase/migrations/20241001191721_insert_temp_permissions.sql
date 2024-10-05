
CREATE OR REPLACE FUNCTION public.create_temp_tables(p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
-- Check if the user is authenticated or is the postgres role
IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
IF p_suffix != ((SELECT auth.jwt()) -> 'app_metadata' ->> 'provider_id') AND current_user != 'postgres' THEN
RAISE EXCEPTION 'Not authorized to process this archive';
END IF;
-- Drop the temporary tables if they exist
PERFORM public.drop_temp_tables(p_suffix);
-- Create new tables
EXECUTE format('CREATE TABLE temp.archive_upload_%s (LIKE public.archive_upload INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.account_%s (LIKE public.account INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.profile_%s (LIKE public.profile INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.tweets_%s (LIKE public.tweets INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.mentioned_users_%s (LIKE public.mentioned_users INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.user_mentions_%s (LIKE public.user_mentions INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.tweet_urls_%s (LIKE public.tweet_urls INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.tweet_media_%s (LIKE public.tweet_media INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.followers_%s (LIKE public.followers INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.following_%s (LIKE public.following INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.liked_tweets_%s (LIKE public.liked_tweets INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.likes_%s (LIKE public.likes INCLUDING ALL)', p_suffix);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.insert_temp_account(p_account JSONB, p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
RAISE EXCEPTION 'Not authenticated';
END IF;

EXECUTE format('
INSERT INTO temp.account_%s (
    account_id, created_via, username, created_at, account_display_name,
    num_tweets, num_following, num_followers, num_likes
)
SELECT
$1->>''accountId'',
$1->>''createdVia'',
$1->>''username'',
($1->>''createdAt'')::TIMESTAMP WITH TIME ZONE,
$1->>''accountDisplayName'',
COALESCE(($1->>''num_tweets'')::INTEGER, 0),
COALESCE(($1->>''num_following'')::INTEGER, 0),
COALESCE(($1->>''num_followers'')::INTEGER, 0),
COALESCE(($1->>''num_likes'')::INTEGER, 0)
', p_suffix)
USING p_account;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.insert_temp_profiles(p_profile JSONB, p_account_id TEXT, p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
EXECUTE format('
INSERT INTO temp.profile_%s (bio, website, location, avatar_media_url, header_media_url, account_id, archive_upload_id)
SELECT
($1->''description''->>''bio'')::TEXT,
($1->''description''->>''website'')::TEXT,
($1->''description''->>''location'')::TEXT,
($1->>''avatarMediaUrl'')::TEXT,
($1->>''headerMediaUrl'')::TEXT,
$2,
-1
', p_suffix) USING p_profile, p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.insert_temp_archive_upload(
    p_account_id TEXT,
    p_archive_at TIMESTAMP WITH TIME ZONE,
    p_keep_private BOOLEAN,
    p_upload_likes BOOLEAN,
    p_start_date DATE,
    p_end_date DATE,
    p_suffix TEXT
)
RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
        INSERT INTO temp.archive_upload_%s (
            account_id,
            archive_at,
            keep_private,
            upload_likes,
            start_date,
            end_date
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
    ', p_suffix)
    USING
        p_account_id,
        p_archive_at,
        p_keep_private,
        p_upload_likes,
        p_start_date,
        p_end_date
    INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.insert_temp_tweets(p_tweets JSONB, p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
EXECUTE format('
INSERT INTO temp.tweets_%s (
tweet_id, account_id, created_at, full_text, retweet_count, favorite_count,
reply_to_tweet_id, reply_to_user_id, reply_to_username, archive_upload_id
)
SELECT
(tweet->>''id_str'')::TEXT,
(tweet->>''user_id'')::TEXT,
(tweet->>''created_at'')::TIMESTAMP WITH TIME ZONE,
(tweet->>''full_text'')::TEXT,
(tweet->>''retweet_count'')::INTEGER,
(tweet->>''favorite_count'')::INTEGER,
(tweet->>''in_reply_to_status_id_str'')::TEXT,
(tweet->>''in_reply_to_user_id_str'')::TEXT,
(tweet->>''in_reply_to_screen_name'')::TEXT,
-1
FROM jsonb_array_elements($1) AS tweet
', p_suffix) USING p_tweets;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.process_and_insert_tweet_entities(p_tweets JSONB, p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
-- Insert mentioned users
EXECUTE format('
INSERT INTO temp.mentioned_users_%s (user_id, name, screen_name, updated_at)
SELECT DISTINCT
(mentioned_user->>''id_str'')::TEXT,
(mentioned_user->>''name'')::TEXT,
(mentioned_user->>''screen_name'')::TEXT,
NOW()
FROM jsonb_array_elements($1) AS tweet,
jsonb_array_elements(tweet->''entities''->''user_mentions'') AS mentioned_user
', p_suffix) USING p_tweets;
-- Insert user mentions
EXECUTE format('
INSERT INTO temp.user_mentions_%s (mentioned_user_id, tweet_id)
SELECT
(mentioned_user->>''id_str'')::TEXT,
(tweet->>''id_str'')::TEXT
FROM jsonb_array_elements($1) AS tweet,
jsonb_array_elements(tweet->''entities''->''user_mentions'') AS mentioned_user
', p_suffix) USING p_tweets;
-- Insert tweet media
EXECUTE format('
INSERT INTO temp.tweet_media_%s (media_id, tweet_id, media_url, media_type, width, height, archive_upload_id)
SELECT
(media->>''id_str'')::BIGINT,
(tweet->>''id_str'')::TEXT,
(media->>''media_url_https'')::TEXT,
(media->>''type'')::TEXT,
(media->''sizes''->''large''->>''w'')::INTEGER,
(media->''sizes''->''large''->>''h'')::INTEGER,
-1
FROM jsonb_array_elements($1) AS tweet,
jsonb_array_elements(tweet->''entities''->''media'') AS media
', p_suffix) USING p_tweets;
-- Insert tweet URLs
EXECUTE format('
INSERT INTO temp.tweet_urls_%s (url, expanded_url, display_url, tweet_id)
SELECT
(url->>''url'')::TEXT,
(url->>''expanded_url'')::TEXT,
(url->>''display_url'')::TEXT,
(tweet->>''id_str'')::TEXT
FROM jsonb_array_elements($1) AS tweet,
jsonb_array_elements(tweet->''entities''->''urls'') AS url
', p_suffix) USING p_tweets;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.insert_temp_followers(p_followers JSONB, p_account_id TEXT, p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
EXECUTE format('
INSERT INTO temp.followers_%s (account_id, follower_account_id, archive_upload_id)
SELECT
$2,
(follower->''follower''->>''accountId'')::TEXT,
-1
FROM jsonb_array_elements($1) AS follower
', p_suffix)
USING p_followers, p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.insert_temp_following(p_following JSONB, p_account_id TEXT, p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
EXECUTE format('
INSERT INTO temp.following_%s (account_id, following_account_id, archive_upload_id)
SELECT
$2,
(following->''following''->>''accountId'')::TEXT,
-1
FROM jsonb_array_elements($1) AS following
', p_suffix)
USING p_following, p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



CREATE OR REPLACE FUNCTION public.insert_temp_likes(p_likes JSONB, p_account_id TEXT, p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
EXECUTE format('
INSERT INTO temp.liked_tweets_%s (tweet_id, full_text)
SELECT
(likes->''like''->>''tweetId'')::TEXT,
(likes->''like''->>''fullText'')::TEXT
FROM jsonb_array_elements($1) AS likes
ON CONFLICT (tweet_id) DO NOTHING
', p_suffix) USING p_likes;
EXECUTE format('
INSERT INTO temp.likes_%s (account_id, liked_tweet_id, archive_upload_id)
SELECT
$2,
(likes->''like''->>''tweetId'')::TEXT,
-1
FROM jsonb_array_elements($1) AS likes
ON CONFLICT (account_id, liked_tweet_id) DO NOTHING
', p_suffix) USING p_likes, p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.drop_temp_tables(p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
EXECUTE format('DROP TABLE IF EXISTS temp.account_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.archive_upload_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.profile_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.tweets_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.mentioned_users_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.user_mentions_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.tweet_urls_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.tweet_media_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.followers_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.following_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.liked_tweets_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.likes_%s', p_suffix);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



-- Create or replace the commit_temp_data function
CREATE OR REPLACE FUNCTION public.commit_temp_data(p_suffix TEXT)
RETURNS VOID AS $$
DECLARE
    v_archive_upload_id BIGINT;
    v_account_id TEXT;
    v_archive_at TIMESTAMP WITH TIME ZONE;
    v_keep_private BOOLEAN;
    v_upload_likes BOOLEAN;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    -- 1. Insert account data first
    EXECUTE format('
        INSERT INTO public.account (
            created_via, username, account_id, created_at, account_display_name,
            num_tweets, num_following, num_followers, num_likes
        )
        SELECT 
            created_via, username, account_id, created_at, account_display_name,
            num_tweets, num_following, num_followers, num_likes
        FROM temp.account_%s
        ON CONFLICT (account_id) DO UPDATE SET
            username = EXCLUDED.username,
            account_display_name = EXCLUDED.account_display_name,
            created_via = EXCLUDED.created_via,
            created_at = EXCLUDED.created_at,
            num_tweets = EXCLUDED.num_tweets,
            num_following = EXCLUDED.num_following,
            num_followers = EXCLUDED.num_followers,
            num_likes = EXCLUDED.num_likes
        RETURNING account_id
    ', p_suffix) INTO v_account_id;

    -- 2. Get the latest archive upload data from temp.archive_upload
    EXECUTE format('
        SELECT archive_at, keep_private, upload_likes, start_date, end_date
        FROM temp.archive_upload_%s
        ORDER BY archive_at DESC
        LIMIT 1
    ', p_suffix) INTO v_archive_at, v_keep_private, v_upload_likes, v_start_date, v_end_date;

    -- 3. Insert or update archive_upload and get the ID
    INSERT INTO public.archive_upload (
        account_id, 
        archive_at, 
        created_at, 
        keep_private, 
        upload_likes, 
        start_date, 
        end_date
    )
    VALUES (
        v_account_id, 
        v_archive_at, 
        CURRENT_TIMESTAMP, 
        v_keep_private, 
        v_upload_likes, 
        v_start_date, 
        v_end_date
    )
    ON CONFLICT (account_id, archive_at)
    DO UPDATE SET
        account_id = EXCLUDED.account_id,
        created_at = CURRENT_TIMESTAMP,
        keep_private = EXCLUDED.keep_private,
        upload_likes = EXCLUDED.upload_likes,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date
    RETURNING id INTO v_archive_upload_id;

    -- Insert profile data
    EXECUTE format('
        INSERT INTO public.profile (bio, website, location, avatar_media_url, header_media_url, account_id, archive_upload_id)
        SELECT p.bio, p.website, p.location, p.avatar_media_url, p.header_media_url, p.account_id, $1
        FROM temp.profile_%s p
        ON CONFLICT (account_id, archive_upload_id) DO UPDATE SET
            bio = EXCLUDED.bio,
            website = EXCLUDED.website,
            location = EXCLUDED.location,
            avatar_media_url = EXCLUDED.avatar_media_url,
            header_media_url = EXCLUDED.header_media_url,
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;

    -- Insert tweets data
    EXECUTE format('
        INSERT INTO public.tweets (tweet_id, account_id, created_at, full_text, retweet_count, favorite_count, reply_to_tweet_id, reply_to_user_id, reply_to_username, archive_upload_id)
        SELECT t.tweet_id, t.account_id, t.created_at, t.full_text, t.retweet_count, t.favorite_count, t.reply_to_tweet_id, t.reply_to_user_id, t.reply_to_username, $1
        FROM temp.tweets_%s t
        ON CONFLICT (tweet_id) DO UPDATE SET
            full_text = EXCLUDED.full_text,
            retweet_count = EXCLUDED.retweet_count,
            favorite_count = EXCLUDED.favorite_count,
            reply_to_tweet_id = EXCLUDED.reply_to_tweet_id,
            reply_to_user_id = EXCLUDED.reply_to_user_id,
            reply_to_username = EXCLUDED.reply_to_username,
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;

    -- Insert tweet_media data
    EXECUTE format('
        INSERT INTO public.tweet_media (media_id, tweet_id, media_url, media_type, width, height, archive_upload_id)
        SELECT tm.media_id, tm.tweet_id, tm.media_url, tm.media_type, tm.width, tm.height, $1
        FROM temp.tweet_media_%s tm
        ON CONFLICT (media_id) DO UPDATE SET
            media_url = EXCLUDED.media_url,
            media_type = EXCLUDED.media_type,
            width = EXCLUDED.width,
            height = EXCLUDED.height,
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;

    -- Insert mentioned_users data
    EXECUTE format('
        INSERT INTO public.mentioned_users (user_id, name, screen_name, updated_at)
        SELECT user_id, name, screen_name, updated_at
        FROM temp.mentioned_users_%s
        ON CONFLICT (user_id) DO UPDATE SET
            name = EXCLUDED.name,
            screen_name = EXCLUDED.screen_name,
            updated_at = EXCLUDED.updated_at
    ', p_suffix);

    -- Insert user_mentions data
    EXECUTE format('
        INSERT INTO public.user_mentions (mentioned_user_id, tweet_id)
        SELECT um.mentioned_user_id, um.tweet_id
        FROM temp.user_mentions_%s um
        JOIN public.mentioned_users mu ON um.mentioned_user_id = mu.user_id
        JOIN public.tweets t ON um.tweet_id = t.tweet_id
        ON CONFLICT (mentioned_user_id, tweet_id) DO NOTHING
    ', p_suffix);

    -- Insert tweet_urls data
    EXECUTE format('
        INSERT INTO public.tweet_urls (url, expanded_url, display_url, tweet_id)
        SELECT tu.url, tu.expanded_url, tu.display_url, tu.tweet_id
        FROM temp.tweet_urls_%s tu
        JOIN public.tweets t ON tu.tweet_id = t.tweet_id
        ON CONFLICT (tweet_id, url) DO NOTHING
    ', p_suffix);

    -- Insert followers data
    EXECUTE format('
        INSERT INTO public.followers (account_id, follower_account_id, archive_upload_id)
        SELECT f.account_id, f.follower_account_id, $1
        FROM temp.followers_%s f
        ON CONFLICT (account_id, follower_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;

    -- Insert following data
    EXECUTE format('
        INSERT INTO public.following (account_id, following_account_id, archive_upload_id)
        SELECT f.account_id, f.following_account_id, $1
        FROM temp.following_%s f
        ON CONFLICT (account_id, following_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;

    -- Insert liked_tweets data
    EXECUTE format('
        INSERT INTO public.liked_tweets (tweet_id, full_text)
        SELECT lt.tweet_id, lt.full_text
        FROM temp.liked_tweets_%s lt
        ON CONFLICT (tweet_id) DO NOTHING
    ', p_suffix);

    -- Insert likes data
    EXECUTE format('
        INSERT INTO public.likes (account_id, liked_tweet_id, archive_upload_id)
        SELECT l.account_id, l.liked_tweet_id, $1
        FROM temp.likes_%s l
        ON CONFLICT (account_id, liked_tweet_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;

    -- Drop temporary tables after committing
    PERFORM public.drop_temp_tables(p_suffix);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout TO '30min';
