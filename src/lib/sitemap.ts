import type { MetadataRoute } from 'next'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/database-types'
import { userProfileHref } from '@/lib/navigation'

export const SITE_URL = 'https://www.community-archive.org'

// Public pages that render without a session. Member-only routes redirect to
// sign-in and are left out, as are tweet permalinks, which robots.txt
// disallows.
const PUBLIC_STATIC_PATHS = [
  '/',
  '/about',
  '/docs',
  '/community',
  '/search',
  '/user-dir',
  '/bangers',
  '/digest',
  '/strands',
  '/stream',
  '/social-graph',
  '/conversation-map',
  '/missing-accounts',
  '/tools',
  '/research',
  '/supporters',
  '/data-policy',
]

// PostgREST caps result sets, so page with a stable order until a short page.
const MEMBER_PAGE_SIZE = 1000

type MemberRow = Pick<
  Database['public']['Views']['user_directory']['Row'],
  'directory_id' | 'account_id' | 'username' | 'archive_uploaded_at'
>

/**
 * List every profile currently eligible for public serving. `user_directory`
 * applies membership and explicit opt-outs live, so an opted-out account
 * leaves the sitemap on the next request.
 */
export async function getMemberProfileEntries(
  supabase: SupabaseClient<Database>,
): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = []
  const seen = new Set<string>()
  for (let offset = 0; ; offset += MEMBER_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('user_directory')
      .select('directory_id, account_id, username, archive_uploaded_at')
      .order('directory_id', { ascending: true })
      .range(offset, offset + MEMBER_PAGE_SIZE - 1)
    if (error) throw error
    const rows: MemberRow[] = data ?? []
    for (const row of rows) {
      const path = userProfileHref(
        row.username,
        row.account_id || row.directory_id,
      )
      if (path === '/user-dir' || seen.has(path)) continue
      seen.add(path)
      entries.push({
        url: `${SITE_URL}${path}`,
        ...(row.archive_uploaded_at
          ? { lastModified: new Date(row.archive_uploaded_at) }
          : {}),
      })
    }
    if (rows.length < MEMBER_PAGE_SIZE) return entries
  }
}

export async function buildSitemap(
  supabase: SupabaseClient<Database>,
): Promise<MetadataRoute.Sitemap> {
  return [
    ...PUBLIC_STATIC_PATHS.map((path) => ({ url: `${SITE_URL}${path}` })),
    ...(await getMemberProfileEntries(supabase)),
  ]
}
