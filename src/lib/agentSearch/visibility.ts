import 'server-only'
import { isAdminUser } from '@/app/admin/data'
import { agentSearchLaunched } from '@/lib/agentSearch/enabled'
import { getCurrentUser } from '@/lib/portal/auth'

/**
 * Whether the current viewer may see Ask the archive at all: everyone once
 * AGENT_SEARCH_LAUNCHED is set, otherwise admins only.
 */
export async function agentSearchVisible(): Promise<boolean> {
  if (agentSearchLaunched()) return true
  const user = await getCurrentUser()
  return user ? isAdminUser(user) : false
}
