import {
  expiry,
  followLabel,
  isPast,
  relationship,
  sortNotices,
  uptake,
} from './board'
import type { Notice } from './types'
const notice = (id: string, side = 'offer'): Notice => ({
  tweet_id: id,
  account_id: id,
  username: id,
  posted_at: '2026-08-01T00:00:00Z',
  side,
  kind: 'help',
  summary: 'Help',
  evidence: 'Help',
  topics: [],
  respond: 'reply',
  standing: false,
  expires_at: null,
  place: null,
})
test('asks age out after 14 days, offers after 60, and standing notices remain', () => {
  const ask = notice('1', 'ask'),
    offer = notice('2'),
    now = Date.parse('2026-08-16T00:00:00Z')
  expect(isPast(ask, now)).toBe(true)
  expect(isPast(offer, now)).toBe(false)
  expect(expiry({ ...ask, standing: true })).toBeNull()
  expect(isPast({ ...ask, renewed_at: '2026-08-10T00:00:00Z' }, now)).toBe(
    false,
  )
  expect(
    isPast({ ...ask, standing: true, expires_at: '2026-08-15' }, now),
  ).toBe(true)
})
test('outgoing ranking uses counts and puts expired notices last', () => {
  const graph = {
    outgoing: { '2': 5, '3': 2, '4': 10 },
    available: true,
  }
  const rows = ['5', '4', '3', '2', '1'].map((id) => notice(id))
  expect(
    sortNotices(rows, true, '1', graph, Date.parse('2026-08-10')).map(
      (o) => o.account_id,
    ),
  ).toEqual(['1', '4', '2', '3', '5'])
  rows[4].expires_at = '2026-08-01'
  expect(
    sortNotices(rows, true, '1', graph, Date.parse('2026-08-10')).at(-1)
      ?.account_id,
  ).toBe('1')
})
test('relationship labels are grounded in own account and outgoing interactions', () => {
  const graph = { outgoing: { '2': 3 }, available: true }
  expect(relationship(notice('1'), '1', graph)).toEqual({ rank: 0, label: '' })
  expect(relationship(notice('2'), '1', graph)).toEqual({ rank: 1, label: '' })
  expect(relationship(notice('3'), '1', graph).label).toBe('')
  expect(relationship(notice('1'), '', graph).label).toBe('')
})
test('uptake is unknown before hydration and counts replies plus quotes after', () => {
  expect(uptake(notice('1'))).toBeNull()
  expect(uptake({ ...notice('1'), replies: 2, quotes: 1 })).toBe(3)
  expect(uptake({ ...notice('1'), replies: 0, quotes: 0 })).toBe(0)
})
test('recommended lifts unanswered asks within a group while newest stays chronological', () => {
  const graph = { outgoing: {}, available: true }
  const rows = [
    { ...notice('a'), posted_at: '2026-08-05T00:00:00Z' },
    {
      ...notice('b', 'ask'),
      posted_at: '2026-08-03T00:00:00Z',
      replies: 0,
      quotes: 0,
    },
    {
      ...notice('c', 'ask'),
      posted_at: '2026-08-04T00:00:00Z',
      replies: 2,
      quotes: 0,
    },
    { ...notice('d', 'ask'), posted_at: '2026-08-02T00:00:00Z' },
  ]
  expect(
    sortNotices(rows, true, '', graph, Date.parse('2026-08-10')).map(
      (o) => o.tweet_id,
    ),
  ).toEqual(['b', 'a', 'c', 'd'])
  expect(
    sortNotices(rows, false, '', graph, Date.parse('2026-08-10')).map(
      (o) => o.tweet_id,
    ),
  ).toEqual(['a', 'c', 'b', 'd'])
})
test('ascending reverses the order but keeps past notices last', () => {
  const graph = { outgoing: {}, available: true }
  const rows = [
    { ...notice('a'), posted_at: '2026-08-05T00:00:00Z' },
    { ...notice('b'), posted_at: '2026-08-03T00:00:00Z' },
    {
      ...notice('c'),
      posted_at: '2026-08-04T00:00:00Z',
      expires_at: '2026-08-06',
    },
  ]
  expect(
    sortNotices(rows, false, '', graph, Date.parse('2026-08-10'), true).map(
      (o) => o.tweet_id,
    ),
  ).toEqual(['b', 'a', 'c'])
})
test('follow labels come from archived follow lists', () => {
  const graph = {
    outgoing: {},
    available: true,
    following: ['1', '2'],
    followers: ['2', '3'],
  }
  expect(followLabel('1', graph)).toBe('following')
  expect(followLabel('2', graph)).toBe('mutual')
  expect(followLabel('3', graph)).toBe('follows you')
  expect(followLabel('4', graph)).toBe('')
  expect(followLabel('1', { outgoing: {}, available: false })).toBe('')
})
