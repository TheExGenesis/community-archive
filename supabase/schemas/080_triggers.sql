-- Triggers split from prod.sql (kept behavior identical)

CREATE OR REPLACE TRIGGER "queue_job_on_upload_complete" AFTER UPDATE OF "upload_phase" ON "public"."archive_upload" FOR EACH ROW WHEN (("new"."upload_phase" = 'completed'::"public"."upload_phase_enum")) EXECUTE FUNCTION "private"."queue_archive_changes"();

CREATE OR REPLACE TRIGGER "queue_job_on_upload_delete" AFTER DELETE ON "public"."archive_upload" FOR EACH ROW EXECUTE FUNCTION "private"."queue_archive_changes"();

CREATE OR REPLACE TRIGGER "trigger_commit_temp_data" AFTER UPDATE OF "upload_phase" ON "public"."archive_upload" FOR EACH ROW WHEN (("new"."upload_phase" = 'ready_for_commit'::"public"."upload_phase_enum")) EXECUTE FUNCTION "public"."trigger_commit_temp_data"();

CREATE OR REPLACE TRIGGER "update_all_account_updated_at" BEFORE UPDATE ON "public"."all_account" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_all_profile_updated_at" BEFORE UPDATE ON "public"."all_profile" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_followers_updated_at" BEFORE UPDATE ON "public"."followers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_following_updated_at" BEFORE UPDATE ON "public"."following" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_likes_updated_at" BEFORE UPDATE ON "public"."likes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_optin_timestamp" BEFORE UPDATE ON "public"."optin" FOR EACH ROW EXECUTE FUNCTION "public"."update_optin_updated_at"();

CREATE OR REPLACE TRIGGER "update_tweet_media_updated_at" BEFORE UPDATE ON "public"."tweet_media" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_tweet_urls_updated_at" BEFORE UPDATE ON "public"."tweet_urls" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_tweets_updated_at" BEFORE UPDATE ON "public"."tweets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_user_mentions_updated_at" BEFORE UPDATE ON "public"."user_mentions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_tes_blocked_scraping_timestamp" BEFORE UPDATE ON "tes"."blocked_scraping_users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

