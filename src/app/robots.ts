import { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/sitemap'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/docs', '/llms.txt', '/openapi.json', '/api/reference'],
        disallow: ['/tweets/', '/api/'],
      },
      {
        // Parallel's index crawler drives headless Chrome through /login,
        // /search and archive pages with their assets (72K requests on
        // 2026-11-08). It honors robots.txt; the firewall also redirects its
        // page requests to /llms.txt.
        userAgent: 'ShapBot',
        allow: ['/docs', '/llms.txt'],
        disallow: ['/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
