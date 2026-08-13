import { nodeIdsForLabelCoverage, updateYearRange } from './socialGraphView'

describe('social graph view controls', () => {
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
