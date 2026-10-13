/**
 * @jest-environment node
 */
// The workflow runtime, the AI SDK and the providers are ESM-only or need a
// live runtime; the start route's own decisions are what is tested here.
jest.mock('@ai-sdk/workflow', () => ({
  createModelCallToUIChunkTransform: () => new TransformStream(),
}))
jest.mock('ai', () => ({
  createUIMessageStreamResponse: ({ headers }: { headers: HeadersInit }) =>
    new Response('stream', { headers }),
}))
jest.mock('workflow/api', () => ({ start: jest.fn(), getRun: jest.fn() }))
jest.mock('@/workflows/agentSearch', () => ({ agentSearchWorkflow: {} }))
jest.mock('@/lib/agentSearch/agent', () => ({
  agentSearchToolMode: () => 'bash',
}))
jest.mock('@/lib/agentSearch/eligibility', () => ({
  getAgentSearchAccess: jest.fn(),
  agentSearchAccessStatus: () => 401,
}))
jest.mock('@/lib/agentSearch/runs', () => ({
  closeEndedRuns: jest.fn().mockResolvedValue(undefined),
  newSearchRunId: () => 'asr_1',
}))
jest.mock('@/lib/agentSearch/runStore', () => ({
  getAgentSearchRunStore: jest.fn(),
}))
jest.mock('@/lib/agentSearch/budget', () => ({
  admitAgentSearchRun: jest.fn(),
  agentSearchPricingProblem: () => null,
}))
jest.mock('@/lib/agentSearch/stream', () => ({
  endWithFinish: (stream: ReadableStream) => stream,
  closeWhenRunEnds: (stream: ReadableStream) => stream,
  isTerminalStatus: () => true,
}))
jest.mock('@/lib/agentSearch/openRouterKey', () => ({
  checkOpenRouterKey: jest.fn(),
  ownKeysEnabled: jest.fn(),
}))
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(),
}))

import { start } from 'workflow/api'
import { admitAgentSearchRun } from '@/lib/agentSearch/budget'
import { getAgentSearchAccess } from '@/lib/agentSearch/eligibility'
import {
  checkOpenRouterKey,
  ownKeysEnabled,
} from '@/lib/agentSearch/openRouterKey'
import { unsealOwnKey } from '@/lib/agentSearch/ownKey'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import { POST } from './route'

const KEY = `sk-or-v1-${'d4'.repeat(32)}`
const SECRET = 'a server secret that is long enough to use'

const store = { update: jest.fn(), get: jest.fn() }

const ask = (headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/agent-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({
        id: '3f1c2a44-9b1e-4d2a-8c3f-2b6a1e0d9c11',
        question: 'Who tweets about Singapore?',
      }),
    }),
  )

beforeEach(() => {
  jest.clearAllMocks()
  process.env.AGENT_SEARCH_KEY_SECRET = SECRET
  jest.mocked(getAgentSearchAccess).mockResolvedValue({
    ok: true,
    viewer: { accountId: '42', userId: 'u', preview: false },
  })
  jest.mocked(getAgentSearchRunStore).mockReturnValue(store as never)
  store.update.mockResolvedValue(undefined)
  store.get.mockResolvedValue({ status: 'running' })
  jest.mocked(admitAgentSearchRun).mockResolvedValue({ ok: true })
  jest.mocked(ownKeysEnabled).mockReturnValue(true)
  jest
    .mocked(checkOpenRouterKey)
    .mockResolvedValue({ ok: true, limitRemaining: null })
  jest.mocked(start).mockResolvedValue({
    runId: 'wrun_1',
    readable: new ReadableStream(),
    status: Promise.resolve('running'),
    cancel: jest.fn(),
  } as never)
})

afterEach(() => {
  delete process.env.AGENT_SEARCH_KEY_SECRET
})

test('without a key, the run is the house’s and nothing is sealed', async () => {
  const response = await ask()
  expect(response.status).toBe(200)
  expect(admitAgentSearchRun).toHaveBeenCalledWith(
    store,
    expect.objectContaining({ keySource: 'house' }),
  )
  const [, [input]] = jest.mocked(start).mock.calls[0] as unknown as [
    unknown,
    [object],
  ]
  expect(input).not.toHaveProperty('sealedKey')
  expect(checkOpenRouterKey).not.toHaveBeenCalled()
})

test('an own key is checked, admitted as own, and reaches the workflow only sealed', async () => {
  const response = await ask({ 'x-openrouter-key': KEY })
  expect(response.status).toBe(200)
  expect(checkOpenRouterKey).toHaveBeenCalledWith(KEY)
  expect(admitAgentSearchRun).toHaveBeenCalledWith(
    store,
    expect.objectContaining({ keySource: 'own' }),
  )
  // Nothing the server keeps holds the key in the clear: not the admission
  // record, not the workflow input (its event log), not run updates.
  const kept = JSON.stringify([
    jest.mocked(admitAgentSearchRun).mock.calls,
    jest.mocked(start).mock.calls,
    store.update.mock.calls,
  ])
  expect(kept).not.toContain(KEY)
  const [, [input]] = jest.mocked(start).mock.calls[0] as unknown as [
    unknown,
    [{ sealedKey: string }],
  ]
  await expect(unsealOwnKey(input.sealedKey, 'asr_1', SECRET)).resolves.toBe(
    KEY,
  )
  expect(await response.text()).not.toContain(KEY)
})

test('a key OpenRouter refuses stops the question before anything is admitted', async () => {
  jest
    .mocked(checkOpenRouterKey)
    .mockResolvedValue({ ok: false, reason: 'own_key_no_credit' })
  const response = await ask({ 'x-openrouter-key': KEY })
  expect(response.status).toBe(402)
  expect(await response.json()).toEqual({ error: 'own_key_no_credit' })
  expect(admitAgentSearchRun).not.toHaveBeenCalled()
  expect(start).not.toHaveBeenCalled()
})

test('a malformed key is refused without asking OpenRouter', async () => {
  const response = await ask({ 'x-openrouter-key': 'not-a-key' })
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'own_key_invalid' })
  expect(checkOpenRouterKey).not.toHaveBeenCalled()
})

test('with own keys turned off, a key is refused rather than ignored', async () => {
  jest.mocked(ownKeysEnabled).mockReturnValue(false)
  const response = await ask({ 'x-openrouter-key': KEY })
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'own_key_unavailable' })
  expect(admitAgentSearchRun).not.toHaveBeenCalled()
})
