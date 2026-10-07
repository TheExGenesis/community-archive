import { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/sitemap'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/docs', '/llms.txt', '/openapi.json', '/api/reference'],
      disallow: ['/tweets/', '/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
