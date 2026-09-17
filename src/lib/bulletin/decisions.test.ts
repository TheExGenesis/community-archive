import { createHash } from 'crypto'
import { getAdminClient } from '@/app/admin/data'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { hydrateBulletinTweets } from './tweets'
import {
  loadDecisions,
  loadDecisionTweet,
  decisionStatus,
  type StoredDecision,
} from './decisions'

jest.mock('@/app/admin/data', () => ({ getAdminClient: jest.fn() }))
jest.mock('@/lib/localAdminPreview', () => ({
  getLocalAdminPreview: jest.fn(),
}))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/clickhouseGateway', () => ({
  fetchAnalyticsGatewayJson: jest.fn(),
}))
jest.mock('./tweets', () => ({ hydrateBulletinTweets: jest.fn() }))
const rpc = jest.fn()
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const row: StoredDecision = {
  tweet_id: '123',
  account_id: '42',
  posted_at: '2026-09-11T10:00:00Z',
  content_hash: hash('Original post'),
  status: 'negative',
  attempts: 1,
  updated_at: '2026-09-11T11:00:00+00:00',
  last_attempt_at: null,
  version: 'v1',
  username: 'person',
  summary: null,
  evidence: null,
  side: null,
  kind: null,
}
const source = {
  tweet_id: '123',
  account_id: '42',
  full_text: 'Original post',
  reply_to_tweet_id: null,
  retweet: false,
}
beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getLocalAdminPreview).mockResolvedValue(null)
  jest
    .mocked(getAdminClient)
    .mockResolvedValue({ rpc } as unknown as Awaited<
      ReturnType<typeof getAdminClient>
    >)
  rpc.mockResolvedValue({ data: [row], error: null })
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({ data: [source] })
})
test('both admin reads authorize before fetching private records or sources', async () => {
  jest.mocked(getAdminClient).mockRejectedValue(new Error('not authorized'))
  await expect(loadDecisions()).rejects.toThrow('not authorized')
  await expect(loadDecisionTweet('123')).rejects.toThrow('not authorized')
  expect(rpc).not.toHaveBeenCalled()
  expect(fetchAnalyticsGatewayJson).not.toHaveBeenCalled()
  expect(hydrateBulletinTweets).not.toHaveBeenCalled()
})
test('returns source-verified rejected text, without leaking its hash', async () => {
  const result = await loadDecisions('negative')
  expect(result.decisions).toHaveLength(1)
  expect(result.decisions[0]).toMatchObject({
    status: 'negative',
    text: 'Original post',
  })
  expect(result.decisions[0]).not.toHaveProperty('content_hash')
  expect(rpc).toHaveBeenCalledWith(
    'get_bulletin_decisions',
    expect.objectContaining({ decision_status: 'negative', max_results: 26 }),
  )
})
test.each([
  { data: [] },
  { data: [{ ...source, account_id: '99' }] },
  { data: [{ ...source, full_text: 'Edited' }] },
  { data: [{ ...source, reply_to_tweet_id: '1' }] },
  { data: [{ ...source, retweet: true }] },
])(
  'omits unavailable, changed, mismatched and non-original sources',
  async ({ data }) => {
    jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({ data })
    const result = await loadDecisions()
    expect(result.decisions).toEqual([])
    expect(result.hidden).toBe(1)
  },
)
test('empty policy-filtered results do not fetch content', async () => {
  rpc.mockResolvedValue({ data: [], error: null })
  expect((await loadDecisions()).decisions).toEqual([])
  expect(await loadDecisionTweet('123')).toBeNull()
  expect(fetchAnalyticsGatewayJson).not.toHaveBeenCalled()
  expect(hydrateBulletinTweets).not.toHaveBeenCalled()
})
test('preserves keyset pagination even if source checks remove every row', async () => {
  rpc.mockResolvedValue({
    data: Array.from({ length: 26 }, (_, i) => ({
      ...row,
      tweet_id: String(1000 - i),
    })),
    error: null,
  })
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({ data: [] })
  const result = await loadDecisions()
  expect(result.decisions).toEqual([])
  expect(result.next).toBe(`${row.updated_at}|976`)
  await loadDecisions('positive', result.next!)
  expect(rpc).toHaveBeenLastCalledWith(
    'get_bulletin_decisions',
    expect.objectContaining({
      before_updated_at: row.updated_at,
      before_tweet_id: '976',
    }),
  )
})
test('rejects invalid filters and cursors without a database query', async () => {
  expect(() => decisionStatus('constructor')).toThrow('Invalid')
  for (const before of ['bad', '2026-09-11|1', `${row.updated_at}|1|extra`])
    await expect(loadDecisions('all', before)).rejects.toThrow('Invalid')
  expect(rpc).not.toHaveBeenCalled()
})
test('passes only policy-authorized candidate records to full-fidelity hydration', async () => {
  jest
    .mocked(hydrateBulletinTweets)
    .mockResolvedValue({ tweets: [], errors: { '123': 503 } })
  expect(await loadDecisionTweet('123')).toBeNull()
  expect(rpc).toHaveBeenCalledWith(
    'get_bulletin_decisions',
    expect.objectContaining({ selected_tweet_id: '123' }),
  )
  expect(hydrateBulletinTweets).toHaveBeenCalledWith(['123'], {
    notices: [row],
  })
})
test('upstream failures stay distinct from an empty decision list', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
  await expect(loadDecisions()).rejects.toThrow('could not be loaded')
  rpc.mockResolvedValue({ data: [row], error: null })
  jest
    .mocked(fetchAnalyticsGatewayJson)
    .mockRejectedValue(new Error('upstream unavailable'))
  await expect(loadDecisions()).rejects.toThrow('upstream unavailable')
})
