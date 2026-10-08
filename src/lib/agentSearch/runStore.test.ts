import { mkdtemp, readdir, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import type { AgentSearchRun } from './types'

const mockServiceRoleClient = jest.fn()

jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: () => mockServiceRoleClient(),
}))

import {
  createFileRunStore,
  createSupabaseRunStore,
  getAgentSearchRunStore,
} from './runStore'

const baseRun = (overrides: Partial<AgentSearchRun> = {}): AgentSearchRun => ({
  id: 'wrun_01',
  accountId: '42',
  question: 'Who has criticized the community archive?',
  status: 'running',
  model: 'openai:gpt-6.1-sol',
  startedAt: '2026-10-08T10:00:00.000Z',
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

describe('file run store', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'agent-search-runs-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('round-trips a run through create, update and get', async () => {
    const store = createFileRunStore(dir)
    await store.create(baseRun())
    await store.update('wrun_01', {
      status: 'completed',
      completedAt: '2026-10-08T10:01:00.000Z',
      answer: 'Some people said [[t:1]]',
      citedTweetIds: ['1'],
      toolCalls: [{ name: 'search_tweets', input: { query: 'archive' } }],
      costUsd: 0.12,
    })

    expect(await store.get('wrun_01')).toEqual(
      baseRun({
        status: 'completed',
        completedAt: '2026-10-08T10:01:00.000Z',
        answer: 'Some people said [[t:1]]',
        citedTweetIds: ['1'],
        toolCalls: [{ name: 'search_tweets', input: { query: 'archive' } }],
        costUsd: 0.12,
      }),
    )
    expect(await store.get('missing')).toBeNull()
    // Atomic writes leave no temp files behind.
    expect(await readdir(dir)).toEqual(['wrun_01.json'])
  })

  test('keeps every patch when updates overlap', async () => {
    const store = createFileRunStore(dir)
    await store.create(baseRun())
    await Promise.all([
      store.update('wrun_01', { inputTokens: 10 }),
      store.update('wrun_01', { outputTokens: 20 }),
      store.update('wrun_01', { costUsd: 0.5 }),
    ])
    expect(await store.get('wrun_01')).toMatchObject({
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0.5,
    })
  })

  test('refuses duplicate runs, unknown updates and unsafe ids', async () => {
    const store = createFileRunStore(dir)
    await store.create(baseRun())
    await expect(store.create(baseRun())).rejects.toThrow('already exists')
    await expect(store.update('nope', { status: 'failed' })).rejects.toThrow(
      'not found',
    )
    await expect(store.get('../escape')).rejects.toThrow('Invalid')
  })

  test('counts, detects running runs and sums cost since a time', async () => {
    const store = createFileRunStore(dir)
    await store.create(
      baseRun({ id: 'old', startedAt: '2026-10-07T23:00:00.000Z', costUsd: 5 }),
    )
    await store.create(
      baseRun({
        id: 'today',
        status: 'completed',
        startedAt: '2026-10-08T01:00:00.000Z',
        costUsd: 1.25,
      }),
    )
    await store.create(
      baseRun({
        id: 'other',
        accountId: '7',
        startedAt: '2026-10-08T09:55:00.000Z',
        costUsd: 0.75,
      }),
    )
    const since = '2026-10-08T00:00:00.000Z'
    const now = new Date('2026-10-08T10:00:00.000Z')

    expect(await store.countSince('42', since)).toBe(1)
    expect(await store.costSince(since)).toBeCloseTo(2)
    // Account 42's only running run started 11 hours ago: stale.
    expect(await store.hasRunning('42', 600_000, now)).toBe(false)
    expect(await store.hasRunning('7', 600_000, now)).toBe(true)
  })

  test('lists a member’s recent runs and one conversation’s runs', async () => {
    const store = createFileRunStore(dir)
    await store.create(
      baseRun({
        id: 'a1',
        conversationId: 'conv-aaaa',
        startedAt: '2026-10-08T10:00:00.000Z',
      }),
    )
    await store.create(
      baseRun({
        id: 'a2',
        conversationId: 'conv-aaaa',
        startedAt: '2026-10-08T11:00:00.000Z',
      }),
    )
    await store.create(
      baseRun({ id: 'b1', accountId: '7', conversationId: 'conv-bbbb' }),
    )
    expect((await store.listRecent('42', 10)).map((run) => run.id)).toEqual([
      'a2',
      'a1',
    ])
    expect((await store.listRecent('42', 1)).map((run) => run.id)).toEqual([
      'a2',
    ])
    expect(
      (await store.listConversation('conv-aaaa')).map((run) => run.id),
    ).toEqual(['a1', 'a2'])
  })

  test('reads an empty or missing directory as no runs', async () => {
    const store = createFileRunStore(path.join(dir, 'not-created'))
    expect(await store.countSince('42', '2026-10-08T00:00:00.000Z')).toBe(0)
    expect(await store.costSince('2026-10-08T00:00:00.000Z')).toBe(0)
  })
})

describe('supabase run store', () => {
  test('maps camelCase runs to snake_case rows and back', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null })
    const row = {
      id: 'wrun_01',
      account_id: '42',
      question: 'Who has criticized the community archive?',
      status: 'running',
      model: 'openai:gpt-6.1-sol',
      started_at: '2026-10-08T10:00:00+00:00',
      completed_at: null,
      answer: null,
      cited_tweet_ids: [],
      invalid_citation_ids: [],
      tool_calls: [],
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: '0.125',
      error: null,
    }
    const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null })
    const client = {
      from: jest.fn(() => ({
        insert,
        select: () => ({ eq: () => ({ maybeSingle }) }),
      })),
    }
    const store = createSupabaseRunStore(client as never)

    await store.create(baseRun())
    expect(client.from).toHaveBeenCalledWith('agent_search_runs')
    expect(insert).toHaveBeenCalledWith({
      id: 'wrun_01',
      account_id: '42',
      conversation_id: null,
      question: 'Who has criticized the community archive?',
      status: 'running',
      model: 'openai:gpt-6.1-sol',
      started_at: '2026-10-08T10:00:00.000Z',
      completed_at: null,
      answer: null,
      cited_tweet_ids: [],
      invalid_citation_ids: [],
      tool_calls: [],
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      error: null,
      parts: null,
    })
    expect(await store.get('wrun_01')).toMatchObject({
      accountId: '42',
      startedAt: '2026-10-08T10:00:00+00:00',
      costUsd: 0.125,
    })
  })

  test('sends only the patched columns', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null })
    const update = jest.fn(() => ({ eq }))
    const client = { from: jest.fn(() => ({ update })) }
    const store = createSupabaseRunStore(client as never)

    await store.update('wrun_01', {
      status: 'failed',
      error: 'upstream',
      completedAt: '2026-10-08T10:02:00.000Z',
    })
    expect(update).toHaveBeenCalledWith({
      status: 'failed',
      error: 'upstream',
      completed_at: '2026-10-08T10:02:00.000Z',
    })
    expect(eq).toHaveBeenCalledWith('id', 'wrun_01')
  })

  test('pages through every row when summing cost', async () => {
    const page = (n: number, cost: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `r${i}`, cost_usd: cost }))
    const range = jest
      .fn()
      .mockResolvedValueOnce({ data: page(1000, 0.01), error: null })
      .mockResolvedValueOnce({ data: page(3, 1), error: null })
    const chain = {
      select: () => chain,
      gte: () => chain,
      order: () => chain,
      range,
    }
    const store = createSupabaseRunStore({ from: () => chain } as never)

    expect(await store.costSince('2026-10-08T00:00:00.000Z')).toBeCloseTo(13)
    expect(range).toHaveBeenNthCalledWith(1, 0, 999)
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999)
  })
})

describe('getAgentSearchRunStore', () => {
  test('never builds the Supabase store outside production', () => {
    expect(process.env.NODE_ENV).not.toBe('production')
    getAgentSearchRunStore()
    expect(mockServiceRoleClient).not.toHaveBeenCalled()
  })
})
