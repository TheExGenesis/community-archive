-- Triggers split from prod.sql (kept behavior identical)

CREATE OR REPLACE TRIGGER "queue_job_on_upload_complete" AFTER UPDATE OF "upload_phase" ON "public"."archive_upload" FOR EACH ROW WHEN (("new"."upload_phase" = 'completed'::"public"."upload_phase_enum")) EXECUTE FUNCTION "private"."queue_archive_changes"();

CREATE OR REPLACE TRIGGER "queue_job_on_upload_delete" AFTER DELETE ON "public"."archive_upload" FOR EACH ROW EXECUTE FUNCTION "private"."queue_archive_changes"();

CREATE OR REPLACE TRIGGER "update_all_account_updated_at" BEFORE UPDATE ON "public"."all_account" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_all_profile_updated_at" BEFORE UPDATE ON "public"."all_profile" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_followers_updated_at" BEFORE UPDATE ON "public"."followers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_following_updated_at" BEFORE UPDATE ON "public"."following" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_likes_updated_at" BEFORE UPDATE ON "public"."likes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_optin_timestamp" BEFORE INSERT OR UPDATE ON "public"."optin" FOR EACH ROW EXECUTE FUNCTION "public"."update_optin_updated_at"();

CREATE OR REPLACE TRIGGER "propagate_explicit_optout_scrape_block" AFTER INSERT OR UPDATE OF "explicit_optout", "twitter_user_id", "username" ON "public"."optin" FOR EACH ROW EXECUTE FUNCTION "public"."propagate_explicit_optout_scrape_block"();

CREATE OR REPLACE TRIGGER "update_tweet_media_updated_at" BEFORE UPDATE ON "public"."tweet_media" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_tweet_urls_updated_at" BEFORE UPDATE ON "public"."tweet_urls" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE OR REPLACE TRIGGER "update_profile_settings_updated_at" BEFORE UPDATE ON "public"."profile_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE OR REPLACE TRIGGER "update_profile_curation_updated_at" BEFORE UPDATE ON "public"."profile_curation" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE OR REPLACE TRIGGER "update_tweet_link_previews_updated_at" BEFORE UPDATE ON "public"."tweet_link_previews" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_tweets_updated_at" BEFORE UPDATE ON "public"."tweets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_user_mentions_updated_at" BEFORE UPDATE ON "public"."user_mentions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_tes_blocked_scraping_timestamp" BEFORE UPDATE ON "tes"."blocked_scraping_users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "capture_policy_block_username" BEFORE INSERT OR UPDATE OF "account_id", "username" ON "tes"."blocked_scraping_users" FOR EACH ROW EXECUTE FUNCTION "public"."capture_policy_block_username"();

CREATE OR REPLACE TRIGGER "apply_policy_block_tombstone" AFTER INSERT OR UPDATE OF "account_id", "username" ON "tes"."blocked_scraping_users" FOR EACH ROW EXECUTE FUNCTION "public"."apply_policy_block_tombstone"();

CREATE OR REPLACE TRIGGER "enforce_policy_account_tombstone" BEFORE INSERT OR UPDATE ON "public"."all_account" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_policy_account_tombstone"();

CREATE OR REPLACE TRIGGER "enforce_policy_tweet_tombstone" BEFORE INSERT OR UPDATE ON "public"."tweets" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_policy_tweet_tombstone"();

CREATE OR REPLACE TRIGGER "protect_policy_tombstone_delete" BEFORE DELETE ON "public"."all_account" FOR EACH ROW EXECUTE FUNCTION "public"."protect_policy_tombstone_delete"();
CREATE OR REPLACE TRIGGER "protect_policy_tombstone_delete" BEFORE DELETE ON "public"."tweets" FOR EACH ROW EXECUTE FUNCTION "public"."protect_policy_tombstone_delete"();

CREATE OR REPLACE TRIGGER "enforce_policy_mentioned_user_tombstone" BEFORE INSERT OR UPDATE ON "public"."mentioned_users" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_policy_mentioned_user_tombstone"();

CREATE OR REPLACE TRIGGER "enforce_policy_liked_tweet_tombstone" BEFORE INSERT OR UPDATE ON "public"."liked_tweets" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_policy_liked_tweet_tombstone"();

CREATE OR REPLACE TRIGGER "enforce_policy_archive_object" BEFORE INSERT OR UPDATE OF "bucket_id", "name" ON "storage"."objects" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_policy_archive_object"();

CREATE OR REPLACE TRIGGER "reject_policy_blocked_account_detail" BEFORE INSERT OR UPDATE ON "public"."all_profile" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_blocked_account_detail"('account_id');
CREATE OR REPLACE TRIGGER "reject_policy_blocked_account_detail" BEFORE INSERT OR UPDATE ON "public"."archive_upload" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_blocked_account_detail"('account_id');
CREATE OR REPLACE TRIGGER "reject_policy_blocked_account_detail" BEFORE INSERT OR UPDATE ON "public"."likes" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_blocked_account_detail"('account_id');
CREATE OR REPLACE TRIGGER "reject_policy_blocked_account_detail" BEFORE INSERT OR UPDATE ON "public"."followers" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_blocked_account_detail"('account_id');
CREATE OR REPLACE TRIGGER "reject_policy_blocked_account_detail" BEFORE INSERT OR UPDATE ON "public"."following" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_blocked_account_detail"('account_id');
CREATE OR REPLACE TRIGGER "reject_policy_blocked_account_detail" BEFORE INSERT OR UPDATE ON "public"."profile_settings" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_blocked_account_detail"('account_id');
CREATE OR REPLACE TRIGGER "reject_policy_blocked_account_detail" BEFORE INSERT OR UPDATE ON "public"."profile_curation" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_blocked_account_detail"('account_id');

CREATE OR REPLACE TRIGGER "reject_policy_tombstone_tweet_detail" BEFORE INSERT OR UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_tombstone_tweet_detail"('tweet_id');
CREATE OR REPLACE TRIGGER "reject_policy_tombstone_tweet_detail" BEFORE INSERT OR UPDATE ON "public"."tweet_media" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_tombstone_tweet_detail"('tweet_id');
CREATE OR REPLACE TRIGGER "reject_policy_tombstone_tweet_detail" BEFORE INSERT OR UPDATE ON "public"."user_mentions" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_tombstone_tweet_detail"('tweet_id');
CREATE OR REPLACE TRIGGER "reject_policy_tombstone_tweet_detail" BEFORE INSERT OR UPDATE ON "public"."tweet_urls" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_tombstone_tweet_detail"('tweet_id');
CREATE OR REPLACE TRIGGER "reject_policy_tombstone_tweet_detail" BEFORE INSERT OR UPDATE ON "public"."quote_tweets" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_tombstone_tweet_detail"('tweet_id');
CREATE OR REPLACE TRIGGER "reject_policy_tombstone_tweet_detail" BEFORE INSERT OR UPDATE ON "public"."retweets" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_tombstone_tweet_detail"('tweet_id');
CREATE OR REPLACE TRIGGER "reject_policy_tombstone_tweet_detail" BEFORE INSERT OR UPDATE ON "private"."tweet_user" FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_tombstone_tweet_detail"('tweet_id');



-- Record completed archive uploads in user_action_log.
CREATE OR REPLACE TRIGGER trg_log_archive_upload_event
  AFTER INSERT OR UPDATE OF upload_phase ON public.archive_upload
  FOR EACH ROW EXECUTE FUNCTION public.log_archive_upload_event();
