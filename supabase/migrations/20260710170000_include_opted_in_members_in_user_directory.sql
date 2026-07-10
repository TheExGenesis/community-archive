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
    oi.id IS NOT NULL AS is_opted_in,
    oi.opted_in_at,
    LEAST(
      au.created_at,
      COALESCE(oi.opted_in_at, oi.created_at, au.created_at)
    ) AS joined_at
  FROM public.account a
  LEFT JOIN public.profile p ON a.account_id = p.account_id
  JOIN public.archive_upload au ON a.account_id = au.account_id
    AND au.id = (
      SELECT max(au2.id) FROM public.archive_upload au2
      WHERE au2.account_id = a.account_id
      AND au2.upload_phase = 'completed'
    )
  LEFT JOIN LATERAL (
    SELECT o.id, o.created_at, o.opted_in_at
    FROM public.optin o
    WHERE o.opted_in = true
      AND (
        o.twitter_user_id = a.account_id
        OR lower(o.username) = lower(a.username)
      )
    ORDER BY
      (o.twitter_user_id = a.account_id) DESC NULLS LAST,
      o.opted_in_at DESC NULLS LAST,
      o.created_at DESC NULLS LAST
    LIMIT 1
  ) oi ON true
),
opted_in_members AS (
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
)
SELECT * FROM archived_members
UNION ALL
SELECT * FROM opted_in_members;

GRANT SELECT ON TABLE "public"."user_directory" TO "readclient";
