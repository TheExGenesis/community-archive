-- Indices for public.archive_upload
CREATE INDEX IF NOT EXISTS idx_archive_upload_account_id ON public.archive_upload(account_id);

-- Indices for public.profile
CREATE INDEX IF NOT EXISTS idx_profile_account_id ON public.profile(account_id);
CREATE INDEX IF NOT EXISTS idx_profile_archive_upload_id ON public.profile(archive_upload_id);

-- Indices for public.tweets
CREATE INDEX IF NOT EXISTS idx_tweets_account_id ON public.tweets(account_id);
CREATE INDEX IF NOT EXISTS idx_tweets_archive_upload_id ON public.tweets(archive_upload_id);
CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON public.tweets(created_at DESC);

-- Indices for public.user_mentions
CREATE INDEX IF NOT EXISTS idx_user_mentions_mentioned_user_id ON public.user_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_user_mentions_tweet_id ON public.user_mentions(tweet_id);

-- Indices for public.tweet_urls
CREATE INDEX IF NOT EXISTS idx_tweet_urls_tweet_id ON public.tweet_urls(tweet_id);

-- Indices for public.tweet_media
CREATE INDEX IF NOT EXISTS idx_tweet_media_tweet_id ON public.tweet_media(tweet_id);
CREATE INDEX IF NOT EXISTS idx_tweet_media_archive_upload_id ON public.tweet_media(archive_upload_id);

-- Indices for public.followers
CREATE INDEX IF NOT EXISTS idx_followers_account_id ON public.followers(account_id);
CREATE INDEX IF NOT EXISTS idx_followers_archive_upload_id ON public.followers(archive_upload_id);

-- Indices for public.following
CREATE INDEX IF NOT EXISTS idx_following_account_id ON public.following(account_id);
CREATE INDEX IF NOT EXISTS idx_following_archive_upload_id ON public.following(archive_upload_id);

-- Indices for public.likes
CREATE INDEX IF NOT EXISTS idx_likes_account_id ON public.likes(account_id);
CREATE INDEX IF NOT EXISTS idx_likes_liked_tweet_id ON public.likes(liked_tweet_id);
CREATE INDEX IF NOT EXISTS idx_likes_archive_upload_id ON public.likes(archive_upload_id);

-- FTS index
ALTER TABLE public.tweets DROP COLUMN IF EXISTS fts;
ALTER TABLE public.tweets ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('english', full_text)) STORED;
CREATE INDEX IF NOT EXISTS text_fts ON public.tweets USING gin (fts);