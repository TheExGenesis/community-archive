import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import {
  OWN_KEY_ERRORS,
  ownKeyErrorForStatus,
  ownKeySecret,
  unsealOwnKey,
} from './ownKey'

/**
 * Model specs are `provider:model`, e.g. `openai:gpt-6.1-sol` or
 * `openrouter:anthropic/claude-sonnet-5.5`. OpenRouter calls carry the same
 * no-retention routing flags as the digest (`src/lib/digest/openai.ts`).
 */
// Planner: DeepSeek V4.1 Flash on OpenRouter (chosen 2026-10-13; GPT-6.1 Sol
// stays available through AGENT_SEARCH_MODEL). Scorer: high-volume yes/no
// judgments on OpenAI's Decisions API with GPT-6 Luna.
export const DEFAULT_AGENT_SEARCH_MODEL =
  'openrouter:deepseek/deepseek-v4.1-flash'
export const DEFAULT_AGENT_SEARCH_SCORER_MODEL = 'openai:gpt-6-luna'

export interface ModelPrice {
  input: number
  cachedInput: number
  output: number
}

/**
 * Standard-tier USD per 1M tokens (developers.openai.com/api/docs/pricing,
 * read 2026-10-08). Used for run costs and the daily kill switch. A model not
 * listed here needs AGENT_SEARCH_*_USD_PER_MTOK prices, or no run starts.
 */
export const MODEL_PRICES_USD_PER_MTOK: Record<string, ModelPrice> = {
  'openai:gpt-6-astra': { input: 10, cachedInput: 1, output: 50 },
  'openai:gpt-6.1-sol': { input: 2, cachedInput: 0.1, output: 10 },
  'openai:gpt-6-luna': { input: 0.1, cachedInput: 0.01, output: 0.5 },
  'openai:gpt-5.6-terra': { input: 2, cachedInput: 0.2, output: 12 },
  // OpenRouter's listed price (openrouter.ai/api/v1/models, read 2026-10-13).
  // Most endpoints charge this or less, so it is an upper estimate; the local
  // call log records what OpenRouter actually charged (providerCostUsd).
  'openrouter:deepseek/deepseek-v4.1-flash': {
    input: 0.3,
    cachedInput: 0.006,
    output: 1.2,
  },
  // Together's price, the highest standard endpoint (openrouter.ai endpoints
  // API, read 2026-11-22). Priority endpoints cost more (baseten/fast is
  // 0.6 / 0.014 / 2.4), so a run pinned to one needs the price env overrides.
  'openrouter:deepseek/deepseek-v4.1-flash-1017': {
    input: 0.3,
    cachedInput: 0.006,
    output: 1.2,
  },
  // Together's price (endpoints API, read 2026-11-22).
  'openrouter:z-ai/glm-5.3-flash': {
    input: 0.15,
    cachedInput: 0.03,
    output: 0.5,
  },
}

/** Price overrides as read from the environment, still unparsed. */
export interface PriceEnv {
  input?: string
  cachedInput?: string
  output?: string
}

export function plannerPriceEnv(
  env: NodeJS.ProcessEnv = process.env,
): PriceEnv {
  return {
    input: env.AGENT_SEARCH_INPUT_USD_PER_MTOK,
    cachedInput: env.AGENT_SEARCH_CACHED_INPUT_USD_PER_MTOK,
    output: env.AGENT_SEARCH_OUTPUT_USD_PER_MTOK,
  }
}

export function scorerPriceEnv(env: NodeJS.ProcessEnv = process.env): PriceEnv {
  return {
    input: env.AGENT_SEARCH_SCORER_INPUT_USD_PER_MTOK,
    cachedInput: env.AGENT_SEARCH_SCORER_CACHED_INPUT_USD_PER_MTOK,
    output: env.AGENT_SEARCH_SCORER_OUTPUT_USD_PER_MTOK,
  }
}

// A price that is set but is not a finite, non-negative number is a
// configuration error, never a silent $0.
function parsePrice(value: string | undefined, label: string) {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${label} price: ${JSON.stringify(value)}`)
  }
  return parsed
}

/**
 * A model's price: env overrides on top of the listed price. Null when the
 * model has no input or output price; throws when an override is malformed.
 * An input override without a cached-input override charges cached tokens at
 * the override, not at the listed model's cached rate.
 */
export function resolveModelPrice(
  spec: string,
  env: PriceEnv = {},
): ModelPrice | null {
  const listed = MODEL_PRICES_USD_PER_MTOK[spec]
  const inputEnv = parsePrice(env.input, 'input')
  const cachedEnv = parsePrice(env.cachedInput, 'cached input')
  const outputEnv = parsePrice(env.output, 'output')
  const input = inputEnv ?? listed?.input
  const output = outputEnv ?? listed?.output
  if (input === undefined || output === undefined) return null
  const cachedInput =
    cachedEnv ??
    (inputEnv === undefined ? listed?.cachedInput : undefined) ??
    input
  return { input, cachedInput, output }
}

/** Estimated USD for one model's usage. Throws for a model with no price. */
export function estimateModelCostUsd(
  spec: string,
  usage: {
    inputTokens?: number
    cachedInputTokens?: number
    outputTokens?: number
  },
  env: PriceEnv = {},
): number {
  const price = resolveModelPrice(spec, env)
  if (!price) throw new Error(`No price configured for ${spec}`)
  const inputTokens = usage.inputTokens ?? 0
  const cachedTokens = Math.min(usage.cachedInputTokens ?? 0, inputTokens)
  return (
    ((inputTokens - cachedTokens) * price.input +
      cachedTokens * price.cachedInput +
      (usage.outputTokens ?? 0) * price.output) /
    1e6
  )
}

export type ReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

const REASONING_EFFORTS = new Set<string>([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])

/**
 * The planner's reasoning effort, per model. A model left to its provider's
 * default runs at an effort nobody chose: on OpenRouter Gemini 3.5 Flash-Lite
 * defaults to minimal and reasoned 0 tokens, and GPT-6.1 Sol called directly
 * reasoned a median 85 tokens a turn (pilot runs, 2026-11-16). DeepSeek's
 * entries are its OpenRouter default, written down. GLM-5.3-Flash defaults to
 * max on OpenRouter; high matches DeepSeek's effort for comparison.
 */
export const MODEL_REASONING_EFFORT: Record<string, ReasoningEffort> = {
  'openrouter:deepseek/deepseek-v4.1-flash': 'high',
  'openrouter:deepseek/deepseek-v4.1-flash-1017': 'high',
  'openrouter:z-ai/glm-5.3-flash': 'high',
  'openrouter:google/gemini-4-hydrogen': 'medium',
  'openrouter:google/gemini-3.5-flash-lite': 'high',
  'openrouter:openai/gpt-6.1-sol': 'medium',
  'openai:gpt-6.1-sol': 'medium',
}

/**
 * The effort to ask the planner for: AGENT_SEARCH_REASONING_EFFORT, else the
 * model's entry above. Null sends nothing, leaving the provider's default;
 * `default` in the env asks for that explicitly. Throws on an unknown value.
 */
export function agentSearchReasoningEffort(
  spec: string,
  value = process.env.AGENT_SEARCH_REASONING_EFFORT,
): ReasoningEffort | null {
  const effort = value?.trim().toLowerCase()
  if (!effort) return MODEL_REASONING_EFFORT[spec] ?? null
  if (effort === 'default') return null
  if (!REASONING_EFFORTS.has(effort)) {
    throw new Error(
      `Invalid AGENT_SEARCH_REASONING_EFFORT: ${JSON.stringify(value)}`,
    )
  }
  return effort as ReasoningEffort
}

export function agentSearchScorerModelSpec(
  value = process.env.AGENT_SEARCH_SCORER_MODEL,
): string {
  return value?.trim() || DEFAULT_AGENT_SEARCH_SCORER_MODEL
}

type ProviderModel = Exclude<LanguageModel, string>

export function agentSearchModelSpec(
  value = process.env.AGENT_SEARCH_MODEL,
): string {
  return value?.trim() || DEFAULT_AGENT_SEARCH_MODEL
}

export function parseModelSpec(spec: string): {
  provider: 'openai' | 'openrouter'
  modelId: string
} {
  const separator = spec.indexOf(':')
  const provider = spec.slice(0, separator)
  const modelId = spec.slice(separator + 1)
  if (separator < 1 || !modelId) throw new Error(`Invalid model spec: ${spec}`)
  if (provider !== 'openai' && provider !== 'openrouter') {
    throw new Error(`Unsupported model provider: ${provider}`)
  }
  return { provider, modelId }
}

/**
 * How the planner's OpenRouter calls pick a provider, on top of the
 * no-retention filter every call carries (openrouter.ai/docs, provider
 * selection and prompt caching, read 2026-11-22):
 * - `sessionId` goes out as `session_id`, so OpenRouter keeps a run on one
 *   provider from its first call and the prompt cache stays warm. Without it,
 *   sticky routing starts only after a cache hit.
 * - `maxLatencyP90` (seconds) goes out as `preferred_max_latency`: providers
 *   slower than that at p90 over the last five minutes move down the list.
 *   It never blocks a call, and it keeps OpenRouter's default routing (unlike
 *   `order` or `sort`, which replace it).
 * - `only` and `ignore` are provider slugs (`together`, `baseten/fast`), for
 *   runs pinned to one host and for skipping one.
 */
export interface PlannerRouting {
  sessionId?: string
  maxLatencyP90?: number | null
  only?: string[]
  ignore?: string[]
}

/** Seconds; per-call median time to first output is 0.7-1.8 s by host. */
export const DEFAULT_PROVIDER_MAX_LATENCY_P90 = 2

function providerSlugs(value: string | undefined): string[] | undefined {
  const slugs = value
    ?.split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)
  return slugs?.length ? slugs : undefined
}

/**
 * The planner's routing for a session: AGENT_SEARCH_PROVIDER_MAX_LATENCY_P90
 * (seconds, or `off`), AGENT_SEARCH_PROVIDER_ONLY and
 * AGENT_SEARCH_PROVIDER_IGNORE (comma-separated slugs). Throws on a latency
 * that is not a positive number.
 */
export function plannerRouting(
  sessionId: string | null,
  env: Record<string, string | undefined> = process.env,
): PlannerRouting {
  const latency =
    env.AGENT_SEARCH_PROVIDER_MAX_LATENCY_P90?.trim().toLowerCase()
  let maxLatencyP90: number | null = DEFAULT_PROVIDER_MAX_LATENCY_P90
  if (latency === 'off') maxLatencyP90 = null
  else if (latency) {
    maxLatencyP90 = Number(latency)
    if (!Number.isFinite(maxLatencyP90) || maxLatencyP90 <= 0) {
      throw new Error(
        `Invalid AGENT_SEARCH_PROVIDER_MAX_LATENCY_P90: ${JSON.stringify(latency)}`,
      )
    }
  }
  const only = providerSlugs(env.AGENT_SEARCH_PROVIDER_ONLY)
  const ignore = providerSlugs(env.AGENT_SEARCH_PROVIDER_IGNORE)
  return {
    ...(sessionId ? { sessionId } : {}),
    maxLatencyP90,
    ...(only ? { only } : {}),
    ...(ignore ? { ignore } : {}),
  }
}

/**
 * Builds the provider model at call time, from environment variables or, for
 * an OpenRouter model, from a member's own key. `routing` applies to
 * OpenRouter calls only; without it a call carries just the no-retention
 * filter (the scorer).
 */
export function createProviderModel(
  spec: string,
  ownKey: string | null = null,
  routing: PlannerRouting = {},
): ProviderModel {
  const { provider, modelId } = parseModelSpec(spec)
  if (provider === 'openai') {
    if (ownKey) throw new Error('Own keys are for OpenRouter models only')
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
    return createOpenAI({ apiKey })(modelId) as ProviderModel
  }
  const apiKey = ownKey ?? process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured')
  const effort = agentSearchReasoningEffort(spec)
  return createOpenAICompatible({
    name: 'openrouter',
    // The Daily Digest's name first (shared OPENROUTER_API_KEY), then ours.
    baseURL:
      process.env.OPENROUTER_API_BASE_URL?.trim() ||
      process.env.OPENROUTER_BASE_URL?.trim() ||
      'https://openrouter.ai/api/v1',
    apiKey,
    includeUsage: true,
    fetch: async (input, init) => {
      // Ask OpenRouter for providers that neither retain nor train on prompts.
      // The two flags go last so no routing option can override them. Usage
      // and cost come in every response without asking; `usage: { include }`
      // is deprecated and ignored (OpenRouter usage accounting docs).
      if (typeof init?.body === 'string') {
        const body = JSON.parse(init.body)
        body.provider = {
          ...body.provider,
          ...(routing.only ? { only: routing.only } : {}),
          ...(routing.ignore ? { ignore: routing.ignore } : {}),
          ...(routing.maxLatencyP90
            ? { preferred_max_latency: { p90: routing.maxLatencyP90 } }
            : {}),
          data_collection: 'deny',
          zdr: true,
        }
        if (routing.sessionId) body.session_id = routing.sessionId
        if (effort) body.reasoning = { ...body.reasoning, effort }
        init = { ...init, body: JSON.stringify(body) }
      }
      return fetch(input, init)
    },
  })(modelId) as ProviderModel
}

const WORKFLOW_SERIALIZE = Symbol.for('workflow-serialize')
const WORKFLOW_DESERIALIZE = Symbol.for('workflow-deserialize')

export interface ModelCallUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

/** What else a planner call reported, for the local call log. */
export interface ModelCallDetail {
  ms: number
  /** When the call was sent. */
  startedAt?: string
  /** Streamed calls: ms to the first reasoning, text or tool-call chunk. */
  firstOutputMs?: number
  /** Streamed calls: ms to the first text or tool-call chunk, after reasoning. */
  firstActionMs?: number
  finishReason?: string
  reasoningTokens?: number
  /** OpenRouter only: the upstream provider that served the call. */
  servedBy?: string
  /** OpenRouter only: what it charged for the call, in USD. */
  providerCostUsd?: number
  /** Paid with the member's own key: not house spend. */
  ownKey?: boolean
}

const tokenCount = (
  value: unknown,
  key: 'total' | 'cacheRead' | 'reasoning',
): number => {
  if (typeof value === 'number') return key === 'total' ? value : 0
  const count = (value as Record<string, unknown> | undefined)?.[key]
  return typeof count === 'number' && Number.isFinite(count) ? count : 0
}

/** Reads provider usage (V4 nested counts, or older flat numbers). */
export function readModelCallUsage(usage: unknown): ModelCallUsage {
  const record = (usage ?? {}) as Record<string, unknown>
  return {
    inputTokens: tokenCount(record.inputTokens, 'total'),
    cachedInputTokens:
      tokenCount(record.inputTokens, 'cacheRead') ||
      tokenCount(record.cachedInputTokens, 'total'),
    outputTokens: tokenCount(record.outputTokens, 'total'),
  }
}

type ModelUsageRecorder = (
  runId: string,
  spec: string,
  usage: ModelCallUsage,
  detail?: ModelCallDetail,
) => Promise<void>

// usage.ts registers the recorder when it loads. This module is also part of
// the sandboxed workflow body, which may not import the run store (Node fs),
// so it cannot import usage.ts itself. The recorder lives on globalThis, not
// in a module variable: when this module is evaluated again (a dev server
// recompiling mid-run did this) while usage.ts is not, a module variable
// would be empty and every later model call would fail.
const RECORDER_KEY = Symbol.for('community-archive.agentSearch.usageRecorder')
type RecorderHolder = { [RECORDER_KEY]?: ModelUsageRecorder | null }

export function setModelUsageRecorder(recorder: ModelUsageRecorder | null) {
  ;(globalThis as RecorderHolder)[RECORDER_KEY] = recorder
}

const modelUsageRecorder = () =>
  (globalThis as RecorderHolder)[RECORDER_KEY] ?? null

async function recordModelCallUsage(
  runId: string,
  spec: string,
  usage: unknown,
  detail: ModelCallDetail,
) {
  // Fail closed: a model call that cannot be counted must not pass silently.
  const recorder = modelUsageRecorder()
  if (!recorder) {
    throw new Error('Agent search usage recorder is not registered')
  }
  const outputTokens = (usage as Record<string, unknown> | null)?.outputTokens
  await recorder(runId, spec, readModelCallUsage(usage), {
    ...detail,
    reasoningTokens: tokenCount(outputTokens, 'reasoning'),
  })
}

// V4 finish reasons are { unified, raw }; older ones are plain strings.
function finishReasonText(reason: unknown): string | undefined {
  if (typeof reason === 'string') return reason
  const unified = (reason as { unified?: unknown } | null)?.unified
  return typeof unified === 'string' ? unified : undefined
}

// An OpenRouter stream chunk names the provider that served it, and the
// last one (with usage accounting on) carries the call's cost.
function readOpenRouterChunk(raw: unknown, detail: ModelCallDetail) {
  const chunk = raw as {
    provider?: unknown
    usage?: { cost?: unknown }
  } | null
  if (typeof chunk?.provider === 'string') detail.servedBy = chunk.provider
  const cost = chunk?.usage?.cost
  if (typeof cost === 'number' && Number.isFinite(cost)) {
    detail.providerCostUsd = cost
  }
}

// --- Reasoning across tool calls ---------------------------------------------
// OpenRouter returns a model's reasoning as `reasoning_details` and asks for
// it back, unmodified, on the assistant message that made the tool calls
// (openrouter.ai/docs/guides/best-practices/reasoning-tokens, "Preserving
// Reasoning"). Gemini's carry its thought signature: without them Gemini 3.5
// Flash-Lite ended its third call with MALFORMED_FUNCTION_CALL in 3 runs of 3,
// and DeepSeek V4.1 Flash, given its own back, answered a question in 112 s
// that it had circled on for 226 s without answering (pilot, 2026-11-16).
//
// @ai-sdk/openai-compatible neither reads nor returns the field, and the
// agents keep no reasoning parts across steps, so the details ride on each
// step's first tool call as provider metadata, which both agents keep in the
// conversation, and move to the message (as `openaiCompatible` options, which
// the provider spreads into the request message) before the next call.

/** Where a tool call carries the reasoning details of its step. */
export const REASONING_DETAILS_KEY = 'openrouter'

type ReasoningDetail = Record<string, unknown> & {
  type?: string
  index?: number
}

const CONCATENATED = ['text', 'summary', 'data'] as const

/**
 * Adds streamed `reasoning_details` pieces to those so far. OpenRouter builds
 * the sequence "by concatenating all chunks in order": a piece with the index
 * and type of the last one extends it; any other starts a new detail.
 */
export function mergeReasoningDetails(
  details: ReasoningDetail[],
  pieces: unknown,
): ReasoningDetail[] {
  if (!Array.isArray(pieces)) return details
  const merged = [...details]
  for (const piece of pieces as ReasoningDetail[]) {
    if (!piece || typeof piece !== 'object') continue
    const last = merged[merged.length - 1]
    if (
      last &&
      piece.index !== undefined &&
      last.index === piece.index &&
      last.type === piece.type
    ) {
      const next: ReasoningDetail = { ...last }
      for (const [key, value] of Object.entries(piece)) {
        if (value === null || value === undefined) continue
        next[key] =
          (CONCATENATED as readonly string[]).includes(key) &&
          typeof value === 'string' &&
          typeof last[key] === 'string'
            ? (last[key] as string) + value
            : value
      }
      merged[merged.length - 1] = next
    } else {
      merged.push({ ...piece })
    }
  }
  return merged
}

/** The step's reasoning details on its first tool call; other parts as they are. */
export function withStepReasoning<T extends { type?: string }>(
  parts: T[],
  details: ReasoningDetail[],
): T[] {
  if (!details.length) return parts
  const first = parts.findIndex((part) => part?.type === 'tool-call')
  if (first === -1) return parts
  return parts.map((part, index) => {
    if (index !== first) return part
    const metadata = (part as { providerMetadata?: Record<string, any> })
      .providerMetadata
    return {
      ...part,
      providerMetadata: {
        ...metadata,
        [REASONING_DETAILS_KEY]: {
          ...metadata?.[REASONING_DETAILS_KEY],
          reasoning_details: details,
        },
      },
    }
  })
}

/**
 * Puts each assistant message's reasoning details, carried on its tool calls,
 * back on the message itself, where OpenRouter reads them.
 */
export function liftReasoningDetails<T>(prompt: T): T {
  if (!Array.isArray(prompt)) return prompt
  return prompt.map((message) => {
    if (message?.role !== 'assistant' || !Array.isArray(message.content)) {
      return message
    }
    const details = (message.content as any[]).flatMap(
      (part) =>
        part?.providerOptions?.[REASONING_DETAILS_KEY]?.reasoning_details ?? [],
    )
    if (!details.length) return message
    return {
      ...message,
      providerOptions: {
        ...message.providerOptions,
        openaiCompatible: {
          ...message.providerOptions?.openaiCompatible,
          reasoning_details: details,
        },
      },
    }
  }) as T
}

// Stream parts that are the model's own output: any of them ends the wait
// for a first token; the action parts end its reasoning.
const ACTION_PARTS = new Set([
  'text-delta',
  'tool-input-start',
  'tool-input-delta',
  'tool-call',
])
const OUTPUT_PARTS = new Set(['reasoning-delta', ...Array.from(ACTION_PARTS)])

/** The error a call on a member's own key failed with, said plainly. */
function ownKeyCallError(error: unknown): unknown {
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  const code = typeof status === 'number' ? ownKeyErrorForStatus(status) : null
  return code ? new Error(OWN_KEY_ERRORS[code]) : error
}

/**
 * A model that crosses Workflow step boundaries as its spec string only.
 * Provider models serialize their resolved headers, which include the API
 * key, into the durable event log; this wrapper rebuilds the provider from
 * the step's own environment instead.
 *
 * With a run id, every call adds its tokens and cost to that run as soon as
 * the provider reports usage, inside the model step itself. A Stop or a
 * failure later in the run then cannot lose what the call cost.
 *
 * With a sealed key (ownKey.ts), calls go out on the member's own OpenRouter
 * key. Only the sealed form crosses step boundaries; it is opened inside the
 * model step, just before the call, and a refusal by OpenRouter is reported
 * as the member's key problem, never retried on the house key.
 */
export class EnvLanguageModel {
  readonly specificationVersion = 'v4' as const
  private resolved?: ProviderModel

  constructor(
    readonly spec: string,
    readonly runId: string | null = null,
    readonly sealedKey: string | null = null,
    /** OpenRouter's sticky-routing key when there is no run id (the eval). */
    readonly sessionId: string | null = null,
  ) {
    parseModelSpec(spec)
  }

  private routing(): PlannerRouting {
    return plannerRouting(this.runId ?? this.sessionId)
  }

  private inner(): any {
    this.resolved ??= createProviderModel(this.spec, null, this.routing())
    return this.resolved
  }

  private async open(): Promise<any> {
    if (!this.sealedKey) return this.inner()
    if (this.resolved) return this.resolved
    const secret = ownKeySecret()
    if (!secret || !this.runId) {
      throw new Error(OWN_KEY_ERRORS.own_key_unavailable)
    }
    const key = await unsealOwnKey(this.sealedKey, this.runId, secret)
    this.resolved = createProviderModel(this.spec, key, this.routing())
    return this.resolved
  }

  private async call<T>(task: (model: any) => Promise<T>): Promise<T> {
    const model = await this.open()
    if (!this.sealedKey) return task(model)
    try {
      return await task(model)
    } catch (error) {
      throw ownKeyCallError(error)
    }
  }

  get provider(): string {
    return parseModelSpec(this.spec).provider
  }

  get modelId(): string {
    return parseModelSpec(this.spec).modelId
  }

  get supportedUrls() {
    // OpenAI-compatible providers support no URLs; a sealed key is opened
    // only inside a call.
    if (this.sealedKey && !this.resolved) return {}
    return this.inner().supportedUrls ?? {}
  }

  /**
   * The call as sent: OpenRouter gets the reasoning details of earlier steps
   * back (its effort goes in the request body, createProviderModel); OpenAI
   * gets the reasoning effort unless the caller chose one.
   */
  private prepareCall(options: any): any {
    if (this.provider === 'openrouter') {
      return options?.prompt
        ? { ...options, prompt: liftReasoningDetails(options.prompt) }
        : options
    }
    const effort = agentSearchReasoningEffort(this.spec)
    if (!effort || options?.providerOptions?.openai?.reasoningEffort) {
      return options
    }
    return {
      ...options,
      providerOptions: {
        ...options?.providerOptions,
        openai: {
          ...options?.providerOptions?.openai,
          reasoningEffort: effort,
        },
      },
    }
  }

  async doGenerate(options: unknown) {
    const startedAt = Date.now()
    const callOptions = this.prepareCall(options)
    let result = await this.call<any>((model) => model.doGenerate(callOptions))
    if (this.provider === 'openrouter' && Array.isArray(result?.content)) {
      const details = mergeReasoningDetails(
        [],
        result.response?.body?.choices?.[0]?.message?.reasoning_details,
      )
      result = {
        ...result,
        content: withStepReasoning(result.content, details),
      }
    }
    if (this.runId)
      await recordModelCallUsage(this.runId, this.spec, result?.usage, {
        ms: Date.now() - startedAt,
        startedAt: new Date(startedAt).toISOString(),
        finishReason: finishReasonText(result?.finishReason),
        ...(this.sealedKey ? { ownKey: true } : {}),
      })
    return result
  }

  async doStream(options: any) {
    const runId = this.runId
    const openRouter = this.provider === 'openrouter'
    const callOptions = this.prepareCall(options)
    if (!runId && !openRouter) {
      return this.call<any>((model) => model.doStream(callOptions))
    }
    const spec = this.spec
    const startedAt = Date.now()
    // OpenRouter's raw chunks say who served the call, what it cost and how
    // the model reasoned. Ask for them, and pass them on only if the caller
    // asked too.
    const peekRaw = openRouter && !callOptions?.includeRawChunks
    const result = await this.call<any>((model) =>
      model.doStream(
        peekRaw ? { ...callOptions, includeRawChunks: true } : callOptions,
      ),
    )
    // Tool calls wait for the end of the stream, so the reasoning details
    // streamed after them still reach the first one.
    let reasoning: ReasoningDetail[] = []
    let toolCalls: any[] = []
    const releaseToolCalls = (
      controller: TransformStreamDefaultController<any>,
    ) => {
      for (const part of withStepReasoning(toolCalls, reasoning)) {
        controller.enqueue(part)
      }
      toolCalls = []
    }
    const detail: ModelCallDetail = {
      ms: 0,
      startedAt: new Date(startedAt).toISOString(),
      ...(this.sealedKey ? { ownKey: true } : {}),
    }
    let usage: unknown = null
    const stream = (result.stream as ReadableStream<any>).pipeThrough(
      new TransformStream<any, any>({
        transform(part, controller) {
          // How long the call took to start answering, and to act.
          const type = part?.type
          if (detail.firstOutputMs === undefined && OUTPUT_PARTS.has(type)) {
            detail.firstOutputMs = Date.now() - startedAt
          }
          if (detail.firstActionMs === undefined && ACTION_PARTS.has(type)) {
            detail.firstActionMs = Date.now() - startedAt
          }
          if (part?.type === 'raw') {
            readOpenRouterChunk(part.rawValue, detail)
            if (openRouter) {
              reasoning = mergeReasoningDetails(
                reasoning,
                part.rawValue?.choices?.[0]?.delta?.reasoning_details,
              )
            }
            if (peekRaw) return
          }
          if (openRouter && part?.type === 'tool-call') {
            toolCalls.push(part)
            return
          }
          if (part?.type === 'finish') {
            releaseToolCalls(controller)
            usage = part.usage
            detail.finishReason = finishReasonText(part.finishReason)
          }
          controller.enqueue(part)
        },
        // A failed write fails the call: the cap must not miss spend.
        async flush(controller) {
          releaseToolCalls(controller)
          if (runId && usage) {
            detail.ms = Date.now() - startedAt
            await recordModelCallUsage(runId, spec, usage, detail)
          }
        },
      }),
    )
    return { ...result, stream }
  }

  // Only the sealed key is written to the event log, never the opened one.
  static [WORKFLOW_SERIALIZE](model: EnvLanguageModel) {
    return {
      spec: model.spec,
      ...(model.runId ? { runId: model.runId } : {}),
      ...(model.sealedKey ? { sealedKey: model.sealedKey } : {}),
      ...(model.sessionId ? { sessionId: model.sessionId } : {}),
    }
  }

  static [WORKFLOW_DESERIALIZE](data: {
    spec: string
    runId?: string
    sealedKey?: string
    sessionId?: string
  }) {
    return new EnvLanguageModel(
      data.spec,
      data.runId ?? null,
      data.sealedKey ?? null,
      data.sessionId ?? null,
    )
  }
}

/**
 * The planner model; pass the run id to record usage on that run (it is also
 * OpenRouter's session id), a sealed key to call on the member's own
 * OpenRouter key, and a session id when there is no run (the eval).
 */
export function agentSearchModel(
  spec: string,
  runId: string | null = null,
  sealedKey: string | null = null,
  sessionId: string | null = null,
): LanguageModel {
  return new EnvLanguageModel(
    spec,
    runId,
    sealedKey,
    sessionId,
  ) as unknown as LanguageModel
}
