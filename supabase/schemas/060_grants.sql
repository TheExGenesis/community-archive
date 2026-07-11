-- Grants and default privileges

-- Schema usage for readclient
GRANT USAGE ON SCHEMA "public" TO "readclient";

-- Table grants to readclient (selected public tables/views)
GRANT SELECT ON TABLE "public"."all_account" TO "readclient";
GRANT SELECT ON TABLE "public"."archive_upload" TO "readclient";
GRANT SELECT ON TABLE "public"."account" TO "readclient";
GRANT SELECT ON TABLE "public"."all_profile" TO "readclient";
GRANT SELECT ON TABLE "public"."conversations" TO "readclient";
GRANT SELECT ON TABLE "public"."enriched_tweets" TO "readclient";
GRANT SELECT ON TABLE "public"."followers" TO "readclient";
GRANT SELECT ON TABLE "public"."following" TO "readclient";
GRANT SELECT ON TABLE "public"."global_activity_summary" TO "readclient";
GRANT SELECT ON TABLE "public"."global_monthly_tweet_counts" TO "readclient";
GRANT SELECT ON TABLE "public"."liked_tweets" TO "readclient";
GRANT SELECT ON TABLE "public"."monthly_tweet_counts_mv" TO "readclient";
GRANT SELECT ON TABLE "public"."optin" TO "readclient";
GRANT SELECT ON TABLE "public"."profile" TO "readclient";
GRANT SELECT ON TABLE "public"."scraper_count" TO "readclient";
GRANT SELECT ON TABLE "public"."tweet_media" TO "readclient";
GRANT SELECT ON TABLE "public"."tweet_replies_view" TO "readclient";
GRANT SELECT ON TABLE "public"."tweet_urls" TO "readclient";
GRANT SELECT ON TABLE "public"."tweets" TO "readclient";
GRANT SELECT ON TABLE "public"."tweets_w_conversation_id" TO "readclient";
GRANT SELECT ON TABLE "public"."user_directory" TO "readclient";
GRANT SELECT ON TABLE "public"."user_mentions" TO "readclient";

-- quote_tweets / retweets: read-only for anon/authenticated; writes via service_role
-- only (firehose + worker). See #369. The blanket "GRANT ALL ON TABLE ... TO anon"
-- previously applied to these tables (via ALTER DEFAULT PRIVILEGES in prod.sql) is
-- intentionally NOT reproduced here.
REVOKE ALL PRIVILEGES ON TABLE "public"."quote_tweets" FROM "anon", "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."retweets"     FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."quote_tweets" TO "anon", "authenticated";
GRANT SELECT ON TABLE "public"."retweets"     TO "anon", "authenticated";

-- liked_tweets / mentioned_users: global dedup tables, read-only for clients (#370).
REVOKE ALL PRIVILEGES ON TABLE "public"."liked_tweets"    FROM "anon", "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."mentioned_users" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."liked_tweets"    TO "anon", "authenticated";
GRANT SELECT ON TABLE "public"."mentioned_users" TO "anon", "authenticated";

-- Archive-delete functions: not callable by anon (#372).
REVOKE EXECUTE ON FUNCTION "public"."delete_user_archive"("p_account_id" "text") FROM PUBLIC, "anon";
REVOKE EXECUTE ON FUNCTION "public"."delete_single_archive"("p_account_id" "text", "p_archive_upload_id" bigint) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."delete_user_archive"("p_account_id" "text") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."delete_single_archive"("p_account_id" "text", "p_archive_upload_id" bigint) TO "authenticated", "service_role";

-- Secure-by-default privileges for future app-owned objects. Public API access
-- must be granted explicitly by the migration that creates the object.
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";

-- Default privileges for readclient on future tables.
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES  TO "readclient";
