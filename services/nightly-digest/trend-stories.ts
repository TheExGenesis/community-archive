import {
  fetchPortalTrendEvidence,
  fetchPortalWeeklyTrends,
} from '@/lib/portal/analytics'
import { trendDateForTerms, trendStoryToRow } from '@/lib/trendStories/core'
import {
  DEFAULT_TREND_STORY_MODEL,
  generateTrendStories,
} from '@/lib/trendStories/generate'

/**
 * Nightly: read today's homepage trending terms, merge and explain them, and
 * store one row per story in public.trend_stories. Idempotent per day: an
 * existing day is skipped unless --force. Runs before the digest in the same
 * oneshot unit; its failure never blocks the digest.
 */

const log = (message: string, metadata: Record<string, unknown> = {}) =>
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      service: 'trend-stories',
      message,
      ...metadata,
    }),
  )

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE
  if (!url || !key)
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE are required',
    )
  return async <T>(path: string, init: RequestInit = {}, prefer?: string) => {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      signal: AbortSignal.timeout(60_000),
    })
    const body = await response.text()
    if (!response.ok)
      throw new Error(
        `Supabase request failed (${response.status}): ${body.slice(0, 400)}`,
      )
    return (body ? JSON.parse(body) : null) as T
  }
}

export async function publishTrendStories({
  dryRun = false,
  force = false,
}: { dryRun?: boolean; force?: boolean } = {}) {
  const terms = await fetchPortalWeeklyTrends()
  const trendDate = trendDateForTerms(terms)
  if (!terms.length || !trendDate) {
    log('no dated trending terms; nothing to do', { count: terms.length })
    return []
  }
  const db = dryRun ? null : supabase()
  if (db && !force) {
    const existing = await db<Array<{ slug: string }>>(
      `trend_stories?select=slug&trend_date=eq.${trendDate}&limit=1`,
    )
    if (existing.length) {
      log('stories already stored; skipping', { trendDate })
      return []
    }
  }
  const startedAt = Date.now()
  const stories = await generateTrendStories({
    terms,
    model: process.env.TREND_STORIES_MODEL || DEFAULT_TREND_STORY_MODEL,
    fetchEvidence: async (term) =>
      (
        await fetchPortalTrendEvidence([term.term], {
          limit: 50,
          since: term.sinceDate,
          // The evidence route's until is exclusive.
          until: trendDate,
          sort: 'newest',
        })
      ).tweets,
  })
  if (db) {
    if (force)
      await db(`trend_stories?trend_date=eq.${trendDate}`, {
        method: 'DELETE',
      })
    await db(
      'trend_stories?on_conflict=trend_date,slug',
      { method: 'POST', body: JSON.stringify(stories.map(trendStoryToRow)) },
      'resolution=merge-duplicates,return=minimal',
    )
  }
  log(dryRun ? 'dry run generated stories' : 'stories stored', {
    trendDate,
    durationMs: Date.now() - startedAt,
    terms: terms.map((term) => term.term),
    stories: stories.map((story) => ({
      slug: story.slug,
      terms: story.terms,
      tweets: story.tweets.length,
      ...(dryRun ? { title: story.title, tooltip: story.tooltip } : {}),
    })),
  })
  return stories
}

if (process.argv[1]?.endsWith('/nightly-digest/trend-stories.ts')) {
  const args = process.argv.slice(2)
  publishTrendStories({
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
  }).catch((error) => {
    log('trend stories failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exitCode = 1
  })
}
