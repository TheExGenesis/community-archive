import 'server-only'
import { getAgentSearchRunStore } from './runStore'
import type { AgentSearchRun } from './types'

const CONVERSATION_ID = /^[A-Za-z0-9_-]{8,100}$/

/**
 * The conversation's runs when it exists and is entirely the viewer's;
 * null otherwise, so another member's id looks the same as a missing one.
 * Deleted runs are not listed, so a deleted conversation is missing too.
 */
export async function ownConversationRuns(
  id: string,
  accountId: string,
): Promise<AgentSearchRun[] | null> {
  if (!CONVERSATION_ID.test(id)) return null
  const runs = await getAgentSearchRunStore().listConversation(id)
  if (runs.length === 0 || runs.some((run) => run.accountId !== accountId)) {
    return null
  }
  return runs
}
