import {
  hydrateBulletinNotices,
  loadBulletinRelationshipsForAccount,
  verifyBulletinResolutions,
} from '@/lib/bulletin/data'
import { hydrateBulletinTweets } from '@/lib/bulletin/tweets'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getCurrentUser } from '@/lib/portal/auth'
import { AUGUST_11_MOCK_DIGEST } from './mock'
import {
  loadDigestBulletinItems,
  loadDigestBulletinItemsForViewer,
  prepareDigestBulletinItems,
} from './bulletin'

jest.mock('@/lib/bulletin/data', () => ({
  hydrateBulletinNotices: jest.fn(),
  loadBulletinRelationshipsForAccount: jest.fn(),
  verifyBulletinResolutions: jest.fn(),
}))
jest.mock('@/lib/bulletin/tweets', () => ({
  hydrateBulletinTweets: jest.fn(),
}))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))

const rpc = jest.fn()
const edition = { ...AUGUST_11_MOCK_DIGEST, isPreview: false }

const notice = (id: number, overrides: Record<string, unknown> = {}) => ({
  tweet_id: String(id),
  account_id: String(id + 100),
  username: `author${id}`,
  posted_at: `2026-08-11T${String(id + 10).padStart(2, '0')}:00:00Z`,
  content_hash: 'hash',
  side: 'ask',
  kind: 'help',
  summary: `Request ${id}`,
  evidence: 'Request',
  topics: [],
  respond: 'reply',
  standing: false,
  expires_at: null,
  place: null,
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getCurrentUser).mockResolvedValue(null)
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-12T10:00:00Z'))
  jest.mocked(createServerServiceRoleClient).mockReturnValue({ rpc } as never)
  jest.mocked(verifyBulletinResolutions).mockResolvedValue(undefined)
  jest
    .mocked(loadBulletinRelationshipsForAccount)
    .mockImplementation(async (accountId) => ({
      account_id: accountId,
      outgoing: {},
      available: true,
    }))
  jest
    .mocked(hydrateBulletinNotices)
    .mockImplementation(async ({ notices }) => notices as never)
  jest.mocked(hydrateBulletinTweets).mockImplementation(async (ids) => ({
    tweets: ids
      .filter((id) => id !== '6')
      .map((id) => ({
        id,
        username: `author${id}`,
        name: `Author ${id}`,
        avatar: null,
        text: `Original post ${id}`,
        observedAt: '2026-08-11T18:00:00Z',
        createdAt: '2026-08-11T18:00:00Z',
        likes: 1,
        rts: 0,
      })),
    errors: {},
  }))
})

afterEach(() => jest.restoreAllMocks())

test('selects at most four open notices posted in the edition window', async () => {
  rpc.mockResolvedValue({
    data: [
      notice(1, { posted_at: '2026-08-11T05:59:59Z' }),
      ...[2, 3, 4, 5, 6].map((id) => notice(id)),
      notice(7, { resolution_state: 'resolved' }),
      notice(8, { posted_at: '2026-08-12T06:00:00Z' }),
      notice(9, { expires_at: '2026-08-11' }),
    ],
    error: null,
  })
  const items = await loadDigestBulletinItems(edition)

  expect(rpc).toHaveBeenCalledWith('get_bulletin_board_state', {
    max_results: 2000,
  })
  expect(verifyBulletinResolutions).toHaveBeenCalled()
  expect(hydrateBulletinNotices).toHaveBeenCalled()
  expect(hydrateBulletinTweets).toHaveBeenCalledTimes(2)
  expect(jest.mocked(hydrateBulletinTweets).mock.calls[0][0]).toEqual([
    '6',
    '5',
    '4',
    '3',
  ])
  expect(items.map((item) => item.tweet.id)).toEqual(['5', '4', '3', '2'])
  expect(items[0]).toMatchObject({
    label: 'Help wanted',
    summary: 'Request 5',
    tweet: { text: 'Original post 5' },
  })
})

test('omits the section for previews without reading private state', async () => {
  expect(await loadDigestBulletinItems(AUGUST_11_MOCK_DIGEST)).toEqual([])
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})

test('ranks each linked recipient with their own interactions, keeping guests recent-first', async () => {
  rpc.mockResolvedValue({
    data: [
      notice(2),
      notice(3),
      notice(4),
      notice(5),
      notice(8, { posted_at: '2026-08-12T06:00:00Z' }),
    ],
    error: null,
  })
  jest
    .mocked(loadBulletinRelationshipsForAccount)
    .mockImplementation(async (accountId) => ({
      account_id: accountId,
      outgoing: (accountId === 'one' ? { '102': 20 } : { '103': 20 }) as Record<
        string,
        number
      >,
      available: true,
    }))
  const prepared = await prepareDigestBulletinItems(edition)
  const guest = await prepared.itemsForAccount(null)
  const first = await prepared.itemsForAccount('one')
  const second = await prepared.itemsForAccount('two')

  expect(guest.map((item) => item.tweet.id)).toEqual(['5', '4', '3', '2'])
  expect(first.map((item) => item.tweet.id)).toEqual(['2', '5', '4', '3'])
  expect(second.map((item) => item.tweet.id)).toEqual(['3', '5', '4', '2'])
  expect(loadBulletinRelationshipsForAccount).toHaveBeenCalledTimes(2)
  expect(verifyBulletinResolutions).toHaveBeenCalledTimes(1)
  expect(hydrateBulletinNotices).toHaveBeenCalledTimes(1)
  expect(hydrateBulletinTweets).toHaveBeenCalledTimes(1)
})

test('website picks use the trusted signed-in account and ignore mutable metadata', async () => {
  rpc.mockResolvedValue({ data: [notice(2), notice(3)], error: null })
  jest.mocked(getCurrentUser).mockResolvedValueOnce({
    app_metadata: { provider_id: '42' },
    user_metadata: { provider_id: '999' },
  } as never)

  const signedIn = await loadDigestBulletinItemsForViewer(edition)
  expect(signedIn.personalized).toBe(true)
  expect(signedIn.items).toHaveLength(2)
  expect(loadBulletinRelationshipsForAccount).toHaveBeenCalledWith('42')

  jest.mocked(getCurrentUser).mockResolvedValueOnce({
    app_metadata: {},
    user_metadata: { provider_id: '999' },
  } as never)
  const withoutTrustedId = await loadDigestBulletinItemsForViewer(edition)
  expect(withoutTrustedId.personalized).toBe(false)
  expect(withoutTrustedId.items).toHaveLength(2)
  expect(loadBulletinRelationshipsForAccount).toHaveBeenCalledTimes(1)
})
