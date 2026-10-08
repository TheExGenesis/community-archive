import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

/**
 * Model specs are `provider:model`, e.g. `openai:gpt-6.1-sol` or
 * `openrouter:anthropic/claude-sonnet-5.5`. OpenRouter calls carry the same
 * no-retention routing flags as the digest (`src/lib/digest/openai.ts`).
 */
// Planner: multi-step search and weighing conflicting posts, OpenAI's stated
// use for GPT-6.1 Sol. Scorer: high-volume yes/no judgments, GPT-6 Luna's.
// Sources: developers.openai.com/api/docs/models and guides/model-selection.
export const DEFAULT_AGENT_SEARCH_MODEL = 'openai:gpt-6.1-sol'
export const DEFAULT_AGENT_SEARCH_SCORER_MODEL = 'openai:gpt-6-luna'

/**
 * Standard-tier USD per 1M tokens (developers.openai.com/api/docs/pricing,
 * read 2026-10-08). Used for run costs and the daily kill switch; set
 * AGENT_SEARCH_*_USD_PER_MTOK to override or to price other models.
 */
export const MODEL_PRICES_USD_PER_MTOK: Record<
  string,
  { input: number; cachedInput: number; output: number }
> = {
  'openai:gpt-6-astra': { input: 10, cachedInput: 1, output: 50 },
  'openai:gpt-6.1-sol': { input: 2, cachedInput: 0.1, output: 10 },
  'openai:gpt-6-luna': { input: 0.1, cachedInput: 0.01, output: 0.5 },
  'openai:gpt-5.6-terra': { input: 2, cachedInput: 0.2, output: 12 },
}

/** Estimated USD for one model's usage; unknown models cost 0 unless priced by env. */
export function estimateModelCostUsd(
  spec: string,
  usage: {
    inputTokens?: number
    cachedInputTokens?: number
    outputTokens?: number
  },
  env: { input?: string; output?: string } = {},
): number {
  const listed = MODEL_PRICES_USD_PER_MTOK[spec]
  const input =
    env.input !== undefined ? Number(env.input) : (listed?.input ?? 0)
  const output =
    env.output !== undefined ? Number(env.output) : (listed?.output ?? 0)
  const cached = listed?.cachedInput ?? input
  const cachedTokens = Math.min(
    usage.cachedInputTokens ?? 0,
    usage.inputTokens ?? 0,
  )
  const fresh = (usage.inputTokens ?? 0) - cachedTokens
  return (
    (fresh * input +
      cachedTokens * cached +
      (usage.outputTokens ?? 0) * output) /
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
    baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    apiKey,
    includeUsage: true,
    fetch: async (input, init) => {
      // Ask OpenRouter for providers that neither retain nor train on prompts.
      if (typeof init?.body === 'string') {
        const body = JSON.parse(init.body)
        body.provider = { ...body.provider, data_collection: 'deny', zdr: true }
        init = { ...init, body: JSON.stringify(body) }
      }
      return fetch(input, init)
    },
  })(modelId) as ProviderModel
}

const WORKFLOW_SERIALIZE = Symbol.for('workflow-serialize')
const WORKFLOW_DESERIALIZE = Symbol.for('workflow-deserialize')

/**
 * A model that crosses Workflow step boundaries as its spec string only.
 * Provider models serialize their resolved headers, which include the API
 * key, into the durable event log; this wrapper rebuilds the provider from
 * the step's own environment instead.
 */
export class EnvLanguageModel {
  readonly specificationVersion = 'v4' as const
  private resolved?: ProviderModel

  constructor(readonly spec: string) {
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

  doGenerate(options: unknown) {
    return this.inner().doGenerate(options)
  }

  doStream(options: unknown) {
    return this.inner().doStream(options)
  }

  static [WORKFLOW_SERIALIZE](model: EnvLanguageModel) {
    return { spec: model.spec }
  }

  static [WORKFLOW_DESERIALIZE](data: { spec: string }) {
    return new EnvLanguageModel(data.spec)
  }
}

export function agentSearchModel(spec: string): LanguageModel {
  return new EnvLanguageModel(spec) as unknown as LanguageModel
}
