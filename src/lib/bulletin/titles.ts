import 'server-only'

import { createServerServiceRoleClient } from '@/utils/supabase'
import { getTweetPageData } from '@/lib/getTweetPageData'
import {
  SUMMARY_PROMPT_VERSION,
  precheckEligibility,
} from '@/lib/tweetSummary/generation'
import { getTweetPageSummary } from '@/lib/tweetSummary/store'
import { buildTweetPageSubject } from '@/lib/tweetSummary/subject'
import type { Notice } from './types'

/**
 * Bulletin cards use the AI title from the tweet's own archive page as their
 * headline. A notice is an original post, so its title is the single-tweet
 * summary: the same stored row a signed-in permalink visit reads or writes.
 */
export function bulletinTitleKey(tweetId: string) {
  return `tweet:${tweetId}-${tweetId}:1`
}

// Keys per request: an `in` filter travels in the URL.
const KEY_CHUNK = 150

type StoredOutcome = { subject_key: string; title: string | null }

async function readOutcomes(
  tweetIds: string[],
  eligibleOnly: boolean,
): Promise<StoredOutcome[]> {
  if (!tweetIds.length) return []
  const client = createServerServiceRoleClient()
  const chunks: string[][] = []
  for (let i = 0; i < tweetIds.length; i += KEY_CHUNK)
    chunks.push(tweetIds.slice(i, i + KEY_CHUNK).map(bulletinTitleKey))
  const results = await Promise.all(
    chunks.map(async (keys) => {
      let query = client
        .from('tweet_page_summaries' as never)
        .select('subject_key,title')
        .in('subject_key', keys)
        .eq('prompt_version', SUMMARY_PROMPT_VERSION)
      if (eligibleOnly) query = query.eq('eligible', true)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as StoredOutcome[]
    }),
  )
  return results.flat()
}

const tweetIdOf = (key: string) => key.slice(6, key.indexOf('-'))

/**
 * Stored titles by tweet ID. A failed read only leaves cards on their notice
 * text, so it never fails the board.
 */
export async function readBulletinTitles(
  tweetIds: string[],
): Promise<Map<string, string>> {
  try {
    const rows = await readOutcomes(tweetIds, true)
    return new Map(
      rows.flatMap((row) =>
        row.title ? [[tweetIdOf(row.subject_key), row.title] as const] : [],
      ),
    )
  } catch (error) {
    console.warn(
      'Bulletin titles unavailable:',
      error instanceof Error ? error.message : error,
    )
    return new Map()
  }
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await run(items[next++]!)
    }),
  )
}

function hasEnoughText(notice: Notice) {
  return precheckEligibility({
    chain: [{ text: notice.preview_text ?? '' }],
  } as Parameters<typeof precheckEligibility>[0]).eligible
}

export type TitleRunResult = {
  candidates: number
  attempted: number
  titled: number
  untitled: number
  failed: number
}

/**
 * Generates titles for live notices that have no stored outcome yet, newest
 * first and at most `limit` per run. An outcome the model judged ineligible is
 * stored too, so it is not asked again.
 */
export async function generateBulletinTitles(
  notices: Notice[],
  { limit = 60, concurrency = 4 } = {},
): Promise<TitleRunResult> {
  // Text too thin to summarize is never stored, so skip it before any read.
  const untitled = notices
    .filter((o) => !o.title && hasEnoughText(o))
    .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at))
  const tried = new Set(
    (
      await readOutcomes(
        untitled.map((o) => o.tweet_id),
        false,
      )
    ).map((row) => tweetIdOf(row.subject_key)),
  )
  const todo = untitled.filter((o) => !tried.has(o.tweet_id)).slice(0, limit)
  const result: TitleRunResult = {
    candidates: untitled.length - tried.size,
    attempted: todo.length,
    titled: 0,
    untitled: 0,
    failed: 0,
  }
  await mapLimit(todo, concurrency, async (notice) => {
    try {
      const page = await getTweetPageData(notice.tweet_id, {
        deferQuotePosts: true,
        skipQuotePosts: true,
      })
      if (!page.tweet) {
        result.failed++
        return
      }
      const subject = buildTweetPageSubject(page.tweet, null)
      const summary = await getTweetPageSummary(subject, true)
      if (summary) result.titled++
      else result.untitled++
    } catch (error) {
      result.failed++
      console.warn(
        'Bulletin title not generated:',
        notice.tweet_id,
        error instanceof Error ? error.message : error,
      )
    }
  })
  return result
}
