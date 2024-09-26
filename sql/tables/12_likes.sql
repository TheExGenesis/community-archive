CREATE TABLE IF NOT EXISTS public.likes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT NOT NULL,
    liked_tweet_id TEXT NOT NULL,
    archive_upload_id BIGINT NOT NULL,
    UNIQUE (account_id, liked_tweet_id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id),
    FOREIGN KEY (liked_tweet_id) REFERENCES public.liked_tweets (tweet_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id)
);