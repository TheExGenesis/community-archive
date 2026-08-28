export interface PersistedGenerationAttempt {
  attempt: number
  recordedAt: string
  accepted: boolean
  error: string | null
  response: Record<string, unknown>
  responseId: string | null
  model: string
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
}

export interface PersistedGenerationExecution {
  execution: number
  startedAt: string
  completedAt: string | null
  status: 'running' | 'completed' | 'failed'
  error: string | null
  attempts: PersistedGenerationAttempt[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isPersistedAttempt = (
  value: unknown,
): value is PersistedGenerationAttempt =>
  isRecord(value) &&
  typeof value.attempt === 'number' &&
  typeof value.recordedAt === 'string' &&
  typeof value.accepted === 'boolean' &&
  isRecord(value.response)

const isPersistedExecution = (
  value: unknown,
): value is PersistedGenerationExecution =>
  isRecord(value) &&
  typeof value.execution === 'number' &&
  typeof value.startedAt === 'string' &&
  Array.isArray(value.attempts) &&
  value.attempts.every(isPersistedAttempt)

export const readGenerationExecutions = (
  rawResponse: unknown,
): PersistedGenerationExecution[] => {
  if (!isRecord(rawResponse) || !Array.isArray(rawResponse.executions))
    return []
  return rawResponse.executions.filter(isPersistedExecution)
}

export const withGenerationExecution = (
  rawResponse: unknown,
  execution: PersistedGenerationExecution,
) => ({
  ...(isRecord(rawResponse) ? rawResponse : {}),
  executions: [
    ...readGenerationExecutions(rawResponse).filter(
      (existing) => existing.execution !== execution.execution,
    ),
    execution,
  ],
})

export const nextGenerationExecution = (
  events: Array<{ stage?: unknown; status?: unknown }>,
) =>
  events.filter(
    ({ stage, status }) => stage === 'generation' && status === 'failed',
  ).length + 1

export const sumPersistedTokens = (
  executions: PersistedGenerationExecution[],
  key: 'inputTokens' | 'outputTokens' | 'totalTokens',
) => {
  const values = executions.flatMap(({ attempts }) =>
    attempts.map((attempt) => attempt[key]),
  )
  return values.length > 0 &&
    values.every((value): value is number => value !== null)
    ? values.reduce((sum, value) => sum + value, 0)
    : null
}
