import {
  clampTrendRange,
  parseTrendExplorerState,
  serializeTrendExplorerState,
} from './trendExplorerState'

describe('trend explorer URL state', () => {
  const defaults = ['tpot', 'ai', 'community']

  test('round-trips terms, filters, scale, granularity, and range', () => {
    const search = serializeTrendExplorerState({
      terms: ['ai agents', 'tpot'],
      shown: ['ai agents'],
      included: ['tpot'],
      scale: 'raw',
      granularity: 'month',
      range: { start: '2025-03', end: '2026-08' },
    })

    expect(parseTrendExplorerState(search, defaults)).toEqual({
      terms: ['ai agents', 'tpot'],
      shown: ['ai agents'],
      included: ['tpot'],
      scale: 'raw',
      granularity: 'month',
      range: { start: '2025-03', end: '2026-08' },
    })
  })

  test('uses safe defaults for invalid or unrelated URL values', () => {
    expect(
      parseTrendExplorerState(
        'granularity=week&scale=percent&from=2026-13&to=2025-01',
        defaults,
      ),
    ).toEqual({
      terms: defaults,
      shown: defaults,
      included: ['tpot'],
      scale: 'normalized',
      granularity: 'year',
      range: null,
    })
  })

  test('clamps a shared range to available buckets', () => {
    expect(
      clampTrendRange({ start: '2018-01', end: '2027-12' }, [
        '2019-01',
        '2019-02',
        '2019-03',
      ]),
    ).toEqual({ start: '2019-01', end: '2019-03' })
  })
})
