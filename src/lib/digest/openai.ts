import { DIGEST_STORY_CATEGORIES } from './types'

const DIGEST_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['executive_summary', 'stories', 'trending_keywords'],
  properties: {
    executive_summary: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: { type: 'string', minLength: 30, maxLength: 220 },
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
          'keyword',
          'title',
          'subtitle',
          'bullets',
          'editorial_note',
          'banger_tweet_ids',
          'commentary_tweet_ids',
        ],
        properties: {
          category: {
            type: 'string',
            enum: DIGEST_STORY_CATEGORIES,
          },
          keyword: { type: 'string', minLength: 2, maxLength: 60 },
          title: { type: 'string', minLength: 8, maxLength: 140 },
          subtitle: { type: 'string', minLength: 50, maxLength: 320 },
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
          banger_tweet_ids: {
            type: 'array',
            minItems: 1,
            maxItems: 6,
            items: { type: 'string', pattern: '^\\d{1,20}$' },
          },
          commentary_tweet_ids: {
            type: 'array',
            maxItems: 5,
            items: { type: 'string', pattern: '^\\d{1,20}$' },
          },
        },
      },
    },
    trending_keywords: {
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

const safeTokenCount = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export function extractResponseText(response: Record<string, unknown>): string {
  if (typeof response.output_text === 'string') return response.output_text
  if (!Array.isArray(response.output)) {
    throw new Error('OpenAI response did not include output text')
  }
  for (const item of response.output) {
    if (!item || typeof item !== 'object') continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (
        part &&
        typeof part === 'object' &&
        typeof (part as { text?: unknown }).text === 'string'
      ) {
        return (part as { text: string }).text
      }
    }
  }
  throw new Error('OpenAI response did not include output text')
}

export async function generateDigestWithOpenAI(
  request: DigestGenerationRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<DigestGenerationResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const baseUrl = (
    process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1'
  ).replace(/\/$/, '')
  const body: Record<string, unknown> = {
    model: request.model,
    store: false,
    instructions: request.systemPrompt,
    input: request.userPrompt,
    metadata: { digest_run_id: request.runId },
    text: {
      verbosity: 'low',
      format: {
        type: 'json_schema',
        name: 'community_archive_daily_digest',
        description:
          'A concise daily digest assembled only from supplied tweet snapshots.',
        strict: true,
        schema: DIGEST_JSON_SCHEMA,
      },
    },
  }
  if (request.reasoningEffort) {
    body.reasoning = { effort: request.reasoningEffort }
  }
  if (request.maxOutputTokens) {
    body.max_output_tokens = request.maxOutputTokens
  }

  const response = await fetchImpl(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  })
  const responseText = await response.text()
  if (!response.ok) {
    throw new Error(
      `OpenAI generation failed (${response.status}): ${responseText.slice(0, 500)}`,
    )
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(responseText) as Record<string, unknown>
  } catch {
    throw new Error('OpenAI generation returned invalid JSON')
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
    outputError = 'OpenAI response did not include output text'
  } else {
    try {
      output = JSON.parse(outputText)
    } catch {
      output = outputText
      outputError = 'OpenAI structured output was not valid JSON'
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
