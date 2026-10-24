import { realZ, standardise, winSum } from './stats'

describe('spread explorer stats', () => {
  it('sums a centred window', () => {
    expect(winSum([1, 2, 3, 4], 1)).toEqual([3, 6, 9, 7])
    expect(winSum([5], 1)).toEqual([5])
  })

  it('standardises only usable cells', () => {
    const z = standardise(
      [
        [1, 3],
        [2, 100],
      ],
      (h, t) => !(h === 1 && t === 1),
    )
    expect(z[1][1]).toBeNull()
    expect(z[0][0]).toBeCloseTo(-1.2247, 3)
    expect(z[0][1]).toBeCloseTo(1.2247, 3)
    expect(z[1][0]).toBeCloseTo(0, 6)
  })

  it('returns null for a word nobody used', () => {
    expect(realZ([[0, 0]], [[500, 500]])).toBeNull()
  })

  it('colours a hex above average where the word is denser', () => {
    const tweets = [
      [1000, 1000, 1000],
      [1000, 1000, 1000],
    ]
    const uses = [
      [50, 60, 55],
      [1, 0, 2],
    ]
    const out = realZ(uses, tweets)!
    expect(out.z[0][1]!).toBeGreaterThan(0)
    expect(out.z[1][1]!).toBeLessThan(0)
    expect(out.used[1][1]).toBe(true) // the window around month 1 has uses in months 0 and 2
  })

  it('marks hexes with too few tweets as unusable', () => {
    const out = realZ(
      [
        [5, 5],
        [0, 1],
      ],
      [
        [10, 10],
        [1000, 1000],
      ],
    )!
    expect(out.z[0][0]).toBeNull()
    expect(out.z[1][0]).not.toBeNull()
  })
})
