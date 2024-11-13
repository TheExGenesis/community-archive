CREATE TABLE IF NOT EXISTS public.liked_tweets (
    tweet_id TEXT PRIMARY KEY,
    full_text TEXT NOT NULL,
    fts tsvector GENERATED ALWAYS AS (to_tsvector('english', full_text)) STORED
);

CREATE INDEX IF NOT EXISTS text_fts ON public.liked_tweets USING gin (fts);
