import 'server-only'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/portal/auth'
import {
  createServerClient,
  createServerServiceRoleClient,
} from '@/utils/supabase'

export type AgentSearchViewer = {
  accountId: string
  userId: string | null
  preview: boolean
}

export type AgentSearchViewerResult =
  | { ok: true; viewer: AgentSearchViewer }
  | { ok: false; reason: 'signed_out' | 'not_eligible' }

export type AgentSearchAccess =
  | AgentSearchViewerResult
  | { ok: false; reason: 'unavailable' }

/** The HTTP status for a refused viewer. */
export function agentSearchAccessStatus(
  reason: 'signed_out' | 'not_eligible' | 'unavailable',
): number {
  return reason === 'signed_out' ? 401 : reason === 'unavailable' ? 503 : 403
}

/**
 * getAgentSearchViewer for routes: a failed eligibility query becomes
 * 'unavailable' (503) instead of an unhandled 500, and never a wrong refusal.
 */
export async function getAgentSearchAccess(): Promise<AgentSearchAccess> {
  try {
    return await getAgentSearchViewer()
  } catch (error) {
    console.error('[agent-search] eligibility check failed', error)
    return { ok: false, reason: 'unavailable' }
  }
}

const ACCOUNT_ID_PATTERN = /^\d{1,20}$/

// Trusted identity only: app_metadata comes from the X provider, while
// user_metadata is client-mutable and never used here.
function trustedAccountId(user: User): string | null {
  const accountId = user.app_metadata?.provider_id
  return typeof accountId === 'string' && ACCOUNT_ID_PATTERN.test(accountId)
    ? accountId
    : null
}

function trustedUsername(user: User): string {
  const raw =
    user.app_metadata?.user_name ||
    user.app_metadata?.preferred_username ||
    user.app_metadata?.username ||
    ''
  return String(raw)
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_]/g, '')
}

/**
 * Who may ask: a signed-in member whose account has a completed archive
 * upload and no explicit opt-out. In development, the member preview cookie
 * stands in for an eligible viewer with account id 'dev'. Only local
 * development counts: on a deployed preview every cookie holder would share
 * the 'dev' account, its quota and its runs. Query failures
 * throw so the route can answer 503 rather than wrongly refusing a member.
 */
export async function getAgentSearchViewer(): Promise<AgentSearchViewerResult> {
  const cookieStore = cookies()
  if (
    process.env.NODE_ENV === 'development' &&
    cookieStore.get('dev_as_member')?.value === '1'
  ) {
    return {
      ok: true,
      viewer: { accountId: 'dev', userId: null, preview: true },
    }
  }

  const user = await getCurrentUser()
  if (!user) return { ok: false, reason: 'signed_out' }

  const accountId = trustedAccountId(user)
  if (!accountId) return { ok: false, reason: 'not_eligible' }

  // archive_upload is publicly readable under RLS, so the session client is
  // enough. The opt-out lookup uses the service role because an admin opt-out
  // can be stored with user_id null, and RLS hides such a row from the user.
  const supabase = createServerClient(cookieStore)
  const username = trustedUsername(user)
  const optOutFilters = [
    `user_id.eq.${user.id}`,
    `twitter_user_id.eq.${accountId}`,
    ...(username ? [`username.eq.${username}`] : []),
  ].join(',')

  const [uploads, optOuts] = await Promise.all([
    supabase
      .from('archive_upload')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('upload_phase', 'completed'),
    createServerServiceRoleClient()
      .from('optin')
      .select('id')
      .eq('explicit_optout', true)
      .or(optOutFilters)
      .limit(1),
  ])

  if (uploads.error) {
    throw new Error(`Archive upload check failed: ${uploads.error.message}`)
  }
  if (optOuts.error) {
    throw new Error(`Opt-out check failed: ${optOuts.error.message}`)
  }
  if (!uploads.count || (optOuts.data ?? []).length > 0) {
    return { ok: false, reason: 'not_eligible' }
  }

  return {
    ok: true,
    viewer: { accountId, userId: user.id, preview: false },
  }
}
