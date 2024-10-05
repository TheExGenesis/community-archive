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
