import { shelfMonogram, shelfTileKind } from './labels'
import { chunkKeys, rangeBetween, toggleKeys } from './select'

describe('chunkKeys', () => {
  it('splits into batches the curation API accepts', () => {
    const keys = Array.from({ length: 1001 }, (_, i) => `k${i}`)
    const chunks = chunkKeys(keys)
    expect(chunks.map((chunk) => chunk.length)).toEqual([500, 500, 1])
    expect(chunks.flat()).toEqual(keys)
    expect(chunkKeys([])).toEqual([])
  })
})

describe('rangeBetween', () => {
  const order = ['a', 'b', 'c', 'd', 'e']
  it('selects inclusively in either direction', () => {
    expect(rangeBetween(order, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangeBetween(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(rangeBetween(order, 'c', 'c')).toEqual(['c'])
  })
  it('falls back to the target when the anchor is elsewhere', () => {
    expect(rangeBetween(order, 'z', 'c')).toEqual(['c'])
  })
})

describe('toggleKeys', () => {
  it('adds and removes without mutating the input', () => {
    const start = new Set(['a'])
    expect(Array.from(toggleKeys(start, ['b', 'c'], true))).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(Array.from(toggleKeys(start, ['a'], false))).toEqual([])
    expect(Array.from(start)).toEqual(['a'])
  })
})

describe('tile helpers', () => {
  it('draws the object for the medium, not the row', () => {
    expect(shelfTileKind({ medium: 'tools', row: 'made' })).toBe('app')
    expect(shelfTileKind({ medium: 'books', row: 'books' })).toBe('book')
    expect(shelfTileKind({ medium: 'zine', row: 'other' })).toBe('card')
  })
  it('takes the first letter or digit for the monogram', () => {
    expect(shelfMonogram('@comm_archive')).toBe('C')
    expect(shelfMonogram('  élan vital')).toBe('É')
    expect(shelfMonogram('2022 research')).toBe('2')
    expect(shelfMonogram('—')).toBe('—')
  })
})
