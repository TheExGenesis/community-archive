import 'server-only'

import type { AnalyticsGatewayFetcher } from '@/lib/clickhouseGateway'
import { SEARCH_ALERT_PAGE_LIMIT, searchNewestMatches } from './gateway'
import { recordedKey, type CheckableAlert, type MatchedTweetRef } from './store'

/**
 * Each run searches the last week, whatever was seen before: most tweets
 * reach the archive hours or days after they were posted, so a tweet created
 * before the previous check can still be new. The match log decides what is
 * new, and it is kept longer than this (MATCH_LOG_RETENTION_DAYS).
 */
export const SEARCH_ALERT_LOOKBACK_DAYS = 7
/** Pages of 50 read per search while they still hold unseen tweets. */
export const MAX_PAGES_PER_SEARCH = 4
/** Distinct searches sent to the gateway per run; the rest wait an hour. */
export const MAX_SEARCHES_PER_RUN = 40
export const SEARCH_TIMEOUT_MS = 10_000
/** No new search starts after this much of the 300 s function budget. */
export const RUN_DEADLINE_MS = 200_000
const CONCURRENCY = 4
const DAY_MS = 86_400_000

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

/** Tweets an alert may report: created at or after the alert itself. */
export const eligibleFor = (
  tweets: MatchedTweetRef[],
  alert: Pick<CheckableAlert, 'createdAt'>,
): MatchedTweetRef[] => {
  const floor = Date.parse(alert.createdAt)
  return tweets.filter((tweet) => Date.parse(tweet.createdAt) >= floor)
}

export interface SearchAlertRunDeps {
  listAlerts: () => Promise<CheckableAlert[]>
  /** Keys (recordedKey) of the pairs already in the match log. */
  listRecorded: (alertIds: string[], tweetIds: string[]) => Promise<Set<string>>
  /** Inserts unseen tweets; returns how many were new. */
  record: (input: {
    alertId: string
    checkedAt: string
    tweets: MatchedTweetRef[]
  }) => Promise<number>
  recordFailure: (alertIds: string[], message: string) => Promise<void>
  fetcher?: AnalyticsGatewayFetcher
  now?: () => Date
  maxSearches?: number
  deadlineMs?: number
}

export interface SearchAlertRunResult {
  alerts: number
  searches: number
  deferredSearches: number
  pagesRead: number
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
 * Reads newest-first pages of one search over the lookback window until a
 * page holds nothing unseen for any alert in the group, the window ends, or
 * MAX_PAGES_PER_SEARCH is reached. Returns each alert's unseen tweets.
 */
async function collectUnseen(
  group: SearchAlertGroup,
  now: Date,
  deps: SearchAlertRunDeps,
  result: SearchAlertRunResult,
): Promise<Map<string, MatchedTweetRef[]>> {
  const lookbackStart = now.getTime() - SEARCH_ALERT_LOOKBACK_DAYS * DAY_MS
  const newestFloor = Math.min(
    ...group.alerts.map((a) => Date.parse(a.createdAt)),
  )
  const since = new Date(Math.max(lookbackStart, newestFloor))
  const alertIds = group.alerts.map((a) => a.id)
  const unseen = new Map<string, MatchedTweetRef[]>(
    alertIds.map((id) => [id, []]),
  )
  const queued = new Set<string>()

  for (let page = 0; page < MAX_PAGES_PER_SEARCH; page += 1) {
    const tweets = await searchNewestMatches(group, since, {
      fetcher: deps.fetcher,
      timeoutMs: SEARCH_TIMEOUT_MS,
      offset: page * SEARCH_ALERT_PAGE_LIMIT,
    })
    result.pagesRead += 1
    const recorded = await deps.listRecorded(
      alertIds,
      tweets.map((t) => t.id),
    )
    let foundUnseen = false
    for (const alert of group.alerts) {
      for (const tweet of eligibleFor(tweets, alert)) {
        const key = recordedKey(alert.id, tweet.id)
        if (recorded.has(key) || queued.has(key)) continue
        queued.add(key)
        unseen.get(alert.id)!.push(tweet)
        foundUnseen = true
      }
    }
    if (!foundUnseen || tweets.length < SEARCH_ALERT_PAGE_LIMIT) break
  }
  return unseen
}

/**
 * One matching pass: each distinct search hits the gateway (up to four pages)
 * once for all its alerts, and each alert records the tweets it has not
 * reported before. A failed search records nothing, so the next run sees the
 * same tweets as unseen and reports them then.
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
    pagesRead: 0,
    failedSearches: 0,
    alertsWithMatches: 0,
    newMatches: 0,
    failedAlerts: 0,
  }

  const startedAt = Date.now()
  const deadline = deps.deadlineMs ?? RUN_DEADLINE_MS
  await eachLimited(batch, CONCURRENCY, async (group) => {
    if (Date.now() - startedAt > deadline) {
      result.searches -= 1
      result.deferredSearches += 1
      return
    }
    const checkedAt = now()
    let unseen: Map<string, MatchedTweetRef[]>
    try {
      unseen = await collectUnseen(group, checkedAt, deps, result)
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
      try {
        const inserted = await deps.record({
          alertId: alert.id,
          checkedAt: checkedAt.toISOString(),
          tweets: unseen.get(alert.id) ?? [],
        })
        if (inserted > 0) {
          result.alertsWithMatches += 1
          result.newMatches += inserted
        }
      } catch (error) {
        result.failedAlerts += 1
        console.error('Search alert write failed:', errorMessage(error))
      }
    }
  })

  return result
}
