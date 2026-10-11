import {
  estimateModelCostUsd,
  plannerPriceEnv,
  setModelUsageRecorder,
  type ModelCallUsage,
} from './model'
import { getAgentSearchRunStore, type RunUsageDelta } from './runStore'

// Spend is added to the run as it happens, by the step that spent it, so the
// global cap counts runs still in progress and a Stop keeps what was spent.
// Writes are increments: a step that records twice (a crash between the write
// and the step's own completion) over-counts, which errs toward the cap.

const ATTEMPTS = 2

export async function recordRunUsage(
  runId: string,
  delta: RunUsageDelta,
): Promise<void> {
  const costUsd = delta.costUsd ?? 0
  if (
    !(delta.inputTokens ?? 0) &&
    !(delta.outputTokens ?? 0) &&
    !(costUsd > 0)
  ) {
    return
  }
  const store = getAgentSearchRunStore()
  let lastError: unknown
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await store.addUsage(runId, delta)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

/** One planner call's tokens and estimated cost. */
export async function recordModelUsage(
  runId: string,
  spec: string,
  usage: ModelCallUsage,
): Promise<void> {
  await recordRunUsage(runId, {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: estimateModelCostUsd(spec, usage, plannerPriceEnv()),
  })
}

// Planner calls run inside Workflow's model step. That step's bundle loads
// this module through the paid tool steps in src/workflows/agentSearch.ts,
// so the run's model records its usage here (see EnvLanguageModel).
setModelUsageRecorder(recordModelUsage)

/** A paid tool's spend, whether the tool succeeded or threw. */
export function spentBy(value: unknown): number {
  const cost = (value as { costUsd?: unknown } | null | undefined)?.costUsd
  return typeof cost === 'number' && Number.isFinite(cost) && cost > 0
    ? cost
    : 0
}

/**
 * Runs a paid tool and adds its classifier cost to the run before returning
 * or rethrowing. Errors from the scorer carry the cost of the calls that
 * succeeded before the failure (see ScoringError).
 */
export async function withRecordedCost<T>(
  runId: string,
  task: () => Promise<T>,
): Promise<T> {
  let result: T
  try {
    result = await task()
  } catch (error) {
    await recordRunUsage(runId, { costUsd: spentBy(error) })
    throw error
  }
  await recordRunUsage(runId, { costUsd: spentBy(result) })
  return result
}
