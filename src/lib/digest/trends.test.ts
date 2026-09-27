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

test('selects the highest-volume term in each direction, not the largest percentage', () => {
  const snapshot = selectDigestTopTerms(
    [
      row('largest rise', 24, 2057),
      row('jev', 178, 267),
      row('ai safety', 84, -49),
      row('new term', 200, null),
      row('unchanged', 500, 0),
      row('another rise', 150, 12),
      row('largest fall', 20, -90),
    ],
    '2026-09-25',
  )
  expect(snapshot?.terms).toEqual([
    { term: 'jev', tweets: 178, changePct: 267 },
    { term: 'ai safety', tweets: 84, changePct: -49 },
  ])
  expect(parseDigestTrendSnapshot(snapshot, '2026-09-25')).toEqual(snapshot)
})

test('refuses current trends for a historical edition', () => {
  expect(selectDigestTopTerms([row('jev', 178, 267)], '2026-09-16')).toBeNull()
  expect(
    parseDigestTrendSnapshot(
      selectDigestTopTerms(
        [row('jev', 178, 267), row('down', 84, -49)],
        '2026-09-25',
      ),
      '2026-09-16',
    ),
  ).toBeNull()
})

test('formats unchanged share without a negative sign', () => {
  expect(formatDigestShareChange(0)).toBe('0%')
})

test('requires both directions and rejects invalid windows', () => {
  expect(
    selectDigestTopTerms(
      [row('up', 100, 5), row('new', 200, null)],
      '2026-09-25',
    ),
  ).toBeNull()
  expect(
    selectDigestTopTerms(
      [row('up', 100, 5), { ...row('down', 80, -5), sinceDate: '2026-09-17' }],
      '2026-09-25',
    ),
  ).toBeNull()
})

test('breaks volume ties deterministically', () => {
  const terms = selectDigestTopTerms(
    [row('z up', 100, 5), row('a up', 100, 10), row('down', 50, -5)],
    '2026-09-25',
  )?.terms
  expect(terms?.map(({ term }) => term)).toEqual(['a up', 'down'])
})
