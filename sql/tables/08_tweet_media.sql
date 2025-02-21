CREATE TABLE IF NOT EXISTS public.tweet_media (
    media_id BIGINT PRIMARY KEY,
    tweet_id TEXT NOT NULL,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL,
    WIDTH INTEGER NOT NULL,
    HEIGHT INTEGER NOT NULL,
    archive_upload_id BIGINT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id)
);

CREATE INDEX "idx_tweet_media_archive_upload_id" ON "public"."tweet_media" USING "btree" ("archive_upload_id");

CREATE INDEX "idx_tweet_media_tweet_id" ON "public"."tweet_media" USING "btree" ("tweet_id");