-- Materialized views used by reporting and views

-- public.account_activity_summary
CREATE MATERIALIZED VIEW "public"."account_activity_summary" AS
 WITH "account_mentions" AS (
         SELECT "t"."account_id",
            "um"."mentioned_user_id",
            "count"(*) AS "mention_count"
           FROM ("public"."tweets" "t"
             JOIN "public"."user_mentions" "um" ON (("t"."tweet_id" = "um"."tweet_id")))
          GROUP BY "t"."account_id", "um"."mentioned_user_id"
        ), "ranked_tweets" AS (
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
            "tweets"."updated_at",
            "row_number"() OVER (PARTITION BY "tweets"."account_id" ORDER BY ("tweets"."retweet_count" + "tweets"."favorite_count") DESC) AS "engagement_rank"
           FROM "public"."tweets"
        ), "top_tweets" AS (
         SELECT "ranked_tweets"."account_id",
            "json_agg"("json_build_object"('tweet_id', "ranked_tweets"."tweet_id", 'account_id', "ranked_tweets"."account_id", 'created_at', "ranked_tweets"."created_at", 'full_text', "ranked_tweets"."full_text", 'retweet_count', "ranked_tweets"."retweet_count", 'favorite_count', "ranked_tweets"."favorite_count", 'reply_to_tweet_id', "ranked_tweets"."reply_to_tweet_id", 'reply_to_user_id', "ranked_tweets"."reply_to_user_id", 'reply_to_username', "ranked_tweets"."reply_to_username", 'archive_upload_id', "ranked_tweets"."archive_upload_id", 'engagement_score', ("ranked_tweets"."retweet_count" + "ranked_tweets"."favorite_count"))) FILTER (WHERE ("ranked_tweets"."engagement_rank" <= 100)) AS "top_engaged_tweets"
           FROM "ranked_tweets"
          GROUP BY "ranked_tweets"."account_id"
        ), "mentioned_accounts" AS (
         SELECT "am"."account_id",
            "json_agg"("json_build_object"('user_id', "am"."mentioned_user_id", 'name', "mu"."name", 'screen_name', "mu"."screen_name", 'mention_count', "am"."mention_count") ORDER BY "am"."mention_count" DESC) FILTER (WHERE (("am"."mention_count" > 0) AND ("am"."mention_rank" <= 20))) AS "mentioned_accounts"
           FROM (( SELECT "account_mentions"."account_id",
                    "account_mentions"."mentioned_user_id",
                    "account_mentions"."mention_count",
                    "row_number"() OVER (PARTITION BY "account_mentions"."account_id" ORDER BY "account_mentions"."mention_count" DESC) AS "mention_rank"
                   FROM "account_mentions") "am"
             LEFT JOIN "public"."mentioned_users" "mu" ON (("mu"."user_id" = "am"."mentioned_user_id")))
          GROUP BY "am"."account_id"
        )
 SELECT "a"."account_id",
    "a"."username",
    "a"."num_tweets",
    "a"."num_followers",
    COALESCE(( SELECT "count"(*) AS "count"
           FROM "public"."likes" "l"
          WHERE ("l"."account_id" = "a"."account_id")), (0)::bigint) AS "total_likes",
    COALESCE(( SELECT "count"(*) AS "count"
           FROM ("public"."user_mentions" "um"
             JOIN "public"."tweets" "t" ON (("um"."tweet_id" = "t"."tweet_id")))
          WHERE ("t"."account_id" = "a"."account_id")), (0)::bigint) AS "total_mentions",
    COALESCE("ma"."mentioned_accounts", '[]'::"json") AS "mentioned_accounts",
    COALESCE("tt"."top_engaged_tweets", '[]'::"json") AS "most_favorited_tweets",
    COALESCE("tt"."top_engaged_tweets", '[]'::"json") AS "most_retweeted_tweets",
    COALESCE("tt"."top_engaged_tweets", '[]'::"json") AS "top_engaged_tweets",
    CURRENT_TIMESTAMP AS "last_updated"
   FROM (("public"."account" "a"
     LEFT JOIN "mentioned_accounts" "ma" ON (("ma"."account_id" = "a"."account_id")))
     LEFT JOIN "top_tweets" "tt" ON (("tt"."account_id" = "a"."account_id")))
  WITH NO DATA;
ALTER TABLE "public"."account_activity_summary" OWNER TO "postgres";

-- public.global_activity_summary
CREATE MATERIALIZED VIEW "public"."global_activity_summary" AS
 SELECT ( SELECT "count"(*) AS "count"
           FROM "public"."account") AS "total_accounts",
    ( SELECT ("c"."reltuples")::bigint AS "estimate"
           FROM ("pg_class" "c"
             JOIN "pg_namespace" "n" ON (("n"."oid" = "c"."relnamespace")))
          WHERE (("c"."relname" = 'tweets'::"name") AND ("n"."nspname" = 'public'::"name"))) AS "total_tweets",
    ( SELECT ("c"."reltuples")::bigint AS "estimate"
           FROM ("pg_class" "c"
             JOIN "pg_namespace" "n" ON (("n"."oid" = "c"."relnamespace")))
          WHERE (("c"."relname" = 'liked_tweets'::"name") AND ("n"."nspname" = 'public'::"name"))) AS "total_likes",
    ( SELECT ("c"."reltuples")::bigint AS "estimate"
           FROM ("pg_class" "c"
             JOIN "pg_namespace" "n" ON (("n"."oid" = "c"."relnamespace")))
          WHERE (("c"."relname" = 'user_mentions'::"name") AND ("n"."nspname" = 'public'::"name"))) AS "total_user_mentions",
    ( SELECT "json_agg"("row_to_json"("t".*)) AS "json_agg"
           FROM ( SELECT "get_top_mentioned_users"."user_id",
                    "get_top_mentioned_users"."name",
                    "get_top_mentioned_users"."screen_name",
                    "get_top_mentioned_users"."mention_count"
                   FROM "public"."get_top_mentioned_users"(30) "get_top_mentioned_users"("user_id", "name", "screen_name", "mention_count")) "t") AS "top_mentioned_users",
    ( SELECT "json_agg"("row_to_json"("t".*)) AS "json_agg"
           FROM ( SELECT "get_top_accounts_with_followers"."account_id",
                    "get_top_accounts_with_followers"."created_via",
                    "get_top_accounts_with_followers"."username",
                    "get_top_accounts_with_followers"."created_at",
                    "get_top_accounts_with_followers"."account_display_name",
                    "get_top_accounts_with_followers"."avatar_media_url",
                    "get_top_accounts_with_followers"."bio",
                    "get_top_accounts_with_followers"."website",
                    "get_top_accounts_with_followers"."location",
                    "get_top_accounts_with_followers"."header_media_url",
                    "get_top_accounts_with_followers"."num_followers",
                    "get_top_accounts_with_followers"."num_tweets"
                   FROM "public"."get_top_accounts_with_followers"(10) "get_top_accounts_with_followers"("account_id", "created_via", "username", "created_at", "account_display_name", "avatar_media_url", "bio", "website", "location", "header_media_url", "num_followers", "num_tweets")) "t") AS "top_accounts_with_followers",
    CURRENT_TIMESTAMP AS "last_updated"
  WITH NO DATA;
ALTER TABLE "public"."global_activity_summary" OWNER TO "postgres";

-- public.monthly_tweet_counts_mv
CREATE MATERIALIZED VIEW "public"."monthly_tweet_counts_mv" AS
 SELECT "date_trunc"('month'::"text", "tweets"."created_at") AS "month",
    "tweets"."account_id",
    "count"(*) AS "tweet_count",
    "count"(DISTINCT "date"("tweets"."created_at")) AS "days_active",
    ("avg"("tweets"."favorite_count"))::numeric(10,2) AS "avg_favorites",
    ("avg"("tweets"."retweet_count"))::numeric(10,2) AS "avg_retweets",
    "max"("tweets"."favorite_count") AS "max_favorites",
    "max"("tweets"."retweet_count") AS "max_retweets"
   FROM "public"."tweets"
  WHERE ("tweets"."created_at" IS NOT NULL)
  GROUP BY ("date_trunc"('month'::"text", "tweets"."created_at")), "tweets"."account_id"
  WITH NO DATA;
ALTER TABLE "public"."monthly_tweet_counts_mv" OWNER TO "postgres";

