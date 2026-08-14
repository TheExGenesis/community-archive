import 'server-only'

type DigestPostHogEvent =
  | {
      event: 'digest_generation_requested'
      properties: {
        source: 'admin_past_day' | 'admin_rolling_window'
        candidate_count: number
        days_ago: number
      }
    }
  | {
      event: 'digest_page_created'
      properties: {
        source: 'generated'
        status: 'draft'
        story_count: number
        editorial_warning_count: number
      }
    }

export async function captureDigestPostHogEvent(
  distinctId: string,
  input: DigestPostHogEvent,
  fetchImpl: typeof fetch = fetch,
) {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (!apiKey || !host) return false

  try {
    const response = await fetchImpl(`${host.replace(/\/$/, '')}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event: input.event,
        properties: {
          distinct_id: distinctId,
          $geoip_disable: true,
          ...input.properties,
        },
      }),
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) {
      console.warn('[daily digest] PostHog capture failed:', response.status)
      return false
    }
    return true
  } catch (error) {
    console.warn('[daily digest] PostHog capture failed:', error)
    return false
  }
}
