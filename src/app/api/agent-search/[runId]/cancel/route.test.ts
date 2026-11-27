/**
 * @jest-environment node
 */
jest.mock('workflow/api', () => ({ getRun: jest.fn() }))
jest.mock('workflow/errors', () => ({
  RunExpiredError: { is: (e: unknown) => (e as any)?.code === 'expired' },
  WorkflowRunNotFoundError: {
    is: (e: unknown) => (e as any)?.code === 'not_found',
  },
}))
jest.mock('@/lib/agentSearch/budget', () => ({
  isLiveRun: (run: { status: string; startedAt: string }) =>
    run.status === 'running' &&
    Date.now() - Date.parse(run.startedAt) < 600_000,
}))
jest.mock('@/lib/agentSearch/eligibility', () => ({
  getAgentSearchAccess: jest.fn(),
}))
jest.mock('@/lib/agentSearch/runStore', () => ({
  getAgentSearchRunStore: jest.fn(),
}))
jest.mock('@/lib/agentSearch/workspace/runCache', () => ({
  clearRunTweetCache: jest.fn(),
}))

import { getRun } from 'workflow/api'
import { getAgentSearchAccess } from '@/lib/agentSearch/eligibility'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import { POST } from './route'

const makeRun = (overrides: Record<string, unknown> = {}) => ({
  id: 'asr_1',
  workflowRunId: 'wrun_1',
  accountId: 'acc_1',
  status: 'running',
  startedAt: new Date().toISOString(),
  ...overrides,
})

const store = {
  get: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
}

const cancelRun = (runId = 'asr_1') =>
  POST(new Request(`http://localhost/api/agent-search/${runId}/cancel`), {
    params: Promise.resolve({ runId }),
  })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAgentSearchAccess).mockResolvedValue({
    ok: true,
    viewer: { accountId: 'acc_1' },
  } as never)
  jest.mocked(getAgentSearchRunStore).mockReturnValue(store as never)
})

test('closes the run when workflow cancel succeeds', async () => {
  const running = makeRun()
  store.get.mockResolvedValue(running)
  jest.mocked(getRun).mockReturnValue({
    cancel: jest.fn().mockResolvedValue(undefined),
    status: Promise.resolve('cancelled'),
  } as never)

  const res = await cancelRun()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ status: 'failed' })
  expect(store.update).toHaveBeenCalledWith(
    'asr_1',
    expect.objectContaining({
      status: 'failed',
      error: 'Stopped by the member',
    }),
  )
})

test('closes a stuck run when the workflow is missing or already terminal', async () => {
  const running = makeRun()
  store.get.mockResolvedValue(running)

  // Missing workflow run (e.g. after a local dev recompile).
  jest.mocked(getRun).mockReturnValue({
    cancel: jest.fn().mockRejectedValue({ code: 'not_found' }),
    get status() {
      return Promise.reject({ code: 'not_found' })
    },
  } as never)
  expect((await cancelRun()).status).toBe(200)
  expect(store.update).toHaveBeenCalledTimes(1)

  // Workflow already failed/terminal when cancel rejects.
  store.update.mockClear()
  jest.mocked(getRun).mockReturnValue({
    cancel: jest.fn().mockRejectedValue(new Error('already terminal')),
    status: Promise.resolve('failed'),
  } as never)
  expect((await cancelRun()).status).toBe(200)
  expect(store.update).toHaveBeenCalledTimes(1)
})

test('closes a stale orphaned run even if workflow cancel errors', async () => {
  const stale = makeRun({
    startedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  })
  store.get.mockResolvedValue(stale)
  jest.mocked(getRun).mockReturnValue({
    cancel: jest.fn().mockRejectedValue(new Error('network blip')),
    get status() {
      return Promise.reject(new Error('network blip'))
    },
  } as never)

  expect((await cancelRun()).status).toBe(200)
  expect(store.update).toHaveBeenCalledTimes(1)
})

test('returns 503 when cancel fails on a fresh live run', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  const running = makeRun()
  store.get.mockResolvedValue(running)
  jest.mocked(getRun).mockReturnValue({
    cancel: jest.fn().mockRejectedValue(new Error('temporary outage')),
    status: Promise.resolve('running'),
  } as never)

  const res = await cancelRun()
  expect(res.status).toBe(503)
  expect(store.update).not.toHaveBeenCalled()
  errSpy.mockRestore()
})

test('keeps a completed answer if the workflow finished during cancel', async () => {
  store.get
    .mockResolvedValueOnce(makeRun())
    .mockResolvedValueOnce(makeRun({ status: 'completed' }))
  jest.mocked(getRun).mockReturnValue({
    cancel: jest.fn().mockRejectedValue(new Error('already completed')),
    status: Promise.resolve('completed'),
  } as never)

  const res = await cancelRun()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ status: 'completed' })
  expect(store.update).not.toHaveBeenCalled()
})
