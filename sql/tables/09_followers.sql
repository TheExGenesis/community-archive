CREATE TABLE IF NOT EXISTS public.followers (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT NOT NULL,
    follower_account_id TEXT NOT NULL,
    archive_upload_id BIGINT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (account_id, follower_account_id),
    FOREIGN KEY (account_id) REFERENCES public.all_account (account_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id)
);

CREATE INDEX "idx_followers_account_id" ON "public"."followers" USING "btree" ("account_id");

CREATE INDEX "idx_followers_archive_upload_id" ON "public"."followers" USING "btree" ("archive_upload_id");
