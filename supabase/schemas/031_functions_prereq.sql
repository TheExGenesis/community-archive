-- Functions required by materialized views

-- public.get_top_accounts_with_followers(integer)
CREATE OR REPLACE FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) RETURNS TABLE("account_id" "text", "created_via" "text", "username" "text", "created_at" timestamp with time zone, "account_display_name" "text", "avatar_media_url" "text", "bio" "text", "website" "text", "location" "text", "header_media_url" "text", "num_followers" integer, "num_tweets" integer)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.account_id,
        a.created_via,
        a.username,
        a.created_at,
        a.account_display_name,
        p.avatar_media_url,
        p.bio,
        p.website,
        p.location,
        p.header_media_url,
        a.num_followers,
        a.num_tweets
    FROM 
        public.account a
    LEFT JOIN 
        public.profile p ON a.account_id = p.account_id
    WHERE 
        p.archive_upload_id = (
            SELECT MAX(p2.archive_upload_id)
            FROM public.profile p2
            WHERE p2.account_id = a.account_id
        )
    ORDER BY 
        a.num_followers DESC
    LIMIT 
        limit_count;
END; 
$$;
ALTER FUNCTION "public"."get_top_accounts_with_followers"("limit_count" integer) OWNER TO "postgres";

-- public.get_top_mentioned_users(integer)
CREATE OR REPLACE FUNCTION "public"."get_top_mentioned_users"("limit_" integer) RETURNS TABLE("user_id" "text", "name" "text", "screen_name" "text", "mention_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    WITH TopMentionedUsers AS (
        SELECT
            um.mentioned_user_id,
            COUNT(*) AS mention_count
        FROM
            public.user_mentions um
        WHERE
            um.mentioned_user_id <> '-1'
        GROUP BY
            um.mentioned_user_id
        ORDER BY
            mention_count DESC
        LIMIT
            limit_
    )
    SELECT
        t.mentioned_user_id as user_id,
        mu.name,
        mu.screen_name,
        t.mention_count
    FROM
        TopMentionedUsers t
        JOIN public.mentioned_users mu ON t.mentioned_user_id = mu.user_id
        LEFT JOIN public.profile u ON t.mentioned_user_id = u.account_id
    ORDER BY
        t.mention_count DESC;
END;
$$;
ALTER FUNCTION "public"."get_top_mentioned_users"("limit_" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.policy_account_is_blocked(
  p_account_id text DEFAULT NULL,
  p_username text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tes.blocked_scraping_users AS blocked
    WHERE (
      NULLIF(BTRIM(p_account_id), '') IS NOT NULL
      AND blocked.account_id = BTRIM(p_account_id)
    ) OR (
      NULLIF(BTRIM(p_username), '') IS NOT NULL
      AND lower(blocked.username) = lower(BTRIM(p_username))
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.optin AS consent
    WHERE consent.explicit_optout IS TRUE
      AND (
        (
          NULLIF(BTRIM(p_account_id), '') IS NOT NULL
          AND consent.twitter_user_id = BTRIM(p_account_id)
        ) OR (
          NULLIF(BTRIM(p_username), '') IS NOT NULL
          AND lower(consent.username) = lower(BTRIM(p_username))
        )
      )
  );
$$;

ALTER FUNCTION public.policy_account_is_blocked(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.policy_account_is_blocked(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.policy_account_is_blocked(text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.policy_blocked_account_id(p_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT candidate.account_id
  FROM (
    SELECT consent.twitter_user_id AS account_id, 1 AS priority
    FROM public.optin AS consent
    WHERE consent.explicit_optout IS TRUE
      AND lower(consent.username) = lower(BTRIM(p_username))
      AND NULLIF(BTRIM(consent.twitter_user_id), '') IS NOT NULL

    UNION ALL

    SELECT blocked.account_id, 2 AS priority
    FROM tes.blocked_scraping_users AS blocked
    WHERE lower(blocked.username) = lower(BTRIM(p_username))

    UNION ALL

    SELECT account.account_id, 3 AS priority
    FROM public.all_account AS account
    JOIN tes.blocked_scraping_users AS blocked
      ON blocked.account_id = account.account_id
    WHERE lower(account.username) = lower(BTRIM(p_username))
  ) AS candidate
  ORDER BY candidate.priority
  LIMIT 1;
$$;

ALTER FUNCTION public.policy_blocked_account_id(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.policy_blocked_account_id(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.policy_blocked_account_id(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.lock_policy_account(p_account_id text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_advisory_xact_lock(
    hashtextextended('community-archive-policy:' || COALESCE(p_account_id, ''), 0)
  );
$$;

ALTER FUNCTION public.lock_policy_account(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.lock_policy_account(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_policy_account(text) TO service_role;

CREATE OR REPLACE FUNCTION public.archive_upload_is_allowed(
  p_account_id text,
  p_username text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NULLIF(BTRIM(p_account_id), '') IS NOT NULL
     AND NULLIF(BTRIM(p_username), '') IS NOT NULL
     AND public.policy_account_is_blocked(p_account_id, p_username) IS NOT TRUE;
$$;

ALTER FUNCTION public.archive_upload_is_allowed(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.archive_upload_is_allowed(text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_archive_upload_allowed(
  p_account_id text,
  p_username text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_provider_id text := auth.jwt()->'app_metadata'->>'provider_id';
  v_username text := auth.jwt()->'app_metadata'->>'user_name';
BEGIN
  IF session_user <> 'postgres'
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND (
    NULLIF(BTRIM(v_provider_id), '') IS NULL
    OR v_provider_id <> p_account_id
    OR NULLIF(BTRIM(v_username), '') IS NULL
    OR lower(v_username) <> lower(p_username)
  ) THEN
    RAISE EXCEPTION 'archive identity does not match the authenticated account'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.archive_upload_is_allowed(p_account_id, p_username) THEN
    RAISE EXCEPTION 'archive owner is blocked by current policy'
      USING ERRCODE = '42501';
  END IF;

  RETURN true;
END;
$$;

ALTER FUNCTION public.assert_archive_upload_allowed(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assert_archive_upload_allowed(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_archive_upload_allowed(text, text)
  TO authenticated, service_role;

