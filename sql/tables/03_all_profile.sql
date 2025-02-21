CREATE TABLE IF NOT EXISTS public.all_profile (
    account_id TEXT PRIMARY KEY,  
    bio TEXT,
    website TEXT,
    location TEXT,
    avatar_media_url TEXT,
    header_media_url TEXT,
    archive_upload_id BIGINT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (account_id, archive_upload_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (account_id) REFERENCES public.all_account (account_id)
);


CREATE INDEX "idx_profile_archive_upload_id" ON "public"."profile" USING "btree" ("archive_upload_id");
