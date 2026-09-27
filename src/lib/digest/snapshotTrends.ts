import { fetchPortalWeeklyTrends } from '@/lib/portal/analytics'
import { parseDigestTrendSnapshot, selectDigestTopTerms } from './trends'
import type { DigestEditionContent } from './types'

/** Shared by the standalone nightly publisher and website publication paths. */
export async function snapshotDigestTrends(
  content: DigestEditionContent,
): Promise<DigestEditionContent> {
  if (parseDigestTrendSnapshot(content.trends, content.digestDate))
    return content

  // This endpoint only serves the latest week. Never put today's trends on an
  // older edition; historical reconstruction requires a separate dated source.
  if (content.digestDate !== new Date().toISOString().slice(0, 10))
    return content

  const trends = selectDigestTopTerms(
    await fetchPortalWeeklyTrends(),
    content.digestDate,
  )
  if (!trends) {
    throw new Error(
      'A date-matched rising and falling trend snapshot is unavailable',
    )
  }
  return { ...content, trends }
}
