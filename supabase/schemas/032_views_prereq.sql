-- Views required by materialized views

-- public.account
CREATE OR REPLACE VIEW "public"."account" AS
 SELECT "a"."account_id",
    "a"."created_via",
    "a"."username",
    "a"."created_at",
    "a"."account_display_name",
    "a"."num_tweets",
    "a"."num_following",
    "a"."num_followers",
    "a"."num_likes"
   FROM ("public"."all_account" "a"
     JOIN "public"."archive_upload" "au" ON ((("a"."account_id" = "au"."account_id") AND ("au"."id" = ( SELECT "max"("archive_upload"."id") AS "max"
           FROM "public"."archive_upload"
          WHERE (("archive_upload"."account_id" = "a"."account_id") AND ("archive_upload"."upload_phase" = 'completed'::"public"."upload_phase_enum")))))));
ALTER TABLE "public"."account" OWNER TO "postgres";

-- public.profile (needed by functions used in matviews)
CREATE OR REPLACE VIEW "public"."profile" AS
 SELECT "p"."account_id",
    "p"."bio",
    "p"."website",
    "p"."location",
    "p"."avatar_media_url",
    "p"."header_media_url",
    "p"."archive_upload_id"
   FROM ("public"."all_profile" "p"
     JOIN "public"."archive_upload" "au" ON ((("p"."account_id" = "au"."account_id") AND ("au"."id" = ( SELECT "max"("archive_upload"."id") AS "max"
           FROM "public"."archive_upload"
          WHERE ("archive_upload"."account_id" = "p"."account_id"))))));
ALTER TABLE "public"."profile" OWNER TO "postgres";
