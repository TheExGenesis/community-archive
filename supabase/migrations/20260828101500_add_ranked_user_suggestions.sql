-- This index should be prebuilt with CREATE INDEX CONCURRENTLY in production.
-- The IF NOT EXISTS statement then records the schema contract without a rebuild.
CREATE INDEX IF NOT EXISTS "idx_all_account_display_name_trgm"
  ON "public"."all_account" USING "gin"
  ("account_display_name" "public"."gin_trgm_ops");

CREATE OR REPLACE FUNCTION "public"."search_user_suggestions"(
  "search_text" text,
  "result_limit" integer DEFAULT 30
)
RETURNS TABLE (
  "account_id" text,
  "username" text,
  "account_display_name" text,
  "num_followers" integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH input AS (
    SELECT lower(trim(leading '@' FROM trim(search_text))) AS term
  )
  SELECT
    account.account_id,
    account.username,
    account.account_display_name,
    account.num_followers
  FROM public.all_account AS account
  CROSS JOIN input
  WHERE length(input.term) BETWEEN 2 AND 50
    AND account.is_tombstone IS NOT TRUE
    AND (
      (length(input.term) = 2 AND lower(account.username) = input.term)
      OR (
        length(input.term) >= 3
        AND (
          account.username ILIKE '%' || input.term || '%'
          OR account.account_display_name ILIKE '%' || input.term || '%'
          OR account.username OPERATOR(public.%) input.term
          OR account.account_display_name OPERATOR(public.%) input.term
        )
      )
    )
  ORDER BY
    CASE
      WHEN lower(account.username) = input.term THEN 0
      WHEN lower(account.username) LIKE input.term || '%' THEN 1
      WHEN lower(account.account_display_name) = input.term THEN 2
      WHEN lower(account.account_display_name) LIKE input.term || '%' THEN 3
      WHEN lower(account.username) LIKE '%' || input.term || '%' THEN 4
      WHEN lower(account.account_display_name) LIKE '%' || input.term || '%' THEN 5
      ELSE 6
    END,
    greatest(
      public.similarity(lower(account.username), input.term),
      public.similarity(lower(account.account_display_name), input.term)
    ) DESC,
    account.num_followers DESC NULLS LAST,
    lower(account.username),
    account.account_id
  LIMIT least(greatest(coalesce(result_limit, 30), 1), 60);
$$;

ALTER FUNCTION "public"."search_user_suggestions"(text, integer)
  OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."search_user_suggestions"(text, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."search_user_suggestions"(text, integer)
  TO "anon", "authenticated", "readclient", "service_role";
