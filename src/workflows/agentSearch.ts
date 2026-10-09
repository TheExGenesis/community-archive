import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow'
import { isStepCount } from 'ai'
import { getWorkflowMetadata, getWritable } from 'workflow'
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

async function findPeopleStep(input: FindPeopleInput) {
  'use step'
  return findPeopleImpl(input)
}
findPeopleStep.maxRetries = 1

async function searchTweetsStep(input: SearchTweetsToolInput) {
  'use step'
  return searchTweetsImpl(input)
}
searchTweetsStep.maxRetries = 1

async function collectAndScoreStep(input: CollectAndScoreInput, runId: string) {
  'use step'
  return withRecordedCost(runId, () => collectAndScoreImpl(input))
}
collectAndScoreStep.maxRetries = 0

async function scoreTweetsStep(input: ScoreTweetsInput, runId: string) {
  'use step'
  return withRecordedCost(runId, () => scoreTweetsImpl(input))
}
scoreTweetsStep.maxRetries = 0

async function getThreadStep(input: { tweetId: string }) {
  'use step'
  return getThreadImpl(input)
}
getThreadStep.maxRetries = 1

async function getQuotePostsStep(input: { tweetId: string; limit?: number }) {
  'use step'
  return getQuotePostsImpl(input)
}
getQuotePostsStep.maxRetries = 1

async function getTweetsStep(input: { tweetIds: string[] }) {
  'use step'
  return getTweetsImpl(input)
}
getTweetsStep.maxRetries = 1

// Earlier turns come from the run store, never from the browser. Only the
// asker's own runs count, though the route already refused anyone else's
// conversation.
async function loadContextStep(
  conversationId: string,
  accountId: string,
  runId: string,
) {
  'use step'
  const runs = await getAgentSearchRunStore().listConversation(conversationId)
  return buildConversationContext(
    runs.filter((run) => run.accountId === accountId),
    runId,
  )
}

interface RunSummary {
  runId: string
  accountId: string
  conversationId: string | null
  parts: unknown[]
  question: string
  modelSpec: string
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
  // The route stores the run right after start(); create it here if that
  // write has not landed (or failed) so the result is never lost.
  if (!(await store.get(summary.runId))) {
    await store.create({
      id: summary.runId,
      accountId: summary.accountId,
      conversationId: summary.conversationId,
      question: summary.question,
      status: 'running',
      model: summary.modelSpec,
      startedAt: new Date().toISOString(),
      completedAt: null,
      answer: null,
      citedTweetIds: [],
      invalidCitationIds: [],
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      error: null,
    })
  }
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
  accountId: string
  conversationId: string
  question: string
  modelSpec: string
  date: string
}

export async function agentSearchWorkflow(input: AgentSearchWorkflowInput) {
  'use workflow'

  // The workflow run id doubles as the search run id the route stored.
  const { workflowRunId: runId } = getWorkflowMetadata()
  const agent = new WorkflowAgent({
    // Each planner call records its own usage on this run.
    model: agentSearchModel(input.modelSpec, runId),
    instructions: agentSearchInstructions(input.date),
    tools: createAgentSearchTools({
      find_people: findPeopleStep,
      search_tweets: searchTweetsStep,
      collect_and_score: (args) => collectAndScoreStep(args, runId),
      score_tweets: (args) => scoreTweetsStep(args, runId),
      get_thread: getThreadStep,
      get_quote_posts: getQuotePostsStep,
      get_tweets: getTweetsStep,
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
    priorTweetIds = context.priorTweetIds
    const result = await agent.stream({
      messages: [
        ...context.messages,
        { role: 'user', content: input.question },
      ],
      writable: getWritable<ModelCallStreamPart>(),
      stopWhen: isStepCount(AGENT_SEARCH_MAX_STEPS),
      prepareStep: agentSearchPrepareStep,
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
    accountId: input.accountId,
    conversationId: input.conversationId,
    parts,
    question: input.question,
    modelSpec: input.modelSpec,
    text,
    toolCalls,
    toolOutputs,
    priorTweetIds,
    error,
  })
  if (error) throw new Error(error)
  return { runId }
}
