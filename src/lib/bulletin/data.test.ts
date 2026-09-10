import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { createHash } from 'crypto'
import type { User } from '@supabase/supabase-js'
import {
  hydrateBulletinNotices,
  loadBulletinBoardState,
  loadRunDashboard,
  loadBulletinRelationships,
} from './data'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { getCurrentUser } from '@/lib/portal/auth'
import { getAdminClient } from '@/app/admin/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
jest.mock('@/lib/clickhouseGateway', () => ({
  fetchAnalyticsGatewayJson: jest.fn(),
}))
jest.mock('@/lib/localAdminPreview', () => ({
  getLocalAdminPreview: jest.fn(),
}))
jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/app/admin/data', () => ({ getAdminClient: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))
const rpc = jest.fn()
// The board page composes these two steps; exercise them the same way.
const loadNotices = async () =>
  hydrateBulletinNotices(await loadBulletinBoardState())
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getLocalAdminPreview).mockResolvedValue(null)
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ rpc } as unknown as ReturnType<
      typeof createServerServiceRoleClient
    >)
})
test.each([null, { is_anonymous: true }])(
  'signed-out/anonymous visitors never reach private data',
  async (user) => {
    jest.mocked(getCurrentUser).mockResolvedValue(user as User | null)
    await expect(loadNotices()).rejects.toThrow(
      'redirect:/login?redirect=/bulletin',
    )
    expect(createServerServiceRoleClient).not.toHaveBeenCalled()
  },
)
test('verified members read the policy-aware RPC, with upstream errors kept distinct from empty results', async () => {
  jest
    .mocked(getCurrentUser)
    .mockResolvedValue({ id: 'member', is_anonymous: false } as User)
  rpc
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: null, error: { message: 'unavailable' } })
  await expect(loadNotices()).resolves.toEqual([])
  expect(rpc).toHaveBeenCalledWith('get_bulletin_board_state', {
    max_results: 2000,
  })
  await expect(loadNotices()).rejects.toThrow('could not be loaded')
})
test('run history always requires admin authorization', async () => {
  jest.mocked(getAdminClient).mockRejectedValueOnce(new Error('not authorized'))
  await expect(loadRunDashboard()).rejects.toThrow('not authorized')
  expect(rpc).not.toHaveBeenCalled()
})
test('run history uses bounded keyset pagination and rejects malformed cursors', async () => {
  jest
    .mocked(getAdminClient)
    .mockResolvedValue({ rpc } as unknown as Awaited<
      ReturnType<typeof getAdminClient>
    >)
  rpc.mockResolvedValue({
    data: {
      runs: [],
      queue: { pending: 0, retrying: 0, exhausted: 0 },
      last_success_at: null,
    },
    error: null,
  })
  await loadRunDashboard('25')
  expect(rpc).toHaveBeenCalledWith('get_bulletin_runs', {
    before_id: 25,
    max_results: 26,
  })
  rpc.mockClear()
  for (const value of ['-1', '1 OR 1=1', '9e3', '9007199254740993'])
    await expect(loadRunDashboard(value)).rejects.toThrow('Invalid run cursor')
  expect(rpc).not.toHaveBeenCalled()
})

test('explicit local admin read preview does not fabricate an Auth user', async () => {
  jest.mocked(getLocalAdminPreview).mockResolvedValue('admin')
  rpc.mockResolvedValue({ data: [], error: null })
  await expect(loadNotices()).resolves.toEqual([])
  expect(getCurrentUser).not.toHaveBeenCalled()
})
test('signed-out local preview still requires login', async () => {
  jest.mocked(getLocalAdminPreview).mockResolvedValue('signed-out')
  jest.mocked(getCurrentUser).mockResolvedValue(null)
  await expect(loadNotices()).rejects.toThrow('redirect:/login')
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})

test('ClickHouse source changes suppress a notice and upstream outages fail the board', async () => {
  jest
    .mocked(getCurrentUser)
    .mockResolvedValue({ id: 'member', is_anonymous: false } as User)
  const hash = createHash('sha256').update('original').digest('hex')
  rpc.mockResolvedValue({
    data: [{ tweet_id: '1', account_id: '10', content_hash: hash }],
    error: null,
  })
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({
    data: [
      {
        tweet_id: '1',
        account_id: '10',
        full_text: 'edited',
        reply_to_tweet_id: null,
        retweet: false,
      },
    ],
  })
  await expect(loadNotices()).resolves.toEqual([])
  jest
    .mocked(fetchAnalyticsGatewayJson)
    .mockRejectedValue(new Error('unavailable'))
  await expect(loadNotices()).rejects.toThrow('unavailable')
})

test('recommendations use the ClickHouse top outgoing list, and follow lists come from the RPC by trusted id', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue({
    id: 'member',
    app_metadata: { provider_id: '42' },
    identities: [
      { provider: 'twitter', identity_data: { user_name: 'exgenesis' } },
    ],
    user_metadata: { user_name: 'someone_else', provider_id: '999' },
  } as unknown as User)
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({
    query: { accountId: '42', year: null, peopleLimit: 25 },
    data: { people: [{ accountId: '7', interactionCount: '12' }] },
  })
  rpc.mockResolvedValue({
    data: { following: ['7', 'bad'], followers: ['8'] },
    error: null,
  })
  await expect(loadBulletinRelationships()).resolves.toMatchObject({
    account_id: '42',
    username: 'exgenesis',
    outgoing: { '7': 12 },
    available: true,
    following: ['7'],
    followers: ['8'],
  })
  expect(fetchAnalyticsGatewayJson).toHaveBeenCalledWith(
    ['user', '42', 'interactions'],
    new URLSearchParams({ limit: '25' }),
    expect.any(Object),
  )
  expect(rpc).toHaveBeenCalledWith('get_bulletin_relationships', {
    viewer_account_id: '42',
  })
})
test('unavailable interaction data stays unknown, and a failed follow RPC yields empty lists', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue({
    id: 'member',
    app_metadata: { provider_id: '42' },
  } as unknown as User)
  jest
    .mocked(fetchAnalyticsGatewayJson)
    .mockRejectedValue(new Error('Unavailable'))
  rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
  await expect(loadBulletinRelationships()).resolves.toMatchObject({
    outgoing: {},
    available: false,
    following: [],
    followers: [],
  })
})

test('mutable user metadata cannot select a recommendation profile', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue({
    id: 'member',
    app_metadata: {},
    user_metadata: { user_name: 'exgenesis', provider_id: '42' },
  } as unknown as User)
  await expect(loadBulletinRelationships()).resolves.toMatchObject({
    account_id: '',
    outgoing: {},
    available: false,
  })
  expect(fetchAnalyticsGatewayJson).not.toHaveBeenCalled()
})

test('interaction responses for a different account are rejected', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue({
    id: 'member',
    app_metadata: { provider_id: '42' },
  } as unknown as User)
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({
    query: { accountId: '99', year: null, peopleLimit: 25 },
    data: { people: [{ accountId: '7', interactionCount: 12 }] },
  })
  await expect(loadBulletinRelationships()).resolves.toMatchObject({
    account_id: '42',
    outgoing: {},
    available: false,
  })
})

test('immediate preview text comes only from a currently verified ClickHouse source', async () => {
  jest
    .mocked(getCurrentUser)
    .mockResolvedValue({ id: 'member', is_anonymous: false } as User)
  const text = 'Offer: current original'
  const content_hash = createHash('sha256').update(text).digest('hex')
  rpc.mockResolvedValue({
    data: [{ tweet_id: '1', account_id: '10', content_hash }],
    error: null,
  })
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({
    data: [
      {
        tweet_id: '1',
        account_id: '10',
        full_text: text,
        reply_to_tweet_id: null,
        retweet: false,
        created_at: '2026-09-08 00:00:00',
        username: 'alice',
      },
    ],
  })
  await expect(loadNotices()).resolves.toMatchObject([
    { tweet_id: '1', preview_text: text },
  ])
})
