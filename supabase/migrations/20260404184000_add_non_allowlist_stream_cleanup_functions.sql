-- Backfilled from prod's supabase_migrations.schema_migrations table.
-- Originally applied directly via Supabase SQL editor on 2026-04-04 (per the
-- version timestamp), not via this repo. Captured here so staging's db reset
-- gets these objects too. All statements are idempotent (CREATE OR REPLACE /
-- IF NOT EXISTS / wrapped DO blocks) so re-applying to prod is a no-op.
--
-- version:        20260404184000
-- name:           add_non_allowlist_stream_cleanup_functions
-- statements:     12

-- statement 1/12
CREATE OR REPLACE FUNCTION "public"."get_non_allowlist_streamed_tweet_candidates"("p_limit" integer DEFAULT 500) RETURNS TABLE("tweet_id" text, "account_id" text, "created_at" timestamp with time zone, "reply_to_tweet_id" text, "is_quote" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "statement_timeout" TO '10min'
    AS $$
    WITH allowed_accounts AS (
        SELECT a.account_id
        FROM public.account AS a

        UNION

        SELECT o.twitter_user_id AS account_id
        FROM public.optin AS o
        WHERE o.opted_in IS TRUE
          AND o.explicit_optout IS NOT TRUE
          AND o.twitter_user_id IS NOT NULL

        UNION

        SELECT a.account_id
        FROM public.optin AS o
        JOIN public.all_account AS a
          ON lower(a.username) = lower(o.username)
        WHERE o.opted_in IS TRUE
          AND o.explicit_optout IS NOT TRUE
    ),
    streamed_non_allowlist_tweets AS (
        SELECT
            t.tweet_id,
            t.account_id,
            t.created_at,
            t.reply_to_tweet_id
        FROM public.tweets AS t
        LEFT JOIN allowed_accounts AS aa
          ON aa.account_id = t.account_id
        WHERE t.archive_upload_id IS NULL
          AND aa.account_id IS NULL
    ),
    preserved_replies AS (
        SELECT DISTINCT t.tweet_id
        FROM streamed_non_allowlist_tweets AS t
        JOIN public.tweets AS replied_to_tweet
          ON replied_to_tweet.tweet_id = t.reply_to_tweet_id
        JOIN allowed_accounts AS aa
          ON aa.account_id = replied_to_tweet.account_id
    ),
    preserved_quotes AS (
        SELECT DISTINCT t.tweet_id
        FROM streamed_non_allowlist_tweets AS t
        JOIN public.quote_tweets AS qt
          ON qt.tweet_id = t.tweet_id
        JOIN public.tweets AS quoted_tweet
          ON quoted_tweet.tweet_id = qt.quoted_tweet_id
        JOIN allowed_accounts AS aa
          ON aa.account_id = quoted_tweet.account_id
    ),
    ordered_candidates AS (
        SELECT
            t.tweet_id,
            t.account_id,
            t.created_at,
            t.reply_to_tweet_id,
            EXISTS (
                SELECT 1
                FROM public.quote_tweets AS qt
                WHERE qt.tweet_id = t.tweet_id
            ) AS is_quote,
            row_number() OVER (
                ORDER BY t.created_at NULLS LAST, t.tweet_id
            ) AS row_num
        FROM streamed_non_allowlist_tweets AS t
        LEFT JOIN preserved_replies AS pr
          ON pr.tweet_id = t.tweet_id
        LEFT JOIN preserved_quotes AS pq
          ON pq.tweet_id = t.tweet_id
        WHERE pr.tweet_id IS NULL
          AND pq.tweet_id IS NULL
    )
    SELECT
        oc.tweet_id,
        oc.account_id,
        oc.created_at,
        oc.reply_to_tweet_id,
        oc.is_quote
    FROM ordered_candidates AS oc
    WHERE p_limit IS NULL OR oc.row_num <= p_limit
    ORDER BY oc.row_num;
$$;

-- statement 2/12
ALTER FUNCTION "public"."get_non_allowlist_streamed_tweet_candidates"("p_limit" integer) OWNER TO "postgres";

-- statement 3/12
CREATE OR REPLACE FUNCTION "public"."delete_non_allowlist_streamed_tweet_batch"("p_limit" integer DEFAULT 500) RETURNS TABLE("requested_tweets" integer, "deleted_tweets" integer, "deleted_conversations" integer, "deleted_tweet_media" integer, "deleted_user_mentions" integer, "deleted_tweet_urls" integer, "deleted_private_tweet_user" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "statement_timeout" TO '10min'
    AS $$
DECLARE
    v_tweet_ids text[];
    v_requested_count integer := 0;
BEGIN
    IF p_limit IS NULL OR p_limit <= 0 THEN
        RAISE EXCEPTION 'p_limit must be a positive integer';
    END IF;

    SELECT COALESCE(array_agg(candidate.tweet_id), ARRAY[]::text[])
    INTO v_tweet_ids
    FROM public.get_non_allowlist_streamed_tweet_candidates(p_limit) AS candidate;

    v_requested_count := COALESCE(array_length(v_tweet_ids, 1), 0);

    IF v_requested_count = 0 THEN
        RETURN QUERY
        SELECT 0, 0, 0, 0, 0, 0, 0;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        v_requested_count,
        deleted.deleted_tweets,
        deleted.deleted_conversations,
        deleted.deleted_tweet_media,
        deleted.deleted_user_mentions,
        deleted.deleted_tweet_urls,
        deleted.deleted_private_tweet_user
    FROM public.delete_tweets(v_tweet_ids) AS deleted;
END;
$$;

-- statement 4/12
ALTER FUNCTION "public"."delete_non_allowlist_streamed_tweet_batch"("p_limit" integer) OWNER TO "postgres";

-- statement 5/12
REVOKE ALL ON FUNCTION "public"."get_non_allowlist_streamed_tweet_candidates"("p_limit" integer) FROM PUBLIC;

-- statement 6/12
REVOKE ALL ON FUNCTION "public"."get_non_allowlist_streamed_tweet_candidates"("p_limit" integer) FROM "anon";

-- statement 7/12
REVOKE ALL ON FUNCTION "public"."get_non_allowlist_streamed_tweet_candidates"("p_limit" integer) FROM "authenticated";

-- statement 8/12
GRANT ALL ON FUNCTION "public"."get_non_allowlist_streamed_tweet_candidates"("p_limit" integer) TO "service_role";

-- statement 9/12
REVOKE ALL ON FUNCTION "public"."delete_non_allowlist_streamed_tweet_batch"("p_limit" integer) FROM PUBLIC;

-- statement 10/12
REVOKE ALL ON FUNCTION "public"."delete_non_allowlist_streamed_tweet_batch"("p_limit" integer) FROM "anon";

-- statement 11/12
REVOKE ALL ON FUNCTION "public"."delete_non_allowlist_streamed_tweet_batch"("p_limit" integer) FROM "authenticated";

-- statement 12/12
GRANT ALL ON FUNCTION "public"."delete_non_allowlist_streamed_tweet_batch"("p_limit" integer) TO "service_role";
