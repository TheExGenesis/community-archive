import 'server-only'
import { getAuthenticatedAccountId } from '@/lib/authenticatedAccount'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { getServerSupabaseUrl } from '@/utils/supabase'
import { ACCOUNT_ID_PATTERN } from './shape'

export function isLoopbackUrl(value: string | undefined | null) {
  if (!value) return false
  try {
    const { hostname } = new URL(value)
    return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)
  } catch {
    return false
  }
}

/**
 * Local shelf preview: `/shelf?as=<account_id>` lets a developer view AND
 * curate any member's shelf without signing in. It requires both
 *   1. the loopback local admin preview (development build, no Vercel,
 *      LOCAL_ADMIN_PREVIEW=true, request Host is localhost), and
 *   2. a Supabase URL on loopback (127.0.0.1 / localhost) for the server
 *      clients in this process,
 * so preview writes can only ever reach a local database. With
 * NEXT_PUBLIC_USE_REMOTE_DEV_DB=true (or any remote URL) the preview is off and
 * /shelf falls back to normal sign-in.
 */
export async function shelfPreviewAllowed() {
  if ((await getLocalAdminPreview()) !== 'admin') return false
  return isLoopbackUrl(getServerSupabaseUrl())
}

/**
 * Whether this request may see unapproved items and curate `accountId`.
 * Identity comes from app_metadata.provider_id only, never user_metadata.
 */
export async function canCurateShelf(accountId: string) {
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return false
  if ((await getAuthenticatedAccountId()) === accountId) return true
  return shelfPreviewAllowed()
}
