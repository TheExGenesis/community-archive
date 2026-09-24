import type { TermWeek } from '@/lib/portal/types'
import { selectDigestTrendMovers } from './trends'

const row = (term: string, deltaPct: number | null): TermWeek => ({
  term,
  last7: 20,
  prev7: deltaPct === null ? 0 : 10,
  deltaPct,
  status: deltaPct === null ? 'new' : 'comparable',
})

test('selects the largest rising and falling comparable homepage terms', () => {
  const movers = selectDigestTrendMovers([
    row('new', null),
    row('minor riser', 32),
    row('top riser', 1769),
    row('minor faller', -43),
    row('top faller', -72),
  ])
  expect(movers?.riser?.term).toBe('top riser')
  expect(movers?.faller?.term).toBe('top faller')
  expect(selectDigestTrendMovers([row('new', null)])).toBeNull()
})
