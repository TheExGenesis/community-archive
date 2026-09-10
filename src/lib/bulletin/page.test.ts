import { loadBulletinPage, BulletinCursorExpired } from './page'
import {
  hydrateBulletinNotices,
  loadBulletinBoardState,
  loadBulletinRelationships,
  type StoredNotice,
} from './data'
import { DEFAULT_BULLETIN_FILTERS } from './types'
jest.mock('./data', () => ({
  hydrateBulletinNotices: jest.fn(),
  loadBulletinBoardState: jest.fn(),
  loadBulletinRelationships: jest.fn(),
}))
const filters = { ...DEFAULT_BULLETIN_FILTERS, kind: 'help' }
const notice = (i: number): StoredNotice => ({
  tweet_id: String(i),
  account_id: '123',
  username: 'alice',
  posted_at: '2026-09-08T00:00:00Z',
  kind: 'help',
  side: 'offer',
  summary: `Offer ${i}`,
  topics: [],
  standing: false,
  expires_at: null,
  place: null,
  evidence: '',
  respond: 'dm',
  content_hash: 'hash',
})
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-09T00:00:00Z'))
  jest.mocked(loadBulletinBoardState).mockResolvedValue({
    notices: Array.from({ length: 9 }, (_, i) => notice(i + 1)),
  })
  jest.mocked(loadBulletinRelationships).mockResolvedValue({
    account_id: '',
    username: '',
    outgoing: {},
    available: false,
  })
  jest.mocked(hydrateBulletinNotices).mockImplementation(async ({ notices }) =>
    notices.map(({ content_hash, ...o }) => ({
      ...o,
      preview_text: `Current text ${o.tweet_id}`,
    })),
  )
})
afterEach(() => jest.restoreAllMocks())
test('hydrates only four selected sources, keeps metadata private, and advances the cursor', async () => {
  const first = await loadBulletinPage(filters)
  expect(first.opportunities.map((o) => o.tweet_id)).toEqual([
    '9',
    '8',
    '7',
    '6',
  ])
  expect(hydrateBulletinNotices).toHaveBeenCalledTimes(1)
  expect(
    jest.mocked(hydrateBulletinNotices).mock.calls[0][0].notices,
  ).toHaveLength(4)
  expect(JSON.stringify(first)).not.toContain('content_hash')
  expect(first.cursors.help).toBe('6')
  const second = await loadBulletinPage(filters, first.cursors.help!)
  expect(second.opportunities.map((o) => o.tweet_id)).toEqual([
    '5',
    '4',
    '3',
    '2',
  ])
  const third = await loadBulletinPage(filters, second.cursors.help!)
  expect(third.opportunities.map((o) => o.tweet_id)).toEqual(['1'])
  expect(third.cursors.help).toBeNull()
})
test('refills holes from removed sources and rejects missing cursors', async () => {
  jest
    .mocked(hydrateBulletinNotices)
    .mockImplementation(async ({ notices }) =>
      notices.filter((o) => o.tweet_id !== '9'),
    )
  const first = await loadBulletinPage(filters)
  expect(first.opportunities.map((o) => o.tweet_id)).toEqual([
    '8',
    '7',
    '6',
    '5',
  ])
  expect(first.counts.help).toBe(8)
  await expect(loadBulletinPage(filters, '999')).rejects.toBeInstanceOf(
    BulletinCursorExpired,
  )
})
test('preserves self-quote renewal and full-text search beyond the first page', async () => {
  const expired = {
    ...notice(1),
    side: 'ask',
    posted_at: '2026-08-01T00:00:00Z',
  }
  jest.mocked(loadBulletinBoardState).mockResolvedValue({
    notices: [expired, ...Array.from({ length: 8 }, (_, i) => notice(i + 2))],
  })
  jest.mocked(hydrateBulletinNotices).mockImplementation(async ({ notices }) =>
    notices.map((o) => ({
      ...o,
      preview_text: o.tweet_id === '1' ? 'Hidden needle' : 'other text',
      renewed_at: o.tweet_id === '1' ? '2026-09-08T00:00:00Z' : null,
    })),
  )
  const first = await loadBulletinPage(filters)
  expect(first.counts.help).toBe(9)
  expect(
    jest.mocked(hydrateBulletinNotices).mock.calls[0][0].notices,
  ).toHaveLength(5)
  const result = await loadBulletinPage({ ...filters, search: 'needle' })
  expect(result.opportunities.map((o) => o.tweet_id)).toEqual(['1'])
})
