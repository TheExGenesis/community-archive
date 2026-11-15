import 'server-only'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import {
  createDigestAdminClient,
  type DigestEditionCommentRow,
} from '@/lib/digest/database'

export const MAX_COMMENT_LENGTH = 2000

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DigestCommentPayload {
  id: string
  content: string
  username: string | null
  displayName: string | null
  createdAt: string
  isOwn: boolean
}

export const mapDigestComment = (
  row: DigestEditionCommentRow,
  viewerId: string | null,
): DigestCommentPayload => ({
  id: row.id,
  content: row.content,
  username: row.username,
  displayName: row.display_name,
  createdAt: row.created_at,
  isOwn: Boolean(viewerId) && row.user_id === viewerId,
})

/**
 * Display identity persisted alongside the comment so rendering never joins
 * auth.users. Only trusted provider identity data is used — `user_metadata` is
 * client-mutable and must not name a commenter to other readers.
 */
export const resolveCommenterIdentity = (user: User) => {
  const username = getSessionTwitterUsername(user)
  const identity =
    user.identities?.find((item) =>
      ['twitter', 'x'].includes(item.provider ?? ''),
    ) ?? null
  const data = (identity?.identity_data ?? {}) as Record<string, unknown>
  const rawName = data.full_name ?? data.name
  const displayName =
    typeof rawName === 'string' && rawName.trim() ? rawName.trim() : null

  return { username, displayName }
}

export type DigestCommentKind = 'daily' | 'weekly'

/** Edition and comment tables for each kind of digest. */
export const DIGEST_COMMENT_TABLES = {
  daily: { editions: 'digest_editions', comments: 'digest_edition_comments' },
  weekly: {
    editions: 'digest_weekly_editions',
    comments: 'digest_weekly_edition_comments',
  },
} as const

/**
 * The editions a discussion thread reads from and the one new comments are
 * written to. A daily thread is its edition. A weekly thread is the whole
 * week: the week-so-far edition is replaced (archived) every morning and the
 * final edition then archives the last one, so the thread gathers every
 * public edition of that week and writes to the newest open one.
 */
export interface DigestCommentThread {
  editionIds: string[]
  writeTo: string
  /** The week a weekly thread belongs to. */
  weekStart?: string
}

type WeeklyThreadRow = { id: string; status: string; week_start: string }

// Statuses a reader may have seen a weekly edition in. Comments are only ever
// written to `published` or `in_progress` rows; `archived` keeps the threads
// of superseded week-so-far rows.
const WEEKLY_THREAD_STATUSES = ['in_progress', 'archived', 'published']

/** Pick the edition a week's new comments go to: the final edition once it
 *  exists, otherwise the running week-so-far edition. */
export function weeklyThreadFromRows(
  rows: WeeklyThreadRow[],
): DigestCommentThread | null {
  const open =
    rows.find((row) => row.status === 'published') ??
    rows.find((row) => row.status === 'in_progress')
  return open
    ? {
        editionIds: rows.map((row) => row.id),
        writeTo: open.id,
        weekStart: open.week_start,
      }
    : null
}

/**
 * Resolves the thread for an edition id, or an error response when the id is
 * malformed, unknown, or not public.
 */
export async function resolveCommentThread(
  editionId: string,
  kind: DigestCommentKind = 'daily',
): Promise<{ error: NextResponse } | { thread: DigestCommentThread }> {
  const notFound = {
    error: NextResponse.json({ error: 'Edition not found' }, { status: 404 }),
  }
  const failed = (message: string) => {
    console.error('Digest comment edition lookup failed:', message)
    return {
      error: NextResponse.json({ error: 'Lookup failed' }, { status: 500 }),
    }
  }
  if (!UUID_PATTERN.test(editionId)) return notFound

  const admin = createDigestAdminClient()
  if (kind === 'daily') {
    const { data: edition, error } = await admin
      .from(DIGEST_COMMENT_TABLES.daily.editions)
      .select('id,status')
      .eq('id', editionId)
      .maybeSingle()
    if (error) return failed(error.message)
    if (!edition || edition.status !== 'published') return notFound
    return { thread: { editionIds: [editionId], writeTo: editionId } }
  }

  const weekly = () => admin.from(DIGEST_COMMENT_TABLES.weekly.editions)
  const { data: edition, error } = await weekly()
    .select('id,status,week_start')
    .eq('id', editionId)
    .maybeSingle()
  if (error) return failed(error.message)
  const row: WeeklyThreadRow | null = edition
  if (!row || !WEEKLY_THREAD_STATUSES.includes(row.status)) return notFound

  const { data: rows, error: weekError } = await weekly()
    .select('id,status,week_start')
    .eq('week_start', row.week_start)
    .in('status', WEEKLY_THREAD_STATUSES)
  if (weekError) return failed(weekError.message)
  const thread = weeklyThreadFromRows(rows ?? [])
  return thread ? { thread } : notFound
}
