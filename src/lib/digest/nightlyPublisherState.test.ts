import {
  nextGenerationExecution,
  readGenerationExecutions,
  sumPersistedTokens,
  withGenerationExecution,
  type PersistedGenerationExecution,
} from '../../../services/nightly-digest/state'

const execution = (
  overrides: Partial<PersistedGenerationExecution> = {},
): PersistedGenerationExecution => ({
  execution: 1,
  startedAt: '2026-08-27T06:15:00.000Z',
  completedAt: '2026-08-27T06:18:00.000Z',
  status: 'failed',
  error: 'Story 1 is incomplete',
  attempts: [
    {
      attempt: 1,
      recordedAt: '2026-08-27T06:18:00.000Z',
      accepted: false,
      error: 'Story 1 is incomplete',
      response: { choices: [{ message: { content: '{"stories":[]}' } }] },
      responseId: 'generation-1',
      model: 'z-ai/glm-5.3',
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    },
  ],
  ...overrides,
})

describe('nightly digest retry state', () => {
  test('preserves legacy responses while appending retry executions', () => {
    const legacyAttempt = { id: 'legacy-provider-response' }
    const rawResponse = { attempts: [legacyAttempt] }
    const persisted = withGenerationExecution(rawResponse, execution())

    expect(persisted.attempts).toEqual([legacyAttempt])
    expect(readGenerationExecutions(persisted)).toEqual([execution()])
  })

  test('replaces an in-progress execution after each persisted attempt', () => {
    const running = execution({
      completedAt: null,
      status: 'running',
      error: null,
    })
    const completed = execution({ status: 'completed', error: null })
    const persisted = withGenerationExecution(
      withGenerationExecution(null, running),
      completed,
    )

    expect(readGenerationExecutions(persisted)).toEqual([completed])
  })

  test('numbers a retry after each terminal generation failure', () => {
    expect(
      nextGenerationExecution([
        { stage: 'candidates', status: 'completed' },
        { stage: 'generation', status: 'failed' },
      ]),
    ).toBe(2)
  })

  test('totals persisted usage across failed and successful executions', () => {
    const retry = execution({
      execution: 2,
      status: 'completed',
      error: null,
      attempts: [
        {
          ...execution().attempts[0],
          inputTokens: 200,
          outputTokens: 75,
          totalTokens: 275,
        },
      ],
    })

    expect(sumPersistedTokens([execution(), retry], 'totalTokens')).toBe(425)
  })
})
