import snapshot from './snapshot.json'
import { coverageSummary, hexPoints } from './types'

it('preserves snapshot counts and strips all account identities', () => {
  expect(snapshot.cells).toHaveLength(1730)
  expect(snapshot.regions).toHaveLength(24)
  expect(coverageSummary(snapshot.cells)).toEqual({
    accounts: 70577,
    archived: 672,
    occupied: 349,
  })
  for (const cell of snapshot.cells) {
    expect(Object.keys(cell).sort()).toEqual([
      'accounts',
      'activity',
      'archived',
      'region',
      'terms',
      'x',
      'y',
    ])
    expect(cell.archived).toBeLessThanOrEqual(cell.accounts)
    expect(snapshot.regions[cell.region]).toBeDefined()
  }
  expect(snapshot.regions.every((region) => !('reps' in region))).toBe(true)
})

it('handles an empty selection and uses the explorer’s pointy-top geometry with an inverted y axis', () => {
  expect(coverageSummary([])).toEqual({ accounts: 0, archived: 0, occupied: 0 })
  expect(hexPoints(0, 2, 1).split(' ')).toHaveLength(6)
  expect(hexPoints(0, 2, 1).split(' ')[0]).toBe('0.866,-1.500')
})
