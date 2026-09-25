import type { TermWeek } from '@/lib/portal/types'
import {
  formatDigestShareChange,
  parseDigestTrendSnapshot,
  selectDigestTopTerms,
} from './trends'

const row = (
  term: string,
  last7: number,
  deltaPct: number | null,
): TermWeek => ({
  term,
  last7,
  prev7: deltaPct === null ? 0 : 10,
  deltaPct,
  status: deltaPct === null ? 'new' : 'comparable',
  sinceDate: '2026-09-18',
  untilDate: '2026-09-24',
})

test('selects the highest tweet volumes, including new terms', () => {
  const snapshot = selectDigestTopTerms(
    [
      row('largest rise', 24, 2057),
      row('jev', 178, 267),
      row('ai safety', 84, -49),
      row('new term', 200, null),
    ],
    '2026-09-25',
  )
  expect(snapshot?.terms).toEqual([
    { term: 'new term', tweets: 200, changePct: null },
    { term: 'jev', tweets: 178, changePct: 267 },
  ])
  expect(parseDigestTrendSnapshot(snapshot, '2026-09-25')).toEqual(snapshot)
})

test('refuses current trends for a historical edition', () => {
  expect(selectDigestTopTerms([row('jev', 178, 267)], '2026-09-16')).toBeNull()
  expect(
    parseDigestTrendSnapshot(
      selectDigestTopTerms([row('jev', 178, 267)], '2026-09-25'),
      '2026-09-16',
    ),
  ).toBeNull()
})

test('formats unchanged share without a negative sign', () => {
  expect(formatDigestShareChange(0)).toBe('0%')
})
