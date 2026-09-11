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
      axis: 'log',
      granularity: 'month',
      range: { start: '2025-03', end: '2026-08' },
    })

    expect(parseTrendExplorerState(search, defaults)).toEqual({
      terms: ['ai agents', 'tpot'],
      shown: ['ai agents'],
      included: ['tpot'],
      scale: 'raw',
      axis: 'log',
      granularity: 'month',
      range: { start: '2025-03', end: '2026-08' },
    })
  })

  test('uses safe defaults for invalid or unrelated URL values', () => {
    expect(
      parseTrendExplorerState(
        'granularity=hour&scale=percent&from=2026-13&to=2025-01',
        defaults,
      ),
    ).toEqual({
      terms: defaults,
      shown: defaults,
      included: ['tpot'],
      scale: 'normalized',
      granularity: 'month',
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

test('starts with monthly live defaults and honors explicit shared yearly charts', () => {
  expect(
    parseTrendExplorerState('', ['astra', 'navier stokes']).granularity,
  ).toBe('month')
  expect(
    parseTrendExplorerState('q=blender&granularity=year', ['astra']),
  ).toMatchObject({ terms: ['blender'], granularity: 'year' })
})

test('keeps a custom chart window separate from tweet filters in shared links', () => {
  const state = {
    ...parseTrendExplorerState('granularity=day', defaultsForTimeline),
    chartRange: { start: '2026-08-27', end: '2026-09-10' },
    range: { start: '2026-09-01', end: '2026-09-03' },
  }
  expect(
    parseTrendExplorerState(
      serializeTrendExplorerState(state),
      defaultsForTimeline,
    ),
  ).toEqual(state)
  expect(
    parseTrendExplorerState(
      'granularity=day&chartFrom=2026-02-30&chartTo=2026-03-04',
      defaultsForTimeline,
    ).chartRange,
  ).toBeUndefined()
})
const defaultsForTimeline = ['astra']
test.each([
  ['12m', 'month'],
  ['12w', 'week'],
  ['15d', 'day'],
])('restores the resolution for preset %s', (timeline, granularity) => {
  expect(
    parseTrendExplorerState(
      `timeline=${timeline}&granularity=year`,
      defaultsForTimeline,
    ),
  ).toMatchObject({ timeline, granularity })
})
