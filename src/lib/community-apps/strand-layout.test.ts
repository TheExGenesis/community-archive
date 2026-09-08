import {
  clusterPositions,
  timelinePositions,
  postTimestamp,
} from './strand-layout'

test('nearby points share centroid hues and input order does not change clusters', () => {
  const input = [
    { id: 'a', x: -10, y: 0 },
    { id: 'b', x: -9, y: 1 },
    { id: 'c', x: 9, y: -1 },
    { id: 'd', x: 10, y: 0 },
  ]
  const result = clusterPositions(input, 2)
  expect(result).toEqual(clusterPositions([...input].reverse(), 2))
  expect(result[0].color).toBe(result[1].color)
  expect(result[2].color).toBe(result[3].color)
  expect(result[0].color).not.toBe(result[2].color)
  const hue = ((Math.atan2(0.5, -9.5) * 180) / Math.PI + 360) % 360
  expect(result[0].color).toBe(`hsl(${hue.toFixed(1)} 65% 48%)`)
  expect(
    clusterPositions([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0, y: 0 },
    ]),
  ).toHaveLength(2)
})
test('timeline sorts dates and separates overlapping labels, retaining exact snowflakes', () => {
  const id = '1423006703495176194'
  expect(new Date(postTimestamp(id)!).toISOString()).toBe(
    '2021-08-04T19:43:30.956Z',
  )
  const result = timelinePositions(
    [
      { id: 'later', createdAt: '2024-01-01' },
      { id: 'b', createdAt: '2021-01-30' },
      { id: 'a', createdAt: '2021-01-01' },
    ],
    900,
  )
  expect(result.nodes.map((n) => n.id)).toEqual(['a', 'b', 'later'])
  expect(result.nodes[0].lane).not.toBe(result.nodes[1].lane)
  expect(result.nodes[0].x).toBeLessThan(result.nodes[1].x)
  for (const node of result.nodes) expect(node.x + 190).toBeLessThan(900)
  expect(postTimestamp('bad')).toBeNull()
})
