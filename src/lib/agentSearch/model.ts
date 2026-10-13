import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

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

/** Builds the provider model from environment variables at call time. */
export function createProviderModel(spec: string): ProviderModel {
  const { provider, modelId } = parseModelSpec(spec)
  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
    return createOpenAI({ apiKey })(modelId) as ProviderModel
  }
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured')
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
      if (typeof init?.body === 'string') {
        const body = JSON.parse(init.body)
        body.provider = { ...body.provider, data_collection: 'deny', zdr: true }
        // Usage accounting: the final chunk reports what the call cost.
        body.usage = { include: true }
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
  finishReason?: string
  reasoningTokens?: number
  /** OpenRouter only: the upstream provider that served the call. */
  servedBy?: string
  /** OpenRouter only: what it charged for the call, in USD. */
  providerCostUsd?: number
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

/**
 * A model that crosses Workflow step boundaries as its spec string only.
 * Provider models serialize their resolved headers, which include the API
 * key, into the durable event log; this wrapper rebuilds the provider from
 * the step's own environment instead.
 *
 * With a run id, every call adds its tokens and cost to that run as soon as
 * the provider reports usage, inside the model step itself. A Stop or a
 * failure later in the run then cannot lose what the call cost.
 */
export class EnvLanguageModel {
  readonly specificationVersion = 'v4' as const
  private resolved?: ProviderModel

  constructor(
    readonly spec: string,
    readonly runId: string | null = null,
  ) {
    parseModelSpec(spec)
  }

  private inner(): any {
    this.resolved ??= createProviderModel(this.spec)
    return this.resolved
  }

  get provider(): string {
    return parseModelSpec(this.spec).provider
  }

  get modelId(): string {
    return parseModelSpec(this.spec).modelId
  }

  get supportedUrls() {
    return this.inner().supportedUrls ?? {}
  }

  async doGenerate(options: unknown) {
    const startedAt = Date.now()
    const result = await this.inner().doGenerate(options)
    if (this.runId)
      await recordModelCallUsage(this.runId, this.spec, result?.usage, {
        ms: Date.now() - startedAt,
        finishReason: finishReasonText(result?.finishReason),
      })
    return result
  }

  async doStream(options: any) {
    const runId = this.runId
    if (!runId) return this.inner().doStream(options)
    const spec = this.spec
    const startedAt = Date.now()
    // OpenRouter's raw chunks say who served the call and what it cost. Ask
    // for them, and pass them on only if the caller asked too.
    const peekRaw = this.provider === 'openrouter' && !options?.includeRawChunks
    const result = await this.inner().doStream(
      peekRaw ? { ...options, includeRawChunks: true } : options,
    )
    const detail: ModelCallDetail = { ms: 0 }
    let usage: unknown = null
    const stream = (result.stream as ReadableStream<any>).pipeThrough(
      new TransformStream<any, any>({
        transform(part, controller) {
          if (part?.type === 'raw') {
            readOpenRouterChunk(part.rawValue, detail)
            if (peekRaw) return
          }
          if (part?.type === 'finish') {
            usage = part.usage
            detail.finishReason = finishReasonText(part.finishReason)
          }
          controller.enqueue(part)
        },
        // A failed write fails the call: the cap must not miss spend.
        async flush() {
          if (usage) {
            detail.ms = Date.now() - startedAt
            await recordModelCallUsage(runId, spec, usage, detail)
          }
        },
      }),
    )
    return { ...result, stream }
  }

  static [WORKFLOW_SERIALIZE](model: EnvLanguageModel) {
    return model.runId
      ? { spec: model.spec, runId: model.runId }
      : { spec: model.spec }
  }

  static [WORKFLOW_DESERIALIZE](data: { spec: string; runId?: string }) {
    return new EnvLanguageModel(data.spec, data.runId ?? null)
  }
}

/** The planner model; pass the run id to record usage on that run. */
export function agentSearchModel(
  spec: string,
  runId: string | null = null,
): LanguageModel {
  return new EnvLanguageModel(spec, runId) as unknown as LanguageModel
}
