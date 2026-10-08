import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/database-types'
import { buildSitemap } from '@/lib/sitemap'

// Rendered per request and uncached so membership and opt-out changes reach
// crawlers immediately. A failed membership read surfaces as a 5xx, which
// crawlers retry, rather than as a sitemap that silently drops every profile.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const useLocalDb =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB !== 'true'
  const supabase = createClient<Database>(
    useLocalDb
      ? process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL!
      : process.env.NEXT_PUBLIC_SUPABASE_URL!,
    useLocalDb
      ? process.env.NEXT_PUBLIC_LOCAL_ANON_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  )
  return buildSitemap(supabase)
}
