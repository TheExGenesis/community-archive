import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow'
import { convertToModelMessages, isStepCount, type UIMessage } from 'ai'
import { getWorkflowMetadata, getWritable } from 'workflow'
import {
  AGENT_SEARCH_MAX_STEPS,
  agentSearchInstructions,
  createAgentSearchTools,
} from '@/lib/agentSearch/agent'
import {
  collectToolTweetIds,
  validateCitations,
} from '@/lib/agentSearch/citations'
import { agentSearchModel, estimateModelCostUsd } from '@/lib/agentSearch/model'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
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

// Each tool runs as a durable step: retried on failure, recorded in the run's
// event log, and never re-run once it has finished.

async function findPeopleStep(input: FindPeopleInput) {
  'use step'
  return findPeopleImpl(input)
}

async function searchTweetsStep(input: SearchTweetsToolInput) {
  'use step'
  return searchTweetsImpl(input)
}

async function collectAndScoreStep(input: CollectAndScoreInput) {
  'use step'
  return collectAndScoreImpl(input)
}

async function scoreTweetsStep(input: ScoreTweetsInput) {
  'use step'
  return scoreTweetsImpl(input)
}

async function getThreadStep(input: { tweetId: string }) {
  'use step'
  return getThreadImpl(input)
}

async function getQuotePostsStep(input: { tweetId: string; limit?: number }) {
  'use step'
  return getQuotePostsImpl(input)
}

async function getTweetsStep(input: { tweetIds: string[] }) {
  'use step'
  return getTweetsImpl(input)
}

interface RunSummary {
  runId: string
  accountId: string
  question: string
  modelSpec: string
  text: string
  toolCalls: Array<{ name: string; input: unknown; count?: number }>
  toolOutputs: unknown[]
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  classifierCostUsd: number
  error: string | null
}

async function recordRunStep(summary: RunSummary) {
  'use step'
  const { cited, invalid } = validateCitations(
    summary.text,
    collectToolTweetIds(summary.toolOutputs),
  )
  const modelCost = estimateModelCostUsd(
    summary.modelSpec,
    {
      inputTokens: summary.inputTokens,
      cachedInputTokens: summary.cachedInputTokens,
      outputTokens: summary.outputTokens,
    },
    {
      input: process.env.AGENT_SEARCH_INPUT_USD_PER_MTOK,
      output: process.env.AGENT_SEARCH_OUTPUT_USD_PER_MTOK,
    },
  )
  const store = getAgentSearchRunStore()
  // The route stores the run right after start(); create it here if that
  // write has not landed (or failed) so the result is never lost.
  if (!(await store.get(summary.runId))) {
    await store.create({
      id: summary.runId,
      accountId: summary.accountId,
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
    citedTweetIds: cited,
    invalidCitationIds: invalid,
    toolCalls: summary.toolCalls,
    inputTokens: summary.inputTokens,
    outputTokens: summary.outputTokens,
    costUsd: Math.round((modelCost + summary.classifierCostUsd) * 1e6) / 1e6,
    error: summary.error,
  })
}

function outputCount(output: unknown): number | undefined {
  if (!output || typeof output !== 'object') return undefined
  const record = output as Record<string, unknown>
  for (const key of ['tweets', 'kept', 'scored', 'conversation', 'members']) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).length
  }
  return undefined
}

export interface AgentSearchWorkflowInput {
  accountId: string
  question: string
  messages: UIMessage[]
  modelSpec: string
  date: string
}

export async function agentSearchWorkflow(input: AgentSearchWorkflowInput) {
  'use workflow'

  // The workflow run id doubles as the search run id the route stored.
  const { workflowRunId: runId } = getWorkflowMetadata()
  const agent = new WorkflowAgent({
    model: agentSearchModel(input.modelSpec),
    instructions: agentSearchInstructions(input.date),
    tools: createAgentSearchTools({
      find_people: findPeopleStep,
      search_tweets: searchTweetsStep,
      collect_and_score: collectAndScoreStep,
      score_tweets: scoreTweetsStep,
      get_thread: getThreadStep,
      get_quote_posts: getQuotePostsStep,
      get_tweets: getTweetsStep,
    }),
  })

  let error: string | null = null
  let text = ''
  const toolCalls: RunSummary['toolCalls'] = []
  const toolOutputs: unknown[] = []
  let inputTokens = 0
  let cachedInputTokens = 0
  let outputTokens = 0
  let classifierCostUsd = 0
  try {
    const result = await agent.stream({
      messages: await convertToModelMessages(input.messages),
      writable: getWritable<ModelCallStreamPart>(),
      stopWhen: isStepCount(AGENT_SEARCH_MAX_STEPS),
    })
    for (const step of result.steps) {
      inputTokens += step.usage?.inputTokens ?? 0
      cachedInputTokens += step.usage?.inputTokenDetails?.cacheReadTokens ?? 0
      outputTokens += step.usage?.outputTokens ?? 0
      for (const call of step.toolCalls) {
        const output = step.toolResults.find(
          (r) => r.toolCallId === call.toolCallId,
        )?.output
        toolCalls.push({
          name: call.toolName,
          input: call.input,
          count: outputCount(output),
        })
      }
      for (const toolResult of step.toolResults) {
        toolOutputs.push(toolResult.output)
        const cost = (toolResult.output as { costUsd?: unknown } | undefined)
          ?.costUsd
        if (typeof cost === 'number') classifierCostUsd += cost
      }
      if (step.text) text = step.text
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  }

  await recordRunStep({
    runId,
    accountId: input.accountId,
    question: input.question,
    modelSpec: input.modelSpec,
    text,
    toolCalls,
    toolOutputs,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    classifierCostUsd,
    error,
  })
  if (error) throw new Error(error)
  return { runId }
}
