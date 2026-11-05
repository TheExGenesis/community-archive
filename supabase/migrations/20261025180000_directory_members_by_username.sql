-- Resolve current directory members for a bounded list of handles. Same
-- membership, account, and avatar semantics as public.user_directory, but every
-- lookup is index-driven instead of rebuilding the full opted-in branch. Reads
-- stay live: membership and opt-out decisions are never cached.
-- SECURITY INVOKER keeps the caller's RLS, exactly as with the view.
CREATE OR REPLACE FUNCTION public.directory_members_by_username(
  p_usernames text[]
)
RETURNS TABLE (
  account_id text,
  username text,
  has_archive boolean,
  avatar_media_url text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH names AS (
    SELECT DISTINCT lower(name) AS name
    FROM unnest(p_usernames[1:1000]) AS name
  ),
  archived AS (
    SELECT a.account_id, a.username
    FROM public.all_account a
    WHERE EXISTS (
        SELECT 1 FROM public.archive_upload u
        WHERE u.account_id = a.account_id AND u.upload_phase = 'completed'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.optin blocked
        WHERE blocked.explicit_optout IS TRUE
          AND blocked.twitter_user_id = a.account_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.optin blocked
        WHERE blocked.explicit_optout IS TRUE
          AND lower(blocked.username) = lower(a.username)
      )
  ),
  matched_optins AS (
    SELECT o.id, o.twitter_user_id
    FROM names
    JOIN public.optin o ON o.opted_in = true AND lower(o.username) = names.name
  ),
  opted_in AS (
    SELECT DISTINCT ON (COALESCE(c.account_id, 'username:' || lower(c.username)))
      c.account_id, c.username
    FROM (
      SELECT
        COALESCE(a.account_id, o.twitter_user_id) AS account_id,
        o.username,
        o.id,
        COALESCE(o.opted_in_at, o.created_at, o.updated_at) AS joined_at
      FROM public.optin o
      LEFT JOIN public.all_account a
        ON o.twitter_user_id IS NOT NULL AND a.account_id = o.twitter_user_id
      WHERE o.opted_in = true
        AND o.explicit_optout IS NOT TRUE
        AND (
          o.id IN (SELECT id FROM matched_optins)
          OR o.twitter_user_id IN (SELECT twitter_user_id FROM matched_optins)
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.optin blocked
          WHERE blocked.explicit_optout IS TRUE
            AND o.twitter_user_id IS NOT NULL
            AND blocked.twitter_user_id = o.twitter_user_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.optin blocked
          WHERE blocked.explicit_optout IS TRUE
            AND lower(blocked.username) = lower(o.username)
        )
        AND NOT EXISTS (
          SELECT 1 FROM archived m
          WHERE (o.twitter_user_id IS NOT NULL AND m.account_id = o.twitter_user_id)
            OR lower(m.username) = lower(o.username)
        )
    ) c
    ORDER BY
      COALESCE(c.account_id, 'username:' || lower(c.username)),
      c.joined_at ASC NULLS LAST,
      'optin:' || c.id::text
  )
  SELECT m.account_id, m.username, true AS has_archive, p.avatar_media_url
  FROM names
  JOIN archived m ON lower(m.username) = names.name
  LEFT JOIN public.all_profile p ON p.account_id = m.account_id
  UNION ALL
  SELECT o.account_id, o.username, false AS has_archive, p.avatar_media_url
  FROM opted_in o
  LEFT JOIN public.all_profile p ON p.account_id = o.account_id
  WHERE lower(o.username) IN (SELECT name FROM names);
$$;

ALTER FUNCTION public.directory_members_by_username(text[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.directory_members_by_username(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.directory_members_by_username(text[])
  TO anon, authenticated, service_role;
