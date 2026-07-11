-- Avoid a case-insensitive scan of the full all_account table for every
-- opted-in member. New opt-ins receive a trusted Twitter user ID from auth;
-- legacy rows without one remain visible but are not enriched from all_account.
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
  LEFT JOIN public.all_account a
    ON o.twitter_user_id IS NOT NULL
    AND a.account_id = o.twitter_user_id
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

GRANT SELECT ON TABLE "public"."user_directory" TO "readclient";
