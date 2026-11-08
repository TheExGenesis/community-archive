import {
  DIGEST_CONTENT_FILTER_FALLBACK_MODEL,
  MODEL_REQUEST_TIMEOUT_MS,
  ModelTimeoutError,
  generateDigestWithModel,
  isContentFiltered,
  type DigestGenerationRequest,
  type DigestGenerationResponse,
} from './openai'
import {
  WEEKLY_DIGEST_JSON_SCHEMA,
  WEEKLY_DIGEST_SYSTEM_PROMPT,
  assembleWeeklyDigestContent,
  renderWeeklyDigestPrompt,
  type WeeklyDigestContent,
  type WeeklySourceEdition,
} from './weekly'

export const WEEKLY_DIGEST_MODEL = 'anthropic/claude-opus-5.5'

const RESPONSE_FORMAT = {
  name: 'community_archive_weekly_digest',
  description:
    'A weekly digest woven only from supplied published daily digest stories.',
  schema: WEEKLY_DIGEST_JSON_SCHEMA as unknown as Record<string, unknown>,
}

/**
 * When a call runs out of time, retry it once with less hidden reasoning and
 * twice the time limit, which together make another timeout much less likely.
 */
export const WEEKLY_TIMEOUT_RETRY = {
  reasoningEffort: 'low',
  timeoutMs: 2 * MODEL_REQUEST_TIMEOUT_MS,
} as const

async function callModel(
  request: DigestGenerationRequest,
  fetchImpl: typeof fetch | undefined,
  onTimeout?: (error: ModelTimeoutError) => void,
): Promise<DigestGenerationResponse> {
  try {
    return await generateDigestWithModel(request, fetchImpl)
  } catch (error) {
    if (!(error instanceof ModelTimeoutError)) throw error
    onTimeout?.(error)
    return generateDigestWithModel(
      { ...request, ...WEEKLY_TIMEOUT_RETRY },
      fetchImpl,
    )
  }
}

export interface WeeklyGenerationResult {
  content: WeeklyDigestContent
  attempts: DigestGenerationResponse[]
  prompt: { system: string; user: string; model: string }
}

/**
 * One structured call, plus at most one repair call that hands the
 * deterministic validation errors back to the model.
 */
export async function generateWeeklyDigest(input: {
  weekStart: string
  editions: WeeklySourceEdition[]
  priorWeeks: WeeklyDigestContent[]
  model?: string
  reasoningEffort?: string
  maxOutputTokens?: number
  fetchImpl?: typeof fetch
  /** Called when a model call times out and is retried more gently. */
  onTimeout?: (error: ModelTimeoutError) => void
}): Promise<WeeklyGenerationResult> {
  const userPrompt = renderWeeklyDigestPrompt(input)
  const attempts: DigestGenerationResponse[] = []
  let model = input.model ?? WEEKLY_DIGEST_MODEL
  let lastError = ''
  let rejected: unknown = null

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt =
      attempt === 1
        ? userPrompt
        : `${userPrompt}\n\nREPAIR THE REJECTED RESPONSE\nThe previous JSON was rejected: ${lastError}\nReturn one corrected JSON object only, preserving everything that was not wrong.\n\nREJECTED RESPONSE\n${JSON.stringify(rejected)}`
    const request = {
      runId: `weekly-${input.weekStart}`,
      systemPrompt: WEEKLY_DIGEST_SYSTEM_PROMPT,
      userPrompt: prompt,
      reasoningEffort: input.reasoningEffort ?? 'medium',
      maxOutputTokens: input.maxOutputTokens ?? 16_000,
      responseFormat: RESPONSE_FORMAT,
    }
    let generated = await callModel(
      { ...request, model },
      input.fetchImpl,
      input.onTimeout,
    )
    attempts.push(generated)
    if (
      isContentFiltered(generated) &&
      model !== DIGEST_CONTENT_FILTER_FALLBACK_MODEL
    ) {
      model = DIGEST_CONTENT_FILTER_FALLBACK_MODEL
      generated = await callModel(
        { ...request, model },
        input.fetchImpl,
        input.onTimeout,
      )
      attempts.push(generated)
    }
    rejected = generated.output
    try {
      if (generated.outputError) throw new Error(generated.outputError)
      const content = assembleWeeklyDigestContent({
        weekStart: input.weekStart,
        editions: input.editions,
        priorWeeks: input.priorWeeks,
        modelOutput: generated.output,
      })
      return {
        content,
        attempts,
        prompt: {
          system: WEEKLY_DIGEST_SYSTEM_PROMPT,
          user: userPrompt,
          model,
        },
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt === 2) throw error
    }
  }
  throw new Error(lastError || 'Weekly digest generation failed')
}
