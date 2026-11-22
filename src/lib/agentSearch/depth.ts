import type { ReasoningEffort } from './model'

// How hard one question is searched. Fast is the default: a single round of
// gathering on low reasoning effort. Deep is the long search Ask ran before
// depths existed. Plain values only: the workflow body, the start route, the
// page and the eval all read this module.

export type AgentSearchDepth = 'fast' | 'deep'

/** What a new question gets when the request names no depth. */
export const DEFAULT_AGENT_SEARCH_DEPTH: AgentSearchDepth = 'fast'

/**
 * A run started before depths existed carries none in its workflow input. It
 * searched deep, and a replay must keep its 20 steps and its model's effort.
 */
export const LEGACY_AGENT_SEARCH_DEPTH: AgentSearchDepth = 'deep'

export interface AgentSearchProfile {
  /**
   * The planner's reasoning effort for the run. Null leaves the model's own
   * (MODEL_REASONING_EFFORT in model.ts). AGENT_SEARCH_REASONING_EFFORT, when
   * set, overrides both.
   */
  reasoningEffort: ReasoningEffort | null
  /** Model steps; the last one must answer without tools. */
  maxSteps: number
  /**
   * Semantic searches one question may run. At 1 to 5 s each, deep's 6 stay
   * within about a tenth of the run deadline and leave most of the 20 steps
   * for keyword search, reading and scoring.
   */
  maxSemanticCalls: number
}

export const AGENT_SEARCH_PROFILES: Record<
  AgentSearchDepth,
  AgentSearchProfile
> = {
  fast: { reasoningEffort: 'low', maxSteps: 8, maxSemanticCalls: 2 },
  deep: { reasoningEffort: null, maxSteps: 20, maxSemanticCalls: 6 },
}

/** `fast` or `deep` from a request field or flag; null for anything else. */
export function parseAgentSearchDepth(value: unknown): AgentSearchDepth | null {
  return value === 'fast' || value === 'deep' ? value : null
}
