import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow'
import { isStepCount } from 'ai'
import { getWritable } from 'workflow'
import {
  AGENT_SEARCH_MAX_STEPS,
  agentRunFailure,
  agentSearchInstructions,
  agentSearchPrepareStep,
  createAgentSearchTools,
  createBashAgentTools,
  finalAnswerText,
  questionWithWorkspace,
  toolsKeepFailing,
  type AgentSearchToolMode,
  type BashInput,
} from '@/lib/agentSearch/agent'
import {
  collectToolTweetIds,
  collectWorkspaceFiles,
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
  semanticLimitReached,
  semanticSearchImpl,
  type CollectAndScoreInput,
  type FindPeopleInput,
  type ScoreTweetsInput,
  type SearchTweetsToolInput,
} from '@/lib/agentSearch/toolImpl'
import {
  MAX_SEMANTIC_CALLS_PER_RUN,
  type SemanticSearchInput,
} from '@/lib/agentSearch/semantic'
import {
  applyChanges,
  describeManifest,
  type WorkspaceManifest,
} from '@/lib/agentSearch/workspace/manifest'
import { streamedBashOutput } from '@/lib/agentSearch/workspace/output'
import { runBashCommand } from '@/lib/agentSearch/workspace/workspace'

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

async function getTweetsStep(
  input: { tweetIds: string[] },
  deadlineAt: number,
) {
  'use step'
  return getTweetsImpl(input, { deadlineAt })
}
getTweetsStep.maxRetries = 1

// One command in the agent's workspace. The workspace is rebuilt from the
// manifest the workflow carries (see workspace/manifest.ts) and the command's
// changes come back in its output. It may score, so it is never retried; it
// adds what it spent to the run before returning or throwing.
async function bashStep(
  input: BashInput,
  manifest: WorkspaceManifest,
  semanticUsed: number,
  runId: string,
  deadlineAt: number,
) {
  'use step'
  return withRecordedCost(runId, () =>
    runBashCommand({
      command: input.command,
      manifest,
      semanticUsed,
      limits: { deadlineAt },
    }),
  )
}
bashStep.maxRetries = 0

// Semantic search is slow (about 14 s), so a failed call is not retried.
async function semanticSearchStep(
  input: SemanticSearchInput,
  deadlineAt: number,
) {
  'use step'
  return semanticSearchImpl(input, { deadlineAt })
}
semanticSearchStep.maxRetries = 0

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
    return { stopped: true, messages: [], priorTweetIds: [], workspace: {} }
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
  /** Workspace files earlier turns left: path to ids. */
  priorFiles: Record<string, string[]>
  error: string | null
}

// Tokens and cost are not part of the summary: each model call and paid tool
// has already added its own to the run (see usage.ts).
async function recordRunStep(summary: RunSummary) {
  'use step'
  // A citation is valid when a tool returned the tweet in this conversation:
  // in this run, or in an earlier turn (see citations.ts).
  // Lists may name workspace files from this run or an earlier turn.
  const files = new Map(Object.entries(summary.priorFiles))
  collectWorkspaceFiles(summary.toolOutputs).forEach((ids, path) =>
    files.set(path, ids),
  )
  const { cited, invalid } = validateCitations(
    summary.text,
    [
      ...Array.from(collectToolTweetIds(summary.toolOutputs)),
      ...summary.priorTweetIds,
    ],
    files,
  )
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
  /** How the agent searches; runs started before modes existed used typed tools. */
  toolMode?: AgentSearchToolMode
}

export async function agentSearchWorkflow(input: AgentSearchWorkflowInput) {
  'use workflow'

  const { runId, deadlineAt } = input
  const toolMode = input.toolMode ?? 'typed'
  // The workspace as of the last finished command, carried between steps.
  let workspace: WorkspaceManifest = {}
  // A question may run only a few semantic searches (each about 14 s).
  let semanticUsed = 0
  // Tweets already sent to the page in this run (streamedBashOutput).
  const sentTweetIds = new Set<string>()
  const tools =
    toolMode === 'bash'
      ? createBashAgentTools(async (args) => {
          const output = await bashStep(
            args,
            workspace,
            semanticUsed,
            runId,
            deadlineAt,
          )
          workspace = applyChanges(workspace, output.workspace)
          semanticUsed += output.semanticCalls ?? 0
          return streamedBashOutput(output, sentTweetIds)
        })
      : createAgentSearchTools({
          find_people: (args) => findPeopleStep(args, deadlineAt),
          search_tweets: (args) => searchTweetsStep(args, deadlineAt),
          collect_and_score: (args) =>
            collectAndScoreStep(args, runId, deadlineAt),
          score_tweets: (args) => scoreTweetsStep(args, runId, deadlineAt),
          get_thread: (args) => getThreadStep(args, deadlineAt),
          get_quote_posts: (args) => getQuotePostsStep(args, deadlineAt),
          get_tweets: (args) => getTweetsStep(args, deadlineAt),
          semantic_search: async (args) => {
            if (semanticUsed >= MAX_SEMANTIC_CALLS_PER_RUN) {
              return semanticLimitReached(args.query)
            }
            semanticUsed += 1
            return semanticSearchStep(args, deadlineAt)
          },
        })
  const agent = new WorkflowAgent({
    // Each planner call records its own usage on this run.
    model: agentSearchModel(input.modelSpec, runId),
    instructions: agentSearchInstructions(input.date, toolMode),
    tools,
  })

  let error: string | null = null
  let text = ''
  const toolCalls: RunSummary['toolCalls'] = []
  const toolOutputs: unknown[] = []
  let parts: unknown[] = []
  let priorTweetIds: string[] = []
  let priorFiles: Record<string, string[]> = {}
  try {
    const context = await loadContextStep(
      input.conversationId,
      input.accountId,
      runId,
    )
    // Stopped before it began: nothing was spent and nothing is recorded.
    if (context.stopped) return { runId }
    priorTweetIds = context.priorTweetIds
    workspace = context.workspace
    priorFiles = Object.fromEntries(
      Object.entries(context.workspace).flatMap(([path, file]) =>
        file.kind === 'tweets' ? [[path, file.rows.map((row) => row.id)]] : [],
      ),
    )
    const question =
      toolMode === 'bash'
        ? questionWithWorkspace(input.question, describeManifest(workspace))
        : input.question
    const result = await agent.stream({
      messages: [...context.messages, { role: 'user', content: question }],
      writable: getWritable<ModelCallStreamPart>(),
      stopWhen: [isStepCount(AGENT_SEARCH_MAX_STEPS), toolsKeepFailing],
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
    priorFiles,
    error,
  })
  if (error) throw new Error(error)
  return { runId }
}
