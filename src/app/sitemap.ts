import type { MetadataRoute } from 'next'
import { createPublicReadClient } from '@/lib/publicDataSource'
import { buildSitemap } from '@/lib/sitemap'

// Rendered per request and uncached so membership and opt-out changes reach
// crawlers immediately. A failed membership read surfaces as a 5xx, which
// crawlers retry, rather than as a sitemap that silently drops every profile.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap(createPublicReadClient())
}
