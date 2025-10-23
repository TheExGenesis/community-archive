CREATE INDEX IF NOT EXISTS idx_archive_upload_username ON public.archive_upload USING btree (username);

CREATE INDEX IF NOT EXISTS idx_tweets_account_created ON public.tweets USING btree (account_id, created_at);
