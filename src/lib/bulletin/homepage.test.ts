import { loadHomepageBulletinItems } from './homepage'
import {
  loadBulletinDismissalsForUser,
  loadBulletinRelationshipsForAccount,
  loadPublicBulletinBoard,
  type StoredNotice,
} from './data'
import { hydrateBulletinTweets } from './tweets'
import type { Notice } from './types'

jest.mock('./data', () => ({
  loadBulletinDismissalsForUser: jest.fn(),
  loadBulletinRelationshipsForAccount: jest.fn(),
  loadPublicBulletinBoard: jest.fn(),
}))
jest.mock('./tweets', () => ({ hydrateBulletinTweets: jest.fn() }))

const now = Date.parse('2026-11-19T00:00:00Z')
// Lower numbers are newer, so they rank first.
const notice = (n: number, side: 'offer' | 'ask'): StoredNotice => ({
  tweet_id: String(n),
  account_id: `acct${n}`,
  username: `user${n}`,
  posted_at: new Date(now - n * 3600_000).toISOString(),
  kind: 'help',
  side,
  summary: `${side} ${n}`,
  topics: [],
  standing: false,
  expires_at: null,
  place: null,
  evidence: '',
  respond: 'dm',
  content_hash: 'hash',
  value_score: 1,
  p_opportunity: 0.9,
  p_joke: 0.1,
})
function setBoard(notices: StoredNotice[]) {
  const sources = new Map<string, Notice>(
    notices.map(({ content_hash, ...o }) => [o.tweet_id, o]),
  )
  jest.mocked(loadPublicBulletinBoard).mockResolvedValue({ notices, sources })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(now)
  jest
    .mocked(loadBulletinRelationshipsForAccount)
    .mockResolvedValue({ account_id: '', outgoing: {}, available: false })
  jest.mocked(loadBulletinDismissalsForUser).mockResolvedValue([])
  jest.mocked(hydrateBulletinTweets).mockImplementation(async (ids) => ({
    tweets: ids
      .filter((id) => id !== '13')
      .map((id) => ({
        id,
        accountId: `acct${id}`,
        username: `user${id}`,
        name: `User ${id}`,
        avatar: null,
        text: `Tweet ${id}`,
        createdAt: '2026-11-18T00:00:00Z',
        observedAt: '2026-11-18T00:00:00Z',
        likes: 0,
        rts: 0,
        replies: [],
      })),
    errors: {},
  }))
})
afterEach(() => jest.restoreAllMocks())

test('shows offers first and about a third asks, skipping dismissed and unshowable notices', async () => {
  // Asks are newest, so plain ranking would lead with them.
  setBoard([
    notice(1, 'ask'),
    notice(2, 'ask'),
    notice(3, 'ask'),
    notice(11, 'offer'),
    notice(12, 'offer'),
    notice(13, 'offer'), // its tweet cannot be loaded
    notice(14, 'offer'),
    notice(15, 'offer'),
    notice(16, 'offer'),
  ])
  jest.mocked(loadBulletinDismissalsForUser).mockResolvedValue(['12'])
  const items = await loadHomepageBulletinItems({
    accountId: '42',
    userId: 'user-uuid',
  })
  expect(items.map((o) => o.tweet.id)).toEqual([
    '11',
    '14',
    '15',
    '1',
    '16',
    '2',
  ])
  expect(items[0]).toMatchObject({ side: 'offer', label: expect.any(String) })
  expect(items[0].tweet).not.toHaveProperty('replies', [])
  expect(loadBulletinRelationshipsForAccount).toHaveBeenCalledWith('42')
  expect(loadBulletinDismissalsForUser).toHaveBeenCalledWith('user-uuid')
})

test('signed-out readers get the shared ranking without personal reads', async () => {
  setBoard([notice(21, 'offer'), notice(22, 'ask')])
  const items = await loadHomepageBulletinItems({
    accountId: null,
    userId: null,
  })
  expect(items.map((o) => o.tweet.id)).toEqual(['21', '22'])
  expect(loadBulletinRelationshipsForAccount).not.toHaveBeenCalled()
  expect(loadBulletinDismissalsForUser).not.toHaveBeenCalled()
})

test('a card whose tweet read lacks the author uses the checked author', async () => {
  setBoard([
    { ...notice(31, 'offer'), username: 'realname', display_name: 'Real Name' },
  ])
  jest.mocked(hydrateBulletinTweets).mockResolvedValueOnce({
    tweets: [
      {
        id: '31',
        accountId: 'acct31',
        username: 'unknown_user',
        name: 'unknown_user',
        avatar: null,
        text: 'Tweet 31',
        createdAt: '2026-11-18T00:00:00Z',
        observedAt: '2026-11-18T00:00:00Z',
        likes: 0,
        rts: 0,
      },
    ],
    errors: {},
  })
  const [item] = await loadHomepageBulletinItems({
    accountId: null,
    userId: null,
  })
  expect(item.tweet).toMatchObject({ username: 'realname', name: 'Real Name' })
})
