import 'server-only'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getVisibleStrand } from '@/lib/community-apps/data'

export const STRAND_SEED_PATTERN = /^\d{1,20}$/

export interface StrandLikeRow {
  id: string
  strand_id: string
  user_id: string
  created_at: string
}

export interface StrandCommentRow {
  id: string
  strand_id: string
  user_id: string
  content: string
  username: string | null
  display_name: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface StrandCommentPayload {
  id: string
  content: string
  username: string | null
  displayName: string | null
  createdAt: string
  isOwn: boolean
}

type TableDefinition<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

type StrandEngagementDatabase = {
  public: {
    Tables: {
      strand_likes: TableDefinition<
        StrandLikeRow,
        Partial<StrandLikeRow> & Pick<StrandLikeRow, 'strand_id' | 'user_id'>,
        Partial<StrandLikeRow>
      >
      strand_comments: TableDefinition<
        StrandCommentRow,
        Partial<StrandCommentRow> &
          Pick<StrandCommentRow, 'strand_id' | 'user_id' | 'content'>,
        Partial<StrandCommentRow>
      >
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

// Both tables are service-role only; callers check strand visibility first.
export const createStrandAdminClient = () =>
  createServerServiceRoleClient() as unknown as SupabaseClient<StrandEngagementDatabase>

export const mapStrandComment = (
  row: StrandCommentRow,
  viewerId: string | null,
): StrandCommentPayload => ({
  id: row.id,
  content: row.content,
  username: row.username,
  displayName: row.display_name,
  createdAt: row.created_at,
  isOwn: Boolean(viewerId) && row.user_id === viewerId,
})

/**
 * Confirms the seed names a strand that is currently visible. Returns an error
 * response instead when the id is malformed, unknown, or hidden by policy.
 */
export async function ensureVisibleStrand(
  seed: string,
): Promise<{ error: NextResponse } | { ok: true }> {
  const notFound = {
    error: NextResponse.json({ error: 'Strand not found' }, { status: 404 }),
  }
  if (!STRAND_SEED_PATTERN.test(seed)) return notFound

  try {
    if (!(await getVisibleStrand(seed))) return notFound
  } catch (error) {
    console.error('Strand visibility lookup failed:', error)
    return {
      error: NextResponse.json({ error: 'Lookup failed' }, { status: 500 }),
    }
  }

  return { ok: true }
}

export async function getStrandLikeCount(strandId: string) {
  const { count, error } = await createStrandAdminClient()
    .from('strand_likes')
    .select('id', { count: 'exact', head: true })
    .eq('strand_id', strandId)
  if (error) {
    console.error('Strand like count read failed:', error.message)
    return 0
  }
  return count ?? 0
}

export async function getStrandLikedByViewer(
  strandId: string,
  viewerId: string,
) {
  const { data } = await createStrandAdminClient()
    .from('strand_likes')
    .select('id')
    .eq('strand_id', strandId)
    .eq('user_id', viewerId)
    .maybeSingle()
  return Boolean(data)
}

export async function getStrandCommentCount(strandId: string) {
  const { count, error } = await createStrandAdminClient()
    .from('strand_comments')
    .select('id', { count: 'exact', head: true })
    .eq('strand_id', strandId)
    .is('deleted_at', null)
  if (error) {
    console.error('Strand comment count read failed:', error.message)
    return 0
  }
  return count ?? 0
}
