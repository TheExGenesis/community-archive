-- Views split from prod.sql (no functional changes)

-- public.account moved to 032_views_prereq.sql

-- public.enriched_tweets
CREATE OR REPLACE VIEW "public"."enriched_tweets" AS
 SELECT "t"."tweet_id",
    "t"."account_id",
    "a"."username",
    "a"."account_display_name",
    "t"."created_at",
    "t"."full_text",
    "t"."retweet_count",
    "t"."favorite_count",
    "t"."reply_to_tweet_id",
    "t"."reply_to_user_id",
    "t"."reply_to_username",
    "qt"."quoted_tweet_id",
    "c"."conversation_id",
    "p"."avatar_media_url",
    "t"."archive_upload_id"
   FROM (((("public"."tweets" "t"
     JOIN "public"."all_account" "a" ON (("t"."account_id" = "a"."account_id")))
     LEFT JOIN "public"."conversations" "c" ON (("t"."tweet_id" = "c"."tweet_id")))
     LEFT JOIN "public"."quote_tweets" "qt" ON (("t"."tweet_id" = "qt"."tweet_id")))
     LEFT JOIN LATERAL ( SELECT "all_profile"."avatar_media_url"
           FROM "public"."all_profile"
          WHERE ("all_profile"."account_id" = "t"."account_id")
          ORDER BY "all_profile"."archive_upload_id" DESC
         LIMIT 1) "p" ON (true));
ALTER TABLE "public"."enriched_tweets" OWNER TO "postgres";

-- public.global_monthly_tweet_counts
CREATE OR REPLACE VIEW "public"."global_monthly_tweet_counts" AS
 SELECT "monthly_tweet_counts_mv"."month",
    "sum"("monthly_tweet_counts_mv"."tweet_count") AS "total_tweets",
    "count"(DISTINCT "monthly_tweet_counts_mv"."account_id") AS "active_accounts",
    ("avg"("monthly_tweet_counts_mv"."tweet_count"))::numeric(10,2) AS "avg_tweets_per_account"
   FROM "public"."monthly_tweet_counts_mv"
  GROUP BY "monthly_tweet_counts_mv"."month"
  ORDER BY "monthly_tweet_counts_mv"."month" DESC;
ALTER TABLE "public"."global_monthly_tweet_counts" OWNER TO "postgres";

-- public.profile moved to 032_views_prereq.sql

-- public.tweet_replies_view
CREATE OR REPLACE VIEW "public"."tweet_replies_view" AS
 SELECT "tweets"."reply_to_tweet_id",
    "tweets"."reply_to_user_id"
   FROM "public"."tweets"
  WHERE ("tweets"."reply_to_tweet_id" IS NOT NULL);
ALTER TABLE "public"."tweet_replies_view" OWNER TO "postgres";

-- public.tweets_w_conversation_id
CREATE OR REPLACE VIEW "public"."tweets_w_conversation_id" AS
 SELECT "tweets"."tweet_id",
    "tweets"."account_id",
    "tweets"."created_at",
    "tweets"."full_text",
    "tweets"."retweet_count",
    "tweets"."favorite_count",
    "tweets"."reply_to_tweet_id",
    "tweets"."reply_to_user_id",
    "tweets"."reply_to_username",
    "tweets"."archive_upload_id",
    "tweets"."fts",
    "c"."conversation_id"
   FROM ("public"."tweets"
     LEFT JOIN "public"."conversations" "c" ON (("tweets"."tweet_id" = "c"."tweet_id")));
ALTER TABLE "public"."tweets_w_conversation_id" OWNER TO "postgres";

-- public.user_directory
CREATE OR REPLACE VIEW "public"."user_directory" AS
WITH archived_members AS (
  SELECT
    a.account_id,
    a.username,
    a.account_display_name,
    a.created_at,
    a.num_tweets,
    a.num_followers,
    a.num_following,
    a.num_likes,
    p.bio,
    p.website,
    p.location,
    p.avatar_media_url,
    au.archive_at,
    au.created_at AS archive_uploaded_at,
    'archive:' || a.account_id AS directory_id,
    true AS has_archive,
    oi.is_opted_in IS TRUE AS is_opted_in,
    oi.opted_in_at,
    LEAST(
      au.first_archive_uploaded_at,
      COALESCE(
        oi.opted_in_at,
        oi.created_at,
        au.first_archive_uploaded_at
      )
    ) AS joined_at
  FROM public.account a
  LEFT JOIN public.profile p ON a.account_id = p.account_id
  JOIN LATERAL (
    SELECT
      candidate.*,
      min(candidate.created_at) OVER () AS first_archive_uploaded_at
    FROM public.archive_upload candidate
    WHERE candidate.account_id = a.account_id
      AND candidate.upload_phase = 'completed'
    ORDER BY candidate.id DESC
    LIMIT 1
  ) au ON true
  LEFT JOIN LATERAL (
    SELECT
      bool_or(true) AS is_opted_in,
      min(COALESCE(o.opted_in_at, o.created_at, o.updated_at)) AS opted_in_at,
      min(o.created_at) AS created_at
    FROM public.optin o
    WHERE o.opted_in = true
      AND (
        o.twitter_user_id = a.account_id
        OR lower(o.username) = lower(a.username)
      )
  ) oi ON true
),
opted_in_candidates AS (
  SELECT
    COALESCE(a.account_id, o.twitter_user_id) AS account_id,
    o.username,
    COALESCE(NULLIF(a.account_display_name, ''), o.username) AS account_display_name,
    a.created_at,
    a.num_tweets,
    a.num_followers,
    a.num_following,
    a.num_likes,
    p.bio,
    p.website,
    p.location,
    p.avatar_media_url,
    NULL::timestamp with time zone AS archive_at,
    NULL::timestamp with time zone AS archive_uploaded_at,
    'optin:' || o.id::text AS directory_id,
    false AS has_archive,
    true AS is_opted_in,
    o.opted_in_at,
    COALESCE(o.opted_in_at, o.created_at, o.updated_at) AS joined_at
  FROM public.optin o
  LEFT JOIN LATERAL (
    SELECT candidate.*
    FROM public.all_account candidate
    WHERE (
      o.twitter_user_id IS NOT NULL
      AND candidate.account_id = o.twitter_user_id
    )
      OR lower(candidate.username) = lower(o.username)
    ORDER BY (
      o.twitter_user_id IS NOT NULL
      AND candidate.account_id = o.twitter_user_id
    ) DESC
    LIMIT 1
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT candidate.*
    FROM public.all_profile candidate
    WHERE candidate.account_id = a.account_id
    ORDER BY candidate.archive_upload_id DESC NULLS LAST
    LIMIT 1
  ) p ON true
  WHERE o.opted_in = true
    AND NOT EXISTS (
      SELECT 1
      FROM archived_members archived
      WHERE (
        o.twitter_user_id IS NOT NULL
        AND archived.account_id = o.twitter_user_id
      )
        OR lower(archived.username) = lower(o.username)
    )
),
opted_in_members AS (
  SELECT DISTINCT ON (
    COALESCE(account_id, 'username:' || lower(username))
  )
    *
  FROM opted_in_candidates
  ORDER BY
    COALESCE(account_id, 'username:' || lower(username)),
    joined_at ASC NULLS LAST,
    directory_id
)
SELECT * FROM archived_members
UNION ALL
SELECT * FROM opted_in_members;
ALTER TABLE "public"."user_directory" OWNER TO "postgres";
