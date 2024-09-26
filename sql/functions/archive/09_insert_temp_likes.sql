CREATE OR REPLACE FUNCTION public.insert_temp_likes(p_likes JSONB, p_account_id TEXT, p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user != 'postgres' THEN
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
