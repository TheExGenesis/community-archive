import {
  getSocialGraphDefaultSettings,
  nodeIdsForLabelCoverage,
  updateYearRange,
} from './socialGraphView'

describe('social graph view controls', () => {
  it('uses the curated graph defaults from the admin view', () => {
    expect(
      getSocialGraphDefaultSettings({
        minYear: 2006,
        maxYear: 2026,
        maxFollowers: 1_000_000,
        nodeCount: 2_000,
      }),
    ).toEqual({
      minimumFollowers: 517,
      startYear: 2021,
      endYear: 2026,
      minimumStrength: 0.3,
      maximumNodes: 720,
      labelPercentage: 20,
      clustering: 'louvain',
      layout: 'clustered-force',
    })
  })

  it('clamps curated defaults to smaller snapshots', () => {
    expect(
      getSocialGraphDefaultSettings({
        minYear: 2024,
        maxYear: 2025,
        maxFollowers: 100,
        nodeCount: 50,
      }),
    ).toEqual(
      expect.objectContaining({
        minimumFollowers: 100,
        startYear: 2024,
        endYear: 2025,
        maximumNodes: 50,
      }),
    )
  })

  it('keeps the two year handles ordered', () => {
    expect(updateYearRange(2020, 2024, 'start', 2026)).toEqual([2024, 2024])
    expect(updateYearRange(2020, 2024, 'end', 2018)).toEqual([2020, 2020])
    expect(updateYearRange(2020, 2024, 'start', 2022)).toEqual([2022, 2024])
  })

  it('labels the requested centrality-ranked share plus a selected community', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }))
    const communities = new Map([
      ['a', 'one'],
      ['b', 'one'],
      ['c', 'two'],
      ['d', 'two'],
      ['e', 'two'],
    ])

    expect(
      Array.from(nodeIdsForLabelCoverage(nodes, 20, communities, null)),
    ).toEqual(['a'])
    expect(
      Array.from(nodeIdsForLabelCoverage(nodes, 20, communities, 'two')),
    ).toEqual(['a', 'c', 'd', 'e'])
    expect(nodeIdsForLabelCoverage(nodes, 100, communities, null).size).toBe(5)
  })
})
