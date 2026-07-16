import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/docs', '/llms.txt', '/openapi.json', '/api/reference'],
      disallow: ['/tweets/', '/api/'],
    },
  }
}
