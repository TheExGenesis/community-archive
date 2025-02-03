CREATE TYPE upload_phase_enum AS ENUM ('uploading', 'ready_for_commit', 'committing', 'completed', 'failed');


CREATE TABLE IF NOT EXISTS public.archive_upload (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id TEXT NOT NULL,
    archive_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    keep_private BOOLEAN DEFAULT FALSE,
    upload_likes BOOLEAN DEFAULT TRUE,
    start_date DATE,
    end_date DATE,
    upload_phase upload_phase_enum DEFAULT 'uploading',
    UNIQUE (account_id, archive_at),
    FOREIGN KEY (account_id) REFERENCES public.all_account (account_id)
);

ALTER TABLE public.archive_upload ADD COLUMN upload_phase upload_phase_enum DEFAULT 'uploading';


CREATE INDEX "idx_archive_upload_account_id" ON "public"."archive_upload" USING "btree" ("account_id");

