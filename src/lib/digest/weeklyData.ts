import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createDigestReadClient } from './database'
import { isRecord } from './types'
import type { WeeklyDigestContent } from './weekly'

export interface WeeklyDigestEdition {
  id: string
  weekStart: string
  publishedAt: string | null
  content: WeeklyDigestContent
}

type WeeklyRow = {
  id: string
  week_start: string
  published_at: string | null
  content: unknown
}

const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/
// Anonymous readers may select only these columns (see the migration).
const PUBLIC_COLUMNS = 'id,week_start,published_at,content'

/** Reject tombstones and anything that is not a weekly edition body. */
export function parseWeeklyDigestContent(
  value: unknown,
): WeeklyDigestContent | null {
  if (!isRecord(value) || value.policy_tombstone === true) return null
  if (
    typeof value.weekStart !== 'string' ||
    typeof value.weekEnd !== 'string' ||
    !Array.isArray(value.executiveSummary) ||
    !Array.isArray(value.stories)
  ) {
    return null
  }
  const content = value as unknown as WeeklyDigestContent
  return {
    ...content,
    alsoNotable: Array.isArray(content.alsoNotable) ? content.alsoNotable : [],
    stories: content.stories.map((story) => ({
      ...story,
      continuesFrom: story.continuesFrom ?? [],
      dailyStories: story.dailyStories ?? [],
      days: story.days ?? [],
      tweets: story.tweets ?? [],
    })),
  }
}

const mapRow = (row: WeeklyRow): WeeklyDigestEdition | null => {
  const content = parseWeeklyDigestContent(row.content)
  return content
    ? {
        id: row.id,
        weekStart: row.week_start,
        publishedAt: row.published_at,
        content,
      }
    : null
}

// The typed digest client does not know this table yet; reads go through the
// same anon/RLS client with explicit public columns.
const weeklyTable = () =>
  (createDigestReadClient() as unknown as SupabaseClient).from(
    'digest_weekly_editions',
  )

async function readPublishedWeeklyDigest(
  weekStart?: string,
): Promise<WeeklyDigestEdition | null> {
  if (weekStart && !WEEK_PATTERN.test(weekStart)) return null
  let query = weeklyTable()
    .select(PUBLIC_COLUMNS)
    .eq('status', 'published')
    .order('week_start', { ascending: false })
    .limit(1)
  if (weekStart) query = query.eq('week_start', weekStart)
  const { data, error } = await query
  if (error) {
    console.error('Published weekly digest read failed:', error.message)
    return null
  }
  const row = (data as WeeklyRow[] | null)?.[0]
  return row ? mapRow(row) : null
}

const requestCache =
  cache ?? ((loader: typeof readPublishedWeeklyDigest) => loader)
export const getPublishedWeeklyDigest = requestCache(readPublishedWeeklyDigest)

/** Published week starts, newest first, for navigation. */
export async function listPublishedWeeks(limit = 26): Promise<string[]> {
  const { data, error } = await weeklyTable()
    .select('week_start')
    .eq('status', 'published')
    .order('week_start', { ascending: false })
    .limit(limit)
  if (error) return []
  return ((data as { week_start: string }[] | null) ?? []).map(
    ({ week_start }) => week_start,
  )
}
