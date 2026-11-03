import 'server-only'
import { cache } from 'react'
import { getAgentSearchRunStore } from './runStore'
import type { AgentSearchRun } from './types'

const CONVERSATION_ID = /^[A-Za-z0-9_-]{8,100}$/

/**
 * A shared conversation's finished runs, for anyone with its link; null
 * when the id is not shared, so an unshared conversation looks like a
 * missing one. Every run must belong to the member who shared it: a share
 * row never exposes runs another account stored under the same id. Runs
 * still answering are left out, as a reader cannot follow their stream.
 * Cached per request: the page reads it for its metadata and its body.
 */
export const sharedConversationRuns = cache(
  async (id: string): Promise<AgentSearchRun[] | null> => {
    if (!CONVERSATION_ID.test(id)) return null
    const store = getAgentSearchRunStore()
    const share = await store.getShare(id)
    if (!share) return null
    const runs = await store.listConversation(id)
    if (
      runs.length === 0 ||
      runs.some((run) => run.accountId !== share.accountId)
    ) {
      return null
    }
    const finished = runs.filter((run) => run.status !== 'running')
    return finished.length > 0 ? finished : null
  },
)
