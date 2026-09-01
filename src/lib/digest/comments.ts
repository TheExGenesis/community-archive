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

/**
 * Confirms the edition exists and is published. Returns an error response
 * instead when the id is malformed, unknown, or not yet public.
 */
export async function ensurePublishedEdition(
  editionId: string,
): Promise<{ error: NextResponse } | { ok: true }> {
  const notFound = {
    error: NextResponse.json({ error: 'Edition not found' }, { status: 404 }),
  }
  if (!UUID_PATTERN.test(editionId)) return notFound

  const admin = createDigestAdminClient()
  const { data: edition, error } = await admin
    .from('digest_editions')
    .select('id,status')
    .eq('id', editionId)
    .maybeSingle()

  if (error) {
    console.error('Digest comment edition lookup failed:', error.message)
    return {
      error: NextResponse.json({ error: 'Lookup failed' }, { status: 500 }),
    }
  }
  if (!edition || edition.status !== 'published') return notFound

  return { ok: true }
}
