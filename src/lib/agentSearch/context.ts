import 'server-only'
import { convertToModelMessages, type ModelMessage, type UIMessage } from 'ai'
import { createAgentSearchTools } from './agent'
import { collectRefs, conversationMessages } from './history'
import { loadConversationTweets } from './historyTweets'
import type { AgentSearchRun, AgentTweet } from './types'

// A follow-up question sees the conversation as the server stored it, never
// as the browser sends it: the client sends only the new question. Earlier
// turns are rebuilt from the run store, their tweets fetched again through
// the gateway, and their tool outputs compacted by each tool's toModelOutput,
// as the model saw them when it called the tool.

/** Earlier turns the model sees in full; the page still shows them all. */
export const MAX_CONTEXT_TURNS = 3

export interface ConversationContext {
  /** Earlier turns as model messages, oldest first. */
  messages: ModelMessage[]
  /**
   * Every tweet id that a tool returned in an earlier turn of this
   * conversation. A follow-up answer may cite them (see citations.ts).
   */
  priorTweetIds: string[]
}

/** The conversation's finished runs before the current one, oldest first. */
export function priorRuns(
  runs: AgentSearchRun[],
  currentRunId: string,
): AgentSearchRun[] {
  return runs
    .filter((run) => run.id !== currentRunId && run.status !== 'running')
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

const isToolPart = (part: { type: string }) =>
  part.type === 'dynamic-tool' || part.type.startsWith('tool-')

/**
 * Stored answers keep tool parts first and the answer text last, without
 * step boundaries. Marking one before the text makes the answer follow the
 * tool results, as it did when the model wrote it.
 */
function withStepBoundary(message: UIMessage): UIMessage {
  if (message.role !== 'assistant') return message
  const parts: UIMessage['parts'] = []
  let afterTool = false
  for (const part of message.parts) {
    if (part.type === 'text' && afterTool) {
      parts.push({ type: 'step-start' })
      afterTool = false
    }
    if (isToolPart(part)) afterTool = true
    parts.push(part)
  }
  return { ...message, parts }
}

const textOnly = (message: UIMessage): UIMessage => ({
  ...message,
  parts: message.parts.filter((part) => part.type === 'text'),
})

async function toModelMessages(messages: UIMessage[]) {
  return convertToModelMessages(messages, {
    // toModelOutput compacts old tool outputs, as in the original turn.
    tools: createAgentSearchTools(),
    // A run stopped mid-tool leaves a call without a result.
    ignoreIncompleteToolCalls: true,
  })
}

export async function buildConversationContext(
  runs: AgentSearchRun[],
  currentRunId: string,
  loadTweets: (
    runs: AgentSearchRun[],
  ) => Promise<Map<string, AgentTweet>> = loadConversationTweets,
): Promise<ConversationContext> {
  const prior = priorRuns(runs, currentRunId)
  const priorTweetIds = new Set<string>()
  for (const run of prior) collectRefs(run.parts ?? [], priorTweetIds)

  const recent = prior.slice(-MAX_CONTEXT_TURNS)
  if (recent.length === 0) {
    return { messages: [], priorTweetIds: Array.from(priorTweetIds) }
  }
  const tweets = await loadTweets(recent)
  const messages: ModelMessage[] = []
  for (const run of recent) {
    const turn = conversationMessages([run], tweets).map(withStepBoundary)
    // One malformed stored turn must not sink the follow-up: fall back to
    // its question and answer text.
    const converted = await toModelMessages(turn).catch(() =>
      toModelMessages(turn.map(textOnly)),
    )
    messages.push(...converted)
  }
  return { messages, priorTweetIds: Array.from(priorTweetIds) }
}
