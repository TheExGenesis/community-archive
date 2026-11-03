import 'server-only'
import { getUser } from './gateway'
import type { RunLimits } from './deadline'
import type { AskerProfile } from './agent'

const ACCOUNT_ID = /^\d{1,20}$/
// The lookup is a nicety: a slow gateway must not hold up the answer.
const ASKER_TIMEOUT_MS = 2_000

/**
 * Who is asking, from the gateway's copy of their profile: handle, display
 * name and bio. Null when the account is not in the archive's profiles, the
 * id is not a real account (the development preview's 'dev'), or the lookup
 * fails; the question is answered without it.
 */
export async function lookupAsker(
  accountId: string,
  limits: RunLimits = {},
): Promise<AskerProfile | null> {
  if (!ACCOUNT_ID.test(accountId)) return null
  try {
    const user = await getUser(accountId, {
      ...limits,
      deadlineAt: Math.min(
        limits.deadlineAt ?? Infinity,
        Date.now() + ASKER_TIMEOUT_MS,
      ),
    })
    if (!user) return null
    return {
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
    }
  } catch (error) {
    console.error('[agent-search] asker lookup failed', error)
    return null
  }
}
