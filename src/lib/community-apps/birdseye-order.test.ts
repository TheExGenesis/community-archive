import { orderBirdseyeSources, isBirdseyePostSort } from './birdseye-order'
const index = [
  { id: '1', threadId: '1' },
  { id: '9', threadId: '1' },
  { id: '5', threadId: '5' },
  { id: '6', threadId: '6' },
]
const likes = new Map([
  ['5', 100],
  ['1', 20],
  ['6', 1],
])
const bangers = new Map([
  ['6', 5],
  ['1', 2],
])
test('sorts whole threads by recency, likes, or community quotes, preserving parent-first order', () => {
  expect(orderBirdseyeSources(index, 'recent', likes).map((x) => x.id)).toEqual(
    ['1', '9', '6', '5'],
  )
  expect(orderBirdseyeSources(index, 'likes', likes).map((x) => x.id)).toEqual([
    '5',
    '1',
    '9',
    '6',
  ])
  expect(
    orderBirdseyeSources(index, 'bangers', likes, bangers).map((x) => x.id),
  ).toEqual(['6', '1', '9', '5'])
  expect(isBirdseyePostSort('garbage')).toBe(false)
})
