'use client'

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next'
import { sanitizeAnalyticsUrl } from '@/lib/analyticsRoutes'

// Counts page views for every visitor, signed in or not, without cookies or a
// visitor identity. PostHog stays limited to signed-in product use.
// The address is reduced to its route template first, so it never carries
// search text, usernames, tweet IDs or OAuth codes.
export function vercelAnalyticsBeforeSend(
  event: BeforeSendEvent,
): BeforeSendEvent | null {
  if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1')
    return null
  const url = sanitizeAnalyticsUrl(event.url)
  return typeof url === 'string' ? { ...event, url } : null
}

export default function VercelAnalytics() {
  return <Analytics beforeSend={vercelAnalyticsBeforeSend} />
}
