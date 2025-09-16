-- Row Level Security policies and enablement

-- Modification policies for authenticated users
CREATE POLICY "Data is modifiable by their users" ON "public"."all_account" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Data is modifiable by their users" ON "public"."all_profile" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Data is modifiable by their users" ON "public"."archive_upload" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Data is modifiable by their users" ON "public"."followers" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Data is modifiable by their users" ON "public"."following" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Data is modifiable by their users" ON "public"."likes" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Data is modifiable by their users" ON "public"."tweets" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));

-- Public read policies
CREATE POLICY "Data is publicly visible" ON "public"."all_account" FOR SELECT USING (true);
CREATE POLICY "Data is publicly visible" ON "public"."all_profile" FOR SELECT USING (true);
CREATE POLICY "Data is publicly visible" ON "public"."archive_upload" FOR SELECT USING (true);
CREATE POLICY "Data is publicly visible" ON "public"."followers" FOR SELECT USING (true);
CREATE POLICY "Data is publicly visible" ON "public"."following" FOR SELECT USING (true);
CREATE POLICY "Data is publicly visible" ON "public"."likes" FOR SELECT USING (true);

-- Entity-specific modify/read policies
CREATE POLICY "Entities are modifiable by their users" ON "public"."liked_tweets" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))));
CREATE POLICY "Entities are modifiable by their users" ON "public"."mentioned_users" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."all_account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."all_account" "dt"
  WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))));
CREATE POLICY "Entities are modifiable by their users" ON "public"."tweet_media" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_media"."tweet_id") AND ("dt"."account_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_media"."tweet_id") AND ("dt"."account_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));
CREATE POLICY "Entities are modifiable by their users" ON "public"."tweet_urls" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_urls"."tweet_id") AND ("dt"."account_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "tweet_urls"."tweet_id") AND ("dt"."account_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));
CREATE POLICY "Entities are modifiable by their users" ON "public"."user_mentions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "user_mentions"."tweet_id") AND ("dt"."account_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tweets" "dt"
  WHERE (("dt"."tweet_id" = "user_mentions"."tweet_id") AND ("dt"."account_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));

CREATE POLICY "Entities are publicly visible" ON "public"."liked_tweets" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "public"."mentioned_users" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "public"."tweet_media" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "public"."tweet_urls" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "public"."user_mentions" FOR SELECT USING (true);

-- Opt-in table policies
CREATE POLICY "Public can view opted-in users" ON "public"."optin" FOR SELECT USING (("opted_in" = true));
CREATE POLICY "Users can create own opt-in record" ON "public"."optin" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can update own opt-in status" ON "public"."optin" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can view own opt-in status" ON "public"."optin" FOR SELECT USING (("auth"."uid"() = "user_id"));

-- Tweets public read policy
CREATE POLICY "anyone can read tweets" ON "public"."tweets" FOR SELECT USING (true);

-- TES schema policy
CREATE POLICY "Allow select for all" ON "tes"."blocked_scraping_users" FOR SELECT USING (true);

-- Enable RLS on relevant tables
ALTER TABLE "public"."all_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."all_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."archive_upload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."followers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."following" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."liked_tweets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."likes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."mentioned_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."optin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tweet_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tweet_urls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tweets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_mentions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tes"."blocked_scraping_users" ENABLE ROW LEVEL SECURITY;

