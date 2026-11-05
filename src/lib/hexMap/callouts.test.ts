import { placeCallouts } from './callouts'
import type { Point } from './geometry'
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

it('caps examples at three while keeping an explicitly highlighted account', () => {
  const result = placeCallouts(
    [
      ...Array.from({ length: 6 }, (_, index) => ({
        ...person,
        username: `example${index}`,
        x: 150 + index * 100,
      })),
      { ...person, username: 'searched', highlighted: true, y: 300 },
    ],
    [],
    measure,
    900,
    500,
  )
  expect(result.filter((callout) => !callout.highlighted)).toHaveLength(3)
  expect(result.some((callout) => callout.username === 'searched')).toBe(true)
})

it.each([150, 350])(
  'prefers empty space outside the map for a pin at x=%s',
  (x) => {
    const cells = Array.from({ length: 9 }, (_, column) =>
      Array.from({ length: 9 }, (_, row) => ({
        x: 130 + column * 30,
        y: 130 + row * 30,
      })),
    ).flat()
    const [result] = placeCallouts(
      [{ ...person, x, y: 250 }],
      [],
      measure,
      500,
      500,
      { cells, radius: 20, center: { x: 250, y: 250 } },
    )
    if (x < 250) expect(result.box.x + result.box.width).toBeLessThan(110)
    else expect(result.box.x).toBeGreaterThan(390)
    expect(result.x).toBe(x)
    expect(result.y).toBe(250)
  },
)

it.each([false, true])(
  'avoids crossed leaders and leaders through username boxes (mirrored: %s)',
  (mirrored) => {
    const reflect = (p: Point) => ({ ...p, x: mirrored ? 600 - p.x : p.x })
    // Nearby pins used to choose clear space independently, putting the
    // bottom pin's label above the other two and crossing their leaders.
    const people = [
      { ...person, username: 'RichDecibels', x: 260, y: 140 },
      { ...person, username: '42irrationalist', x: 240, y: 125 },
      { ...person, username: 'gworley3', x: 225, y: 155 },
    ].map((p) => ({ ...p, ...reflect(p) }))
    const cells = Array.from({ length: 9 }, (_, column) =>
      Array.from({ length: 9 }, (_, row) =>
        reflect({ x: 100 + column * 25, y: 100 + row * 25 }),
      ),
    ).flat()
    const result = placeCallouts(people, [], measure, 600, 450, {
      cells,
      radius: 18,
      center: reflect({ x: 200, y: 200 }),
    })
    expect(result).toHaveLength(3)
    const side = (a: Point, b: Point, p: Point) =>
      (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    for (const a of result) {
      expect(a).toMatchObject(people.find((p) => p.username === a.username)!)
      for (const b of result.filter((p) => p !== a)) {
        expect(
          side(a, a.pointer, b) * side(a, a.pointer, b.pointer) >= 0 ||
            side(b, b.pointer, a) * side(b, b.pointer, a.pointer) >= 0,
        ).toBe(true)
        const { x, y, width, height } = b.box
        const sides = [
          { x, y },
          { x: x + width, y },
          { x, y: y + height },
          { x: x + width, y: y + height },
        ].map((corner) => side(a, a.pointer, corner))
        // Separating axes: the line or its bounds must miss the other box.
        expect(
          Math.min(...sides) > 0 ||
            Math.max(...sides) < 0 ||
            Math.max(a.x, a.pointer.x) < x ||
            Math.min(a.x, a.pointer.x) > x + width ||
            Math.max(a.y, a.pointer.y) < y ||
            Math.min(a.y, a.pointer.y) > y + height,
        ).toBe(true)
      }
    }
  },
)
