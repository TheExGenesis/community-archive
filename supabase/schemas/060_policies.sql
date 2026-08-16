-- Row Level Security policies and enablement

ALTER TABLE "public"."digest_prompt_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."digest_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."digest_editions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published digest editions are publicly readable"
  ON "public"."digest_editions"
  FOR SELECT
  TO "anon", "authenticated"
  USING ("status" = 'published');

-- Storage policies for the private archives bucket. Writes are restricted to
-- the folder named by trusted, server-controlled app_metadata; the upload
-- client derives the same name from its verified Twitter identity (#372).
CREATE POLICY "Users can read their own archive" ON "storage"."objects"
  FOR SELECT TO "authenticated"
  USING (
    ("bucket_id" = 'archives'::"text")
    AND ("storage"."filename"("name") = 'archive.json'::"text")
    AND (
      "lower"(("storage"."foldername"("name"))[1]) =
      "lower"((SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text")))
    )
    AND public.assert_archive_upload_allowed(
      (SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'provider_id'::"text")),
      (SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text"))
    )
  );

CREATE POLICY "Users can upload their own archive" ON "storage"."objects"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    ("bucket_id" = 'archives'::"text")
    AND ("storage"."filename"("name") = 'archive.json'::"text")
    AND (
      "lower"(("storage"."foldername"("name"))[1]) =
      "lower"((SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text")))
    )
    AND public.assert_archive_upload_allowed(
      (SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'provider_id'::"text")),
      (SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text"))
    )
  );

CREATE POLICY "Users can update their own archive" ON "storage"."objects"
  FOR UPDATE TO "authenticated"
  USING (
    ("bucket_id" = 'archives'::"text")
    AND ("storage"."filename"("name") = 'archive.json'::"text")
    AND (
      "lower"(("storage"."foldername"("name"))[1]) =
      "lower"((SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text")))
    )
    AND public.assert_archive_upload_allowed(
      (SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'provider_id'::"text")),
      (SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text"))
    )
  )
  WITH CHECK (
    ("bucket_id" = 'archives'::"text")
    AND ("storage"."filename"("name") = 'archive.json'::"text")
    AND (
      "lower"(("storage"."foldername"("name"))[1]) =
      "lower"((SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text")))
    )
    AND public.assert_archive_upload_allowed(
      (SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'provider_id'::"text")),
      (SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text"))
    )
  );

CREATE POLICY "Users can delete their own archive" ON "storage"."objects"
  FOR DELETE TO "authenticated"
  USING (
    ("bucket_id" = 'archives'::"text")
    AND ("storage"."filename"("name") = 'archive.json'::"text")
    AND (
      "lower"(("storage"."foldername"("name"))[1]) =
      "lower"((SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text")))
    )
  );

-- Modification policies for authenticated users
CREATE POLICY "Data is modifiable by their users" ON "public"."all_account" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Data is modifiable by their users" ON "public"."all_profile" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Data is modifiable by their users" ON "public"."archive_upload" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Data is modifiable by their users" ON "public"."followers" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Data is modifiable by their users" ON "public"."following" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Data is modifiable by their users" ON "public"."likes" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));
CREATE POLICY "Data is modifiable by their users" ON "public"."tweets" TO "authenticated" USING (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))) WITH CHECK (("account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")));

-- Public read policies
CREATE POLICY "Data is publicly visible" ON "public"."all_account" FOR SELECT USING (("is_tombstone" IS NOT TRUE));
CREATE POLICY "Data is publicly visible" ON "public"."all_profile" FOR SELECT USING (true);
CREATE POLICY "Data is publicly visible" ON "public"."archive_upload" FOR SELECT USING (true);
CREATE POLICY "Data is publicly visible" ON "public"."followers" FOR SELECT USING (true);
CREATE POLICY "Data is publicly visible" ON "public"."following" FOR SELECT USING (true);
CREATE POLICY "Data is publicly visible" ON "public"."likes" FOR SELECT USING (true);

-- Entity-specific modify/read policies
-- NOTE: liked_tweets and mentioned_users are global dedup tables written only by
-- the service_role worker (which bypasses RLS). They intentionally have NO
-- authenticated write policy: the previous "modifiable by their users" policy was
-- uncorrelated to the row being changed and allowed cross-user modification (#370).
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

CREATE POLICY "Entities are publicly visible" ON "public"."liked_tweets" FOR SELECT USING (
  "author_account_id" IS NOT NULL
  OR ("is_tombstone" = true AND "full_text" = '')
);
CREATE POLICY "Entities are publicly visible" ON "public"."mentioned_users" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "public"."tweet_media" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "public"."tweet_urls" FOR SELECT USING (true);
CREATE POLICY "Entities are publicly visible" ON "public"."user_mentions" FOR SELECT USING (true);

-- quote_tweets / retweets are written only by the service_role (firehose + worker).
-- Reads are public; anon/authenticated writes are revoked in 060_grants and enforced
-- by RLS being enabled here (#369).
CREATE POLICY "Quote tweets are publicly visible" ON "public"."quote_tweets" FOR SELECT USING (true);
CREATE POLICY "Retweets are publicly visible" ON "public"."retweets" FOR SELECT USING (true);

-- Opt-in table policies
CREATE POLICY "Public can view opted-in users" ON "public"."optin" FOR SELECT USING (("opted_in" = true));
CREATE POLICY "Users can create own opt-in record" ON "public"."optin" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can update own opt-in status" ON "public"."optin" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can view own opt-in status" ON "public"."optin" FOR SELECT USING (("auth"."uid"() = "user_id"));

-- Tweets public read policy
CREATE POLICY "anyone can read tweets" ON "public"."tweets" FOR SELECT USING (("is_tombstone" IS NOT TRUE));

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
ALTER TABLE "public"."quote_tweets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."retweets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tes"."blocked_scraping_users" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profile_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profile_curation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tweet_link_previews" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profile settings are publicly visible"
  ON "public"."profile_settings" FOR SELECT
  TO "anon", "authenticated" USING (true);
CREATE POLICY "Owners can insert profile settings"
  ON "public"."profile_settings" FOR INSERT
  TO "authenticated" WITH CHECK (
    "account_id" = (SELECT "auth"."jwt"()->'app_metadata'->>'provider_id')
  );
CREATE POLICY "Owners can update profile settings"
  ON "public"."profile_settings" FOR UPDATE
  TO "authenticated" USING (
    "account_id" = (SELECT "auth"."jwt"()->'app_metadata'->>'provider_id')
  ) WITH CHECK (
    "account_id" = (SELECT "auth"."jwt"()->'app_metadata'->>'provider_id')
  );

CREATE POLICY "Profile curation is publicly visible"
  ON "public"."profile_curation" FOR SELECT
  TO "anon", "authenticated" USING (true);
CREATE POLICY "Owners can insert profile curation"
  ON "public"."profile_curation" FOR INSERT
  TO "authenticated" WITH CHECK (
    "account_id" = (SELECT "auth"."jwt"()->'app_metadata'->>'provider_id')
  );
CREATE POLICY "Owners can update profile curation"
  ON "public"."profile_curation" FOR UPDATE
  TO "authenticated" USING (
    "account_id" = (SELECT "auth"."jwt"()->'app_metadata'->>'provider_id')
  ) WITH CHECK (
    "account_id" = (SELECT "auth"."jwt"()->'app_metadata'->>'provider_id')
  );
CREATE POLICY "Owners can delete profile curation"
  ON "public"."profile_curation" FOR DELETE
  TO "authenticated" USING (
    "account_id" = (SELECT "auth"."jwt"()->'app_metadata'->>'provider_id')
  );

CREATE POLICY "Tweet link previews are publicly visible"
  ON "public"."tweet_link_previews" FOR SELECT
  TO "anon", "authenticated" USING (true);



-- public.user_action_log: users can read and append their own action history.
-- Service role bypasses RLS for the trigger and admin reads.
ALTER TABLE "public"."user_action_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own action log" ON "public"."user_action_log"
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR account_id = ((auth.jwt()->'app_metadata'->>'provider_id')::text)
  );

CREATE POLICY "Users can read own action log" ON "public"."user_action_log"
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR account_id = ((auth.jwt()->'app_metadata'->>'provider_id')::text)
  );

GRANT SELECT, INSERT ON public.user_action_log TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.user_action_log_id_seq TO authenticated, service_role;
