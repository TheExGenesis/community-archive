import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow'
import { isStepCount } from 'ai'
import { getWritable } from 'workflow'
import {
  AGENT_SEARCH_MAX_STEPS,
  agentRunFailure,
  agentSearchInstructions,
  agentSearchPrepareStep,
  createAgentSearchTools,
  finalAnswerText,
} from '@/lib/agentSearch/agent'
import {
  collectToolTweetIds,
  validateCitations,
} from '@/lib/agentSearch/citations'
import { buildConversationContext } from '@/lib/agentSearch/context'
import { buildRunParts } from '@/lib/agentSearch/history'
import { agentSearchModel } from '@/lib/agentSearch/model'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import type { AgentSearchRun } from '@/lib/agentSearch/types'
import { withRecordedCost } from '@/lib/agentSearch/usage'
import {
  collectAndScoreImpl,
  findPeopleImpl,
  getQuotePostsImpl,
  getThreadImpl,
  getTweetsImpl,
  scoreTweetsImpl,
  searchTweetsImpl,
  type CollectAndScoreInput,
  type FindPeopleInput,
  type ScoreTweetsInput,
  type SearchTweetsToolInput,
} from '@/lib/agentSearch/toolImpl'

// Each tool runs as a durable step, recorded in the run's event log and never
// re-run once it has finished. Gateway reads are free and retried once. The
// paid tools (they call the scorer) are never retried: a retry would pay for
// all the scoring again. They add their own cost to the run before returning
// or throwing, so a failed or stopped run still counts what they spent.

// Every tool gets the run's deadline: no gateway or scorer call starts after
// it, and each call's timeout is cut to the time left (deadline.ts).

async function findPeopleStep(input: FindPeopleInput, deadlineAt: number) {
  'use step'
  return findPeopleImpl(input, { deadlineAt })
}
findPeopleStep.maxRetries = 1

async function searchTweetsStep(
  input: SearchTweetsToolInput,
  deadlineAt: number,
) {
  'use step'
  return searchTweetsImpl(input, { deadlineAt })
}
searchTweetsStep.maxRetries = 1

async function collectAndScoreStep(
  input: CollectAndScoreInput,
  runId: string,
  deadlineAt: number,
) {
  'use step'
  return withRecordedCost(runId, () =>
    collectAndScoreImpl(input, { deadlineAt }),
  )
}
collectAndScoreStep.maxRetries = 0

async function scoreTweetsStep(
  input: ScoreTweetsInput,
  runId: string,
  deadlineAt: number,
) {
  'use step'
  return withRecordedCost(runId, () => scoreTweetsImpl(input, { deadlineAt }))
}
scoreTweetsStep.maxRetries = 0

async function getThreadStep(input: { tweetId: string }, deadlineAt: number) {
  'use step'
  return getThreadImpl(input, { deadlineAt })
}
getThreadStep.maxRetries = 1

async function getQuotePostsStep(
  input: { tweetId: string; limit?: number },
  deadlineAt: number,
) {
  'use step'
  return getQuotePostsImpl(input, { deadlineAt })
}
getQuotePostsStep.maxRetries = 1

async function getTweetsStep(input: { tweetIds: string[] }, deadlineAt: number) {
  'use step'
  return getTweetsImpl(input, { deadlineAt })
}
getTweetsStep.maxRetries = 1

// Earlier turns come from the run store, never from the browser. Only the
// asker's own runs count, though the route already refused anyone else's
// conversation.
// It also reports a run that was stopped before the workflow got going.
async function loadContextStep(
  conversationId: string,
  accountId: string,
  runId: string,
) {
  'use step'
  const store = getAgentSearchRunStore()
  const current = await store.get(runId)
  if (current?.status !== 'running') {
    return { stopped: true, messages: [], priorTweetIds: [] }
  }
  const runs = await store.listConversation(conversationId)
  const context = await buildConversationContext(
    runs.filter((run) => run.accountId === accountId),
    runId,
  )
  return { stopped: false, ...context }
}

interface RunSummary {
  runId: string
  parts: unknown[]
  text: string
  toolCalls: AgentSearchRun['toolCalls']
  toolOutputs: unknown[]
  priorTweetIds: string[]
  error: string | null
}

// Tokens and cost are not part of the summary: each model call and paid tool
// has already added its own to the run (see usage.ts).
async function recordRunStep(summary: RunSummary) {
  'use step'
  // A citation is valid when a tool returned the tweet in this conversation:
  // in this run, or in an earlier turn (see citations.ts).
  const { cited, invalid } = validateCitations(summary.text, [
    ...Array.from(collectToolTweetIds(summary.toolOutputs)),
    ...summary.priorTweetIds,
  ])
  const store = getAgentSearchRunStore()
  // Admission stored the run before the workflow started. A run the member
  // stopped meanwhile stays stopped; its spend is already recorded.
  const current = await store.get(summary.runId)
  if (!current) throw new Error(`Agent search run ${summary.runId} is missing`)
  if (current.status !== 'running') return
  await store.update(summary.runId, {
    status: summary.error ? 'failed' : 'completed',
    completedAt: new Date().toISOString(),
    answer: summary.text || null,
    parts: summary.parts,
    citedTweetIds: cited,
    invalidCitationIds: invalid,
    toolCalls: summary.toolCalls,
    error: summary.error,
  })
}

const errorText = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 500)

function outputCount(output: unknown): number | undefined {
  if (!output || typeof output !== 'object') return undefined
  const record = output as Record<string, unknown>
  for (const key of ['tweets', 'kept', 'scored', 'conversation', 'members']) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).length
  }
  return undefined
}

/**
 * Only the new question crosses into the workflow (and its event log);
 * earlier turns are rebuilt from the run store by loadContextStep.
 */
export interface AgentSearchWorkflowInput {
  /** The search run id admission stored before starting the workflow. */
  runId: string
  accountId: string
  conversationId: string
  question: string
  modelSpec: string
  date: string
  /** Epoch ms; after it no tool call starts and the model must answer. */
  deadlineAt: number
}

export async function agentSearchWorkflow(input: AgentSearchWorkflowInput) {
  'use workflow'

  const { runId, deadlineAt } = input
  const agent = new WorkflowAgent({
    // Each planner call records its own usage on this run.
    model: agentSearchModel(input.modelSpec, runId),
    instructions: agentSearchInstructions(input.date),
    tools: createAgentSearchTools({
      find_people: (args) => findPeopleStep(args, deadlineAt),
      search_tweets: (args) => searchTweetsStep(args, deadlineAt),
      collect_and_score: (args) =>
        collectAndScoreStep(args, runId, deadlineAt),
      score_tweets: (args) => scoreTweetsStep(args, runId, deadlineAt),
      get_thread: (args) => getThreadStep(args, deadlineAt),
      get_quote_posts: (args) => getQuotePostsStep(args, deadlineAt),
      get_tweets: (args) => getTweetsStep(args, deadlineAt),
    }),
  })

  let error: string | null = null
  let text = ''
  const toolCalls: RunSummary['toolCalls'] = []
  const toolOutputs: unknown[] = []
  let parts: unknown[] = []
  let priorTweetIds: string[] = []
  try {
    const context = await loadContextStep(
      input.conversationId,
      input.accountId,
      runId,
    )
    // Stopped before it began: nothing was spent and nothing is recorded.
    if (context.stopped) return { runId }
    priorTweetIds = context.priorTweetIds
    const result = await agent.stream({
      messages: [
        ...context.messages,
        { role: 'user', content: input.question },
      ],
      writable: getWritable<ModelCallStreamPart>(),
      stopWhen: isStepCount(AGENT_SEARCH_MAX_STEPS),
      prepareStep: agentSearchPrepareStep(deadlineAt),
    })
    for (const step of result.steps) {
      // A tool that failed after its retries is missing from toolResults
      // and appears in content as a tool-error.
      const failed = new Map<string, unknown>()
      for (const part of step.content) {
        if (part.type === 'tool-error') failed.set(part.toolCallId, part.error)
      }
      for (const call of step.toolCalls) {
        const output = step.toolResults.find(
          (r) => r.toolCallId === call.toolCallId,
        )?.output
        toolCalls.push({
          name: call.toolName,
          input: call.input,
          count: outputCount(output),
          ...(failed.has(call.toolCallId)
            ? { error: errorText(failed.get(call.toolCallId)) }
            : {}),
        })
      }
      for (const toolResult of step.toolResults) {
        toolOutputs.push(toolResult.output)
      }
    }
    text = finalAnswerText(result.steps)
    parts = buildRunParts(result.steps, text)
    // A model error or an unusual finish comes back in the result, not as a
    // throw. The partial answer is kept, but the run is a failure.
    error = agentRunFailure(result)
  } catch (caught) {
    error = errorText(caught)
  }

  await recordRunStep({
    runId,
    parts,
    text,
    toolCalls,
    toolOutputs,
    priorTweetIds,
    error,
  })
  if (error) throw new Error(error)
  return { runId }
}
