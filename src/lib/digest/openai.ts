import { DIGEST_STORY_CATEGORIES } from './types'

export const DIGEST_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'executive_summary',
    'representative_tweet_index',
    'stories',
    'keywords',
  ],
  properties: {
    executive_summary: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: { type: 'string', minLength: 35, maxLength: 140 },
    },
    representative_tweet_index: {
      type: 'integer',
      minimum: 0,
      description:
        'The zero-based corpus index of the most representative or iconic tweet.',
    },
    stories: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'category',
          'title',
          'subtitle',
          'bullets',
          'editorial_note',
          'tweet_indices',
        ],
        properties: {
          category: {
            type: 'string',
            enum: DIGEST_STORY_CATEGORIES,
          },
          title: { type: 'string', minLength: 8, maxLength: 110 },
          subtitle: { type: 'string', minLength: 60, maxLength: 150 },
          bullets: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: { type: 'string', minLength: 12, maxLength: 220 },
          },
          editorial_note: {
            type: 'string',
            minLength: 30,
            maxLength: 360,
          },
          tweet_indices: {
            type: 'array',
            minItems: 1,
            maxItems: 18,
            uniqueItems: true,
            items: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
    keywords: {
      type: 'array',
      minItems: 3,
      maxItems: 12,
      items: { type: 'string', minLength: 2, maxLength: 60 },
    },
  },
} as const

export interface DigestGenerationRequest {
  runId: string
  model: string
  systemPrompt: string
  userPrompt: string
  reasoningEffort?: string
  maxOutputTokens?: number
  temperature?: number
}

export interface DigestGenerationResponse {
  response: Record<string, unknown>
  output: unknown
  outputError: string | null
  responseId: string | null
  model: string
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
}

const MODEL_REQUEST_TIMEOUT_MS = 240_000

const safeTokenCount = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

const fetchModelResponse = async (
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  provider: string,
): Promise<Response> => {
  try {
    return await fetchImpl(input, {
      ...init,
      signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      throw new Error(
        `${provider} generation timed out after ${MODEL_REQUEST_TIMEOUT_MS / 1_000} seconds`,
      )
    }
    throw error
  }
}

export function extractResponseText(response: Record<string, unknown>): string {
  if (typeof response.output_text === 'string') return response.output_text
  if (!Array.isArray(response.output)) {
    throw new Error('Model response did not include output text')
  }
  for (const item of response.output) {
    if (!item || typeof item !== 'object') continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (
        part &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type === 'output_text' &&
        typeof (part as { text?: unknown }).text === 'string'
      ) {
        return (part as { text: string }).text
      }
    }
  }
  throw new Error('Model response did not include output text')
}

export async function generateDigestWithModel(
  request: DigestGenerationRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<DigestGenerationResponse> {
  const isOpenRouter = request.model.includes('/')
  const isDeepSeek = request.model.startsWith('deepseek-')
  const provider = isOpenRouter
    ? 'OpenRouter'
    : isDeepSeek
      ? 'DeepSeek'
      : 'OpenAI'
  const apiKey = isOpenRouter
    ? process.env.OPENROUTER_API_KEY
    : isDeepSeek
      ? process.env.DEEPSEEK_API_KEY
      : process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      `${isOpenRouter ? 'OPENROUTER_API_KEY' : isDeepSeek ? 'DEEPSEEK_API_KEY' : 'OPENAI_API_KEY'} is not configured`,
    )
  }

  if (isOpenRouter) {
    const baseUrl = (
      process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1'
    ).replace(/\/$/, '')
    const body: Record<string, unknown> = {
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      provider: { data_collection: 'deny', zdr: true },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'community_archive_daily_digest',
          strict: true,
          schema: DIGEST_JSON_SCHEMA,
        },
      },
    }
    if (request.reasoningEffort) {
      body.reasoning = { effort: request.reasoningEffort, exclude: true }
    }
    if (request.maxOutputTokens) body.max_tokens = request.maxOutputTokens
    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    const response = await fetchModelResponse(
      fetchImpl,
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://community-archive.org',
          'X-Title': 'Community Archive Daily Digest',
        },
        body: JSON.stringify(body),
      },
      provider,
    )
    const responseText = await response.text()
    if (!response.ok) {
      throw new Error(
        `OpenRouter generation failed (${response.status}): ${responseText.slice(0, 500)}`,
      )
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(responseText) as Record<string, unknown>
    } catch {
      throw new Error('OpenRouter generation returned invalid JSON')
    }
    const choice = Array.isArray(payload.choices) ? payload.choices[0] : null
    const message =
      choice && typeof choice === 'object'
        ? (choice as { message?: unknown }).message
        : null
    const outputText =
      message && typeof message === 'object'
        ? (message as { content?: unknown }).content
        : null
    let output: unknown = null
    let outputError: string | null = null
    if (typeof outputText !== 'string') {
      outputError = 'OpenRouter response did not include output text'
    } else {
      try {
        output = JSON.parse(outputText)
      } catch {
        output = outputText
        outputError = 'OpenRouter structured output was not valid JSON'
      }
    }
    const usage =
      payload.usage && typeof payload.usage === 'object'
        ? (payload.usage as Record<string, unknown>)
        : {}
    const inputTokens = safeTokenCount(usage.prompt_tokens)
    const outputTokens = safeTokenCount(usage.completion_tokens)
    const totalTokens = safeTokenCount(usage.total_tokens)

    return {
      response: payload,
      output,
      outputError,
      responseId: typeof payload.id === 'string' ? payload.id : null,
      model: typeof payload.model === 'string' ? payload.model : request.model,
      inputTokens,
      outputTokens,
      totalTokens:
        totalTokens ??
        (inputTokens !== null && outputTokens !== null
          ? inputTokens + outputTokens
          : null),
    }
  }

  const baseUrl = (
    isDeepSeek
      ? process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com'
      : process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1'
  ).replace(/\/$/, '')
  const body: Record<string, unknown> = {
    model: request.model,
    instructions: request.systemPrompt,
    input: request.userPrompt,
    text: {
      format: {
        type: 'json_schema',
        name: 'community_archive_daily_digest',
        schema: DIGEST_JSON_SCHEMA,
      },
    },
  }
  if (!isDeepSeek) {
    body.store = false
    body.metadata = { digest_run_id: request.runId }
    body.text = {
      ...(body.text as Record<string, unknown>),
      verbosity: 'low',
      format: {
        ...((body.text as { format: Record<string, unknown> }).format ?? {}),
        description:
          'A concise daily digest assembled only from supplied tweet snapshots.',
        strict: true,
      },
    }
  }
  if (request.reasoningEffort) {
    body.reasoning = { effort: request.reasoningEffort }
  }
  if (request.maxOutputTokens) {
    body.max_output_tokens = request.maxOutputTokens
  }

  const response = await fetchModelResponse(
    fetchImpl,
    `${baseUrl}/responses`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    provider,
  )
  const responseText = await response.text()
  if (!response.ok) {
    throw new Error(
      `${provider} generation failed (${response.status}): ${responseText.slice(0, 500)}`,
    )
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(responseText) as Record<string, unknown>
  } catch {
    throw new Error(`${provider} generation returned invalid JSON`)
  }
  let outputText: string
  try {
    outputText = extractResponseText(payload)
  } catch {
    outputText = ''
  }
  let output: unknown = null
  let outputError: string | null = null
  if (!outputText) {
    outputError = `${provider} response did not include output text`
  } else {
    try {
      output = JSON.parse(outputText)
    } catch {
      output = outputText
      outputError = `${provider} structured output was not valid JSON`
    }
  }
  const usage =
    payload.usage && typeof payload.usage === 'object'
      ? (payload.usage as Record<string, unknown>)
      : {}

  return {
    response: payload,
    output,
    outputError,
    responseId: typeof payload.id === 'string' ? payload.id : null,
    model: typeof payload.model === 'string' ? payload.model : request.model,
    inputTokens: safeTokenCount(usage.input_tokens),
    outputTokens: safeTokenCount(usage.output_tokens),
    totalTokens: safeTokenCount(usage.total_tokens),
  }
}
