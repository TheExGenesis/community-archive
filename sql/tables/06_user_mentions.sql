CREATE TABLE IF NOT EXISTS public.user_mentions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    mentioned_user_id TEXT NOT NULL,
    tweet_id TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id),
    FOREIGN KEY (mentioned_user_id) REFERENCES public.mentioned_users (user_id),
    UNIQUE(mentioned_user_id, tweet_id)
);


CREATE INDEX "idx_user_mentions_mentioned_user_id" ON "public"."user_mentions" USING "btree" ("mentioned_user_id");

CREATE INDEX "idx_user_mentions_tweet_id" ON "public"."user_mentions" USING "btree" ("tweet_id");

