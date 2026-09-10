import type {
  PortalTrendSeries,
  TermWeek,
  PortalTweet,
  TrendGranularity,
} from '@/lib/portal/types'
import type {
  TrendEvidenceRange,
  TrendEvidenceSort,
} from '@/lib/portal/trendEvidenceCache'

export interface FeedResponse {
  tweets: PortalTweet[]
  nextOffset: number | null
  error?: string
}

export async function requestTrendSeries(
  terms: string[],
  granularity: TrendGranularity,
): Promise<PortalTrendSeries> {
  const params = new URLSearchParams({ view: 'series', granularity })
  terms.forEach((term) => params.append('q', term))
  const response = await fetch(`/api/portal/trends?${params.toString()}`)
  const body = (await response.json().catch(() => null)) as
    | (PortalTrendSeries & { error?: string })
    | null
  if (!response.ok) {
    throw new Error(body?.error || 'Could not load those trends')
  }
  if (
    !body ||
    body.granularity !== granularity ||
    !Array.isArray(body.buckets) ||
    !Array.isArray(body.series)
  ) {
    throw new Error('The trends service returned an invalid response')
  }
  return body
}

export async function requestTrendEvidence(
  term: string,
  range: TrendEvidenceRange | null,
  sort: TrendEvidenceSort,
  offset: number,
  signal: AbortSignal,
): Promise<FeedResponse> {
  const params = new URLSearchParams({
    view: 'feed',
    include: term,
    offset: String(offset),
    sort,
  })
  if (range) {
    params.set('since', range.since)
    params.set('until', range.until)
  }
  const response = await fetch(`/api/portal/trends?${params.toString()}`, {
    signal,
  })
  const body = (await response.json().catch(() => null)) as FeedResponse | null
  if (!response.ok) {
    throw new Error(body?.error || `Could not load tweets for ${term}`)
  }
  if (
    !body ||
    !Array.isArray(body.tweets) ||
    (body.nextOffset !== undefined &&
      body.nextOffset !== null &&
      !Number.isSafeInteger(body.nextOffset))
  ) {
    throw new Error('The tweet feed returned an invalid response')
  }
  return { tweets: body.tweets, nextOffset: body.nextOffset ?? null }
}

export async function requestDefaultKeywords(): Promise<TermWeek[]> {
  const response = await fetch('/api/portal/trends?view=defaults', {
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null)
  if (
    !response.ok ||
    !body ||
    !Array.isArray(body.weekly) ||
    body.weekly.some(
      (row: TermWeek) =>
        !row || typeof row.term !== 'string' || !row.term.trim(),
    )
  ) {
    throw new Error('The current trending words could not be loaded.')
  }
  return body.weekly
}
