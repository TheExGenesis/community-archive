import 'server-only'

import type { AnalyticsGatewayFetcher } from '@/lib/clickhouseGateway'
import { searchNewestMatches } from './gateway'
import type { CheckableAlert, MatchedTweetRef } from './store'

/** Distinct searches sent to the gateway per run; the rest wait an hour. */
export const MAX_SEARCHES_PER_RUN = 40
export const SEARCH_TIMEOUT_MS = 10_000
const CONCURRENCY = 4

export interface SearchAlertGroup {
  key: string
  query: string
  mode: CheckableAlert['mode']
  fromUser: string | null
  alerts: CheckableAlert[]
}

/** Identical searches (case-insensitive query, mode, author) share one gateway call. */
export const searchAlertGroupKey = (alert: {
  query: string
  mode: string
  fromUser: string | null
}) =>
  JSON.stringify([
    alert.query.trim().toLowerCase(),
    alert.mode,
    alert.fromUser?.toLowerCase() ?? '',
  ])

/** Groups alerts by search, the least recently checked search first. */
export function groupSearchAlerts(
  alerts: CheckableAlert[],
): SearchAlertGroup[] {
  const groups = new Map<string, SearchAlertGroup>()
  for (const alert of alerts) {
    const key = searchAlertGroupKey(alert)
    const group = groups.get(key) ?? {
      key,
      query: alert.query,
      mode: alert.mode,
      fromUser: alert.fromUser,
      alerts: [],
    }
    group.alerts.push(alert)
    groups.set(key, group)
  }
  const oldest = (group: SearchAlertGroup) =>
    Math.min(...group.alerts.map((a) => Date.parse(a.lastCheckedAt)))
  return Array.from(groups.values()).sort((a, b) => oldest(a) - oldest(b))
}

/** The matches newer than an alert's watermark, newest first. */
export const matchesAfter = (
  tweets: MatchedTweetRef[],
  watermark: string,
): MatchedTweetRef[] => {
  const boundary = Date.parse(watermark)
  return tweets
    .filter((tweet) => Date.parse(tweet.createdAt) > boundary)
    .sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        (BigInt(b.id) > BigInt(a.id) ? 1 : -1),
    )
}

export interface SearchAlertRunDeps {
  listAlerts: () => Promise<CheckableAlert[]>
  record: (input: {
    alertId: string
    expectedCheckedAt: string
    checkedAt: string
    tweets: MatchedTweetRef[]
  }) => Promise<boolean>
  recordFailure: (alertIds: string[], message: string) => Promise<void>
  fetcher?: AnalyticsGatewayFetcher
  now?: () => Date
  maxSearches?: number
}

export interface SearchAlertRunResult {
  alerts: number
  searches: number
  deferredSearches: number
  failedSearches: number
  alertsWithMatches: number
  newMatches: number
  failedAlerts: number
}

async function eachLimited<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
) {
  let next = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next++]
        await run(item)
      }
    },
  )
  await Promise.all(workers)
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * One matching pass: each distinct search hits the gateway once, from the
 * oldest watermark in its group; each alert keeps only tweets newer than its
 * own watermark. A failed search or write leaves those watermarks where they
 * were, so the next run retries the same window.
 */
export async function runSearchAlertChecks(
  deps: SearchAlertRunDeps,
): Promise<SearchAlertRunResult> {
  const now = deps.now ?? (() => new Date())
  const alerts = await deps.listAlerts()
  const groups = groupSearchAlerts(alerts)
  const limit = deps.maxSearches ?? MAX_SEARCHES_PER_RUN
  const batch = groups.slice(0, limit)
  const result: SearchAlertRunResult = {
    alerts: alerts.length,
    searches: batch.length,
    deferredSearches: groups.length - batch.length,
    failedSearches: 0,
    alertsWithMatches: 0,
    newMatches: 0,
    failedAlerts: 0,
  }

  await eachLimited(batch, CONCURRENCY, async (group) => {
    // Taken before the request: a tweet created while it runs is picked up
    // next time rather than skipped.
    const checkedAt = now()
    const since = new Date(
      Math.min(...group.alerts.map((a) => Date.parse(a.lastCheckedAt))),
    )
    let tweets: MatchedTweetRef[]
    try {
      tweets = await searchNewestMatches(group, since, {
        fetcher: deps.fetcher,
        timeoutMs: SEARCH_TIMEOUT_MS,
      })
    } catch (error) {
      result.failedSearches += 1
      result.failedAlerts += group.alerts.length
      console.error('Search alert search failed:', errorMessage(error))
      await deps
        .recordFailure(
          group.alerts.map((a) => a.id),
          errorMessage(error),
        )
        .catch(() => undefined)
      return
    }

    for (const alert of group.alerts) {
      const fresh = matchesAfter(tweets, alert.lastCheckedAt)
      try {
        const recorded = await deps.record({
          alertId: alert.id,
          expectedCheckedAt: alert.lastCheckedAt,
          checkedAt: checkedAt.toISOString(),
          tweets: fresh,
        })
        if (recorded && fresh.length > 0) {
          result.alertsWithMatches += 1
          result.newMatches += fresh.length
        }
      } catch (error) {
        result.failedAlerts += 1
        console.error('Search alert write failed:', errorMessage(error))
      }
    }
  })

  return result
}
