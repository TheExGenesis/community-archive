import { placeCallouts } from './callouts'
const measure = (text: string) => text.length * 6
const person = {
  username: 'alice',
  x: 150,
  y: 150,
  region: 1,
  highlighted: false,
}
it('moves callouts away from map labels and keeps pointers at the real location', () => {
  const labels = [
    {
      text: 'Community',
      x: 150,
      y: 118,
      size: 12,
      region: 1,
      kind: 'country' as const,
    },
  ]
  const [callout] = placeCallouts([person], labels, measure, 400, 400)
  expect(callout.box.y).toBeGreaterThan(150)
  expect(callout.x).toBe(150)
  expect(callout.y).toBe(150)
  expect(callout.pointer).toEqual({ x: 150, y: callout.box.y })
})
it('avoids duplicate names and overlapping callouts for people in the same cell', () => {
  const result = placeCallouts(
    [{ ...person, highlighted: true }, person, { ...person, username: 'bob' }],
    [],
    measure,
    400,
    400,
  )
  expect(result).toHaveLength(2)
  expect(result[0].highlighted).toBe(true)
  expect(result[0].box.y + result[0].box.height).toBeLessThan(result[1].box.y)
})
it('keeps callouts within map edges and omits offscreen points', () => {
  const result = placeCallouts(
    [
      { ...person, x: 4, y: 70 },
      { ...person, username: 'offscreen', x: -10 },
    ],
    [],
    measure,
    400,
    400,
  )
  expect(result).toHaveLength(1)
  expect(result[0].box.x).toBeGreaterThanOrEqual(8)
  expect(result[0].box.y).toBeGreaterThanOrEqual(66)
})

it('keeps a searched account visible when background labels fill every placement', () => {
  const labels = [
    {
      text: 'crowded'.repeat(100),
      x: 200,
      y: 200,
      size: 400,
      region: 1,
      kind: 'country' as const,
    },
  ]
  expect(placeCallouts([person], labels, measure, 400, 400)).toEqual([])
  const result = placeCallouts(
    [{ ...person, highlighted: true }],
    labels,
    measure,
    400,
    400,
  )
  expect(result).toHaveLength(1)
  expect(result[0].box.x).toBeGreaterThanOrEqual(8)
  expect(result[0].box.y).toBeGreaterThanOrEqual(66)
})
