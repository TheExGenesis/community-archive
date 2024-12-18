CREATE TABLE IF NOT EXISTS public.profile (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT NOT NULL, 
    bio TEXT,
    website TEXT,
    location TEXT,
    avatar_media_url TEXT,
    header_media_url TEXT,
    archive_upload_id BIGINT NOT NULL,
    UNIQUE (account_id, archive_upload_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (account_id) REFERENCES public.account (account_id)
);


CREATE INDEX "idx_profile_account_id" ON "public"."profile" USING "btree" ("account_id");

CREATE INDEX "idx_profile_archive_upload_id" ON "public"."profile" USING "btree" ("archive_upload_id");
