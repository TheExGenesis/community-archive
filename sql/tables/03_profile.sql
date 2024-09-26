CREATE TABLE IF NOT EXISTS public.profile (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT NOT NULL, 
    bio TEXT,
    website TEXT,
    LOCATION TEXT,
    avatar_media_url TEXT,
    header_media_url TEXT,
    archive_upload_id BIGINT NOT NULL,
    UNIQUE (account_id, archive_upload_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id)
);