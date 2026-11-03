import 'server-only'
import {
  getAgentSearchViewer,
  type AgentSearchViewerResult,
} from './eligibility'
import { ownConversationRuns } from './ownConversation'
import { getAgentSearchRunStore } from './runStore'
import { sharedConversationRuns } from './sharedConversation'
import type { AgentSearchRun } from './types'

/**
 * How a request may read a conversation: as its asker, with everything
 * (follow-ups, deletion, sharing), or as a reader of one its asker shared,
 * signed in or not. Refused with the viewer's own status when it is neither:
 * a signed-out visitor is asked to sign in (401), an ineligible member is
 * told so (403), and the asker's own missing conversation, another member's
 * unshared one and a bad id all look the same (404).
 */
export type ConversationRead =
  | { ok: true; role: 'owner'; runs: AgentSearchRun[]; accountId: string }
  | { ok: true; role: 'reader'; runs: AgentSearchRun[] }
  | { ok: false; status: 401 | 403 | 404; error: string }

export async function readConversation(
  id: string,
  access: AgentSearchViewerResult,
): Promise<ConversationRead> {
  if (access.ok) {
    const runs = await ownConversationRuns(id, access.viewer.accountId)
    if (runs) {
      return {
        ok: true,
        role: 'owner',
        runs,
        accountId: access.viewer.accountId,
      }
    }
  }
  const shared = await sharedConversationRuns(id)
  if (shared) return { ok: true, role: 'reader', runs: shared }
  if (!access.ok) {
    return {
      ok: false,
      status: access.reason === 'signed_out' ? 401 : 403,
      error: access.reason,
    }
  }
  return { ok: false, status: 404, error: 'not_found' }
}

/** readConversation for a route: the viewer is looked up here. */
export async function readConversationForViewer(
  id: string,
): Promise<ConversationRead> {
  return readConversation(id, await getAgentSearchViewer())
}

/** Whether the asker has shared the conversation. */
export async function isConversationShared(id: string): Promise<boolean> {
  return (await getAgentSearchRunStore().getShare(id)) !== null
}
