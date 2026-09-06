import 'server-only'

// Mirrors the metadataBase resolution in src/app/layout.tsx. Email links must
// be absolute, and unsubscribe links must keep working long after send, so
// production always uses the canonical host.
export const digestEmailSiteUrl = () =>
  process.env.VERCEL_ENV === 'production'
    ? 'https://www.community-archive.org'
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT ?? 3000}`

export const digestUnsubscribeUrl = (token: string) =>
  `${digestEmailSiteUrl()}/api/digest/email/unsubscribe?token=${encodeURIComponent(token)}`
