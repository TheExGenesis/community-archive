import { NextResponse } from 'next/server'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { ownConversationRuns } from '@/lib/agentSearch/ownConversation'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import type { AgentSearchRun } from '@/lib/agentSearch/types'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

// Sharing is the asker's alone. A shared conversation is readable by anyone
// with its link, signed in or not, follow-ups included, until the asker
// stops sharing or deletes it. The link shows the questions and answers,
// never who asked.
type Owner =
  | { refused: NextResponse }
  | { refused?: undefined; accountId: string; runs: AgentSearchRun[] }

async function ownerOf(conversationId: string): Promise<Owner> {
  const access = await getAgentSearchViewer()
  if (!access.ok) {
    return {
      refused: NextResponse.json(
        { error: access.reason },
        {
          status: access.reason === 'signed_out' ? 401 : 403,
          headers: noStore,
        },
      ),
    }
  }
  const runs = await ownConversationRuns(
    conversationId,
    access.viewer.accountId,
  )
  if (!runs) {
    return {
      refused: NextResponse.json(
        { error: 'not_found' },
        { status: 404, headers: noStore },
      ),
    }
  }
  return { accountId: access.viewer.accountId, runs }
}

export async function POST(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ conversationId: string }> },
): Promise<NextResponse> {
  const { conversationId } = await paramsPromise
  const owner = await ownerOf(conversationId)
  if (owner.refused) return owner.refused
  // Nothing to share until an answer is stored.
  if (!owner.runs.some((run) => run.status !== 'running')) {
    return NextResponse.json(
      { error: 'no_answer_yet' },
      { status: 409, headers: noStore },
    )
  }
  await getAgentSearchRunStore().shareConversation(
    owner.accountId,
    conversationId,
  )
  return NextResponse.json({ shared: true }, { headers: noStore })
}

export async function DELETE(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ conversationId: string }> },
): Promise<NextResponse> {
  const { conversationId } = await paramsPromise
  const owner = await ownerOf(conversationId)
  if (owner.refused) return owner.refused
  await getAgentSearchRunStore().unshareConversation(
    owner.accountId,
    conversationId,
  )
  return NextResponse.json({ shared: false }, { headers: noStore })
}
