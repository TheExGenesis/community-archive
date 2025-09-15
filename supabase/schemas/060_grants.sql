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
GRANT SELECT ON TABLE "public"."user_mentions" TO "readclient";

-- Default privileges for readclient on future tables
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES  TO "readclient";

