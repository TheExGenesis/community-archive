CREATE TABLE IF NOT EXISTS public.likes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT NOT NULL,
    liked_tweet_id TEXT NOT NULL,
    archive_upload_id BIGINT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (account_id, liked_tweet_id),
    FOREIGN KEY (account_id) REFERENCES public.all_account (account_id),
    FOREIGN KEY (liked_tweet_id) REFERENCES public.liked_tweets (tweet_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id)
);


CREATE INDEX "idx_likes_account_id" ON "public"."likes" USING "btree" ("account_id");

CREATE INDEX "idx_likes_archive_upload_id" ON "public"."likes" USING "btree" ("archive_upload_id");

CREATE INDEX "idx_likes_liked_tweet_id" ON "public"."likes" USING "btree" ("liked_tweet_id");

