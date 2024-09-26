CREATE TABLE IF NOT EXISTS public.followers (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT NOT NULL,
    follower_account_id TEXT NOT NULL,
    archive_upload_id BIGINT NOT NULL,
    UNIQUE (account_id, follower_account_id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id)
);