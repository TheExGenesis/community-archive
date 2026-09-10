import { loadBulletinPage, BulletinCursorExpired } from './page'
import {
  hydrateBulletinNotices,
  loadBulletinBoardState,
  loadBulletinRelationships,
  type StoredNotice,
} from './data'
import { BULLETIN_PAGE_SIZE, DEFAULT_BULLETIN_FILTERS } from './types'
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
  posted_at: new Date(
    Date.parse('2026-09-07T00:00:00Z') + i * 60000,
  ).toISOString(),
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
const ids = (from: number, to: number) =>
  Array.from({ length: from - to + 1 }, (_, i) => String(from - i))
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-09T00:00:00Z'))
  jest.mocked(loadBulletinBoardState).mockResolvedValue({
    notices: Array.from({ length: 40 }, (_, i) => notice(i + 1)),
  })
  jest.mocked(loadBulletinRelationships).mockResolvedValue({
    account_id: '',
    username: '',
    outgoing: {},
    available: false,
    following: [],
    followers: [],
  })
  jest.mocked(hydrateBulletinNotices).mockImplementation(async ({ notices }) =>
    notices.map(({ content_hash, ...o }) => ({
      ...o,
      preview_text: `Current text ${o.tweet_id}`,
    })),
  )
})
afterEach(() => jest.restoreAllMocks())
test('hydrates only one page of sources, keeps metadata private, and advances a single cursor', async () => {
  expect(BULLETIN_PAGE_SIZE).toBe(18)
  const first = await loadBulletinPage(filters)
  expect(first.notices.map((o) => o.tweet_id)).toEqual(ids(40, 23))
  expect(hydrateBulletinNotices).toHaveBeenCalledTimes(1)
  expect(
    jest.mocked(hydrateBulletinNotices).mock.calls[0][0].notices,
  ).toHaveLength(18)
  expect(JSON.stringify(first)).not.toContain('content_hash')
  expect(first.cursors).toEqual({ help: '23' })
  const second = await loadBulletinPage(filters, first.cursors.help!)
  expect(second.notices.map((o) => o.tweet_id)).toEqual(ids(22, 5))
  const third = await loadBulletinPage(filters, second.cursors.help!)
  expect(third.notices.map((o) => o.tweet_id)).toEqual(ids(4, 1))
  expect(third.cursors.help).toBeNull()
})
test('pages the all-categories stream under one cursor with side and category counts', async () => {
  const page = await loadBulletinPage(DEFAULT_BULLETIN_FILTERS)
  expect(page.notices).toHaveLength(18)
  expect(page.cursors).toEqual({ all: '23' })
  expect(page.counts).toMatchObject({
    help: 40,
    feedback: 0,
    offer: 40,
    ask: 0,
  })
})
test('refills holes from removed sources and rejects missing cursors', async () => {
  jest
    .mocked(hydrateBulletinNotices)
    .mockImplementation(async ({ notices }) =>
      notices.filter((o) => o.tweet_id !== '40'),
    )
  const first = await loadBulletinPage(filters)
  expect(first.notices.map((o) => o.tweet_id)).toEqual(ids(39, 22))
  expect(first.counts.help).toBe(39)
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
    notices: [expired, ...Array.from({ length: 30 }, (_, i) => notice(i + 2))],
  })
  jest.mocked(hydrateBulletinNotices).mockImplementation(async ({ notices }) =>
    notices.map((o) => ({
      ...o,
      preview_text: o.tweet_id === '1' ? 'Hidden needle' : 'other text',
      renewed_at: o.tweet_id === '1' ? '2026-09-08T00:00:00Z' : null,
    })),
  )
  const first = await loadBulletinPage(filters)
  expect(first.counts.help).toBe(31)
  // The expired-by-metadata ask is checked alongside the first page.
  expect(
    jest.mocked(hydrateBulletinNotices).mock.calls[0][0].notices,
  ).toHaveLength(19)
  const result = await loadBulletinPage({ ...filters, search: 'needle' })
  expect(result.notices.map((o) => o.tweet_id)).toEqual(['1'])
})
test('accepts a set of kinds and keys the cursor by that set', async () => {
  const page = await loadBulletinPage({
    ...DEFAULT_BULLETIN_FILTERS,
    kind: 'feedback,help',
  })
  expect(page.notices).toHaveLength(18)
  expect(page.cursors).toEqual({ 'feedback,help': '23' })
  expect(page.counts.help).toBe(40)
})
