import type postgres from 'postgres'

/**
 * The account's current Twitter handle from data the uploading client cannot
 * write: the Twitter/X OAuth identity (the same source and key order as
 * public.sync_meta_data()), or app_metadata for an auth user that has no such
 * identity, such as a staging dev-login user created by the service role.
 *
 * public.all_account.username is not used: the first upload's account row is
 * only written by the archive being processed, and its username comes from
 * the archive file.
 */
export async function lookupTrustedArchiveOwner(
  sql: postgres.Sql,
  accountId: string,
): Promise<string | null> {
  const [row] = await sql`
    SELECT candidate.handle
    FROM (
      SELECT
        COALESCE(
          NULLIF(i.identity_data->>'user_name', ''),
          NULLIF(i.identity_data->>'preferred_username', '')
        ) AS handle,
        0 AS source_rank,
        i.created_at,
        i.id::text AS tie_breaker
      FROM auth.identities AS i
      WHERE i.provider IN ('twitter', 'x')
        AND i.provider_id = ${accountId}
      UNION ALL
      SELECT
        NULLIF(u.raw_app_meta_data->>'user_name', '') AS handle,
        1 AS source_rank,
        u.created_at,
        u.id::text AS tie_breaker
      FROM auth.users AS u
      WHERE u.raw_app_meta_data->>'provider_id' = ${accountId}
        AND NOT EXISTS (
          SELECT 1
          FROM auth.identities AS own
          WHERE own.user_id = u.id
            AND own.provider IN ('twitter', 'x')
        )
    ) AS candidate
    WHERE candidate.handle IS NOT NULL
    ORDER BY candidate.source_rank, candidate.created_at, candidate.tie_breaker
    LIMIT 1
  `
  const handle = row?.handle
  return typeof handle === 'string' ? handle : null
}
