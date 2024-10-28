CREATE TABLE IF NOT EXISTS public.tweets (
    tweet_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    full_text TEXT NOT NULL,
    retweet_count INTEGER NOT NULL,
    favorite_count INTEGER NOT NULL,
    reply_to_tweet_id TEXT,
    reply_to_user_id TEXT,
    reply_to_username TEXT,
    archive_upload_id BIGINT NOT NULL,

    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id)
);

ALTER TABLE public.tweets DROP COLUMN IF EXISTS fts;
ALTER TABLE public.tweets ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('english', full_text)) STORED;
CREATE INDEX IF NOT EXISTS text_fts ON public.tweets USING gin (fts);