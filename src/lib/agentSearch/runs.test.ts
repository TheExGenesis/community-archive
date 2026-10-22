import {
  closeEndedRuns,
  ENDED_WITHOUT_RESULT,
  NEVER_STARTED,
  newSearchRunId,
  workflowRunIdOf,
} from './runs'
import type { AgentSearchRun } from './types'

const now = new Date('2026-10-08T10:00:00.000Z')

const running = (
  id: string,
  overrides: Partial<AgentSearchRun> = {},
): AgentSearchRun => ({
  id,
  workflowRunId: `wrun_${id}`,
  accountId: '42',
  question: 'Who?',
  status: 'running',
  model: 'openai:gpt-6.1-sol',
  startedAt: '2026-10-08T09:59:00.000Z',
  completedAt: null,
  answer: null,
  citedTweetIds: [],
  invalidCitationIds: [],
  toolCalls: [],
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  error: null,
  ...overrides,
})

describe('search run ids', () => {
  test('are safe as a file name and distinct from workflow run ids', () => {
    const id = newSearchRunId()
    expect(id).toMatch(/^asr_[0-9a-f]{32}$/)
    expect(newSearchRunId()).not.toBe(id)
  })

  test('older runs used the workflow run id as their own id', () => {
    expect(workflowRunIdOf({ id: 'asr_1', workflowRunId: 'wrun_9' })).toBe(
      'wrun_9',
    )
    expect(workflowRunIdOf({ id: 'wrun_legacy', workflowRunId: null })).toBe(
      'wrun_legacy',
    )
    expect(workflowRunIdOf({ id: 'asr_1', workflowRunId: null })).toBeNull()
  })
})

describe('closeEndedRuns', () => {
  const storeWith = (runs: AgentSearchRun[]) => ({
    listRunning: jest.fn().mockResolvedValue(runs),
    update: jest.fn().mockResolvedValue(undefined),
  })

  test('closes runs whose workflow ended without recording, whatever their age', async () => {
    const store = storeWith([
      running('done'),
      running('crashed'),
      running('cancelled'),
      running('live'),
      running('unknown'),
    ])
    const statuses: Record<string, string | null> = {
      wrun_done: 'completed',
      wrun_crashed: 'failed',
      wrun_cancelled: 'cancelled',
      wrun_live: 'running',
      wrun_unknown: null,
    }
    const closed = await closeEndedRuns(
      store,
      '42',
      async (id) => statuses[id],
      now,
    )
    expect(closed).toEqual(['done', 'crashed', 'cancelled'])
    expect(store.update).toHaveBeenCalledWith('done', {
      status: 'failed',
      error: ENDED_WITHOUT_RESULT,
      completedAt: now.toISOString(),
    })
  })

  test('closes an admitted run whose workflow never started, after a grace period', async () => {
    const store = storeWith([
      running('starting', { workflowRunId: null }),
      running('lost', {
        workflowRunId: null,
        startedAt: '2026-10-08T09:58:00.000Z',
      }),
    ])
    const status = jest.fn()
    expect(await closeEndedRuns(store, '42', status, now)).toEqual(['lost'])
    expect(store.update).toHaveBeenCalledWith(
      'lost',
      expect.objectContaining({ error: NEVER_STARTED }),
    )
    expect(status).not.toHaveBeenCalled()
  })
})
