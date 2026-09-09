import { expiry, isPast, sortNotices } from './board'
import type { Opportunity } from './types'
const notice = (id: string, side = 'offer'): Opportunity => ({
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

test('recommended follows category priority while newest remains chronological', () => {
  const graph = { outgoing: {}, available: true }
  const kinds = ['feedback', 'help', 'intro', 'invite', 'opportunity', 'free']
  const rows = kinds.map((kind, i) => ({
    ...notice(String(i)),
    kind,
    posted_at: `2026-08-0${6 - i}T00:00:00Z`,
  }))
  expect(
    sortNotices(rows, true, '', graph, Date.parse('2026-08-10')).map(
      (o) => o.kind,
    ),
  ).toEqual([...kinds].reverse())
  expect(
    sortNotices(rows, false, '', graph, Date.parse('2026-08-10')).map(
      (o) => o.kind,
    ),
  ).toEqual(kinds)
})
