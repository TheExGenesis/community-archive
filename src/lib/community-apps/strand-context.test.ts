import { selectStrandContext } from './strand-context'
const node = (id: string, parent: string | null) => ({
  tweet_id: id,
  reply_to_tweet_id: parent,
  created_at: id.padStart(4, '0'),
})
test('bounds ancestry and descendants to twenty, preserves edges, and handles cycles', () => {
  const nodes = Array.from({ length: 60 }, (_, i) =>
    node(String(i), i ? String(i - 1) : null),
  )
  expect(selectStrandContext(nodes, '30')).toEqual({
    before: Array.from({ length: 20 }, (_, i) => String(i + 10)),
    after: Array.from({ length: 20 }, (_, i) => String(i + 31)),
  })
  expect(selectStrandContext([node('1', '2'), node('2', '1')], '1')).toEqual({
    before: ['2'],
    after: [],
  })
})
test('does not traverse absent/withdrawn nodes or leak unrelated branches as context', () => {
  const nodes = [
    node('1', null),
    node('2', '1'),
    node('4', '3'),
    node('5', '4'),
    node('6', '2'),
  ]
  expect(selectStrandContext(nodes, '4')).toEqual({ before: [], after: ['5'] })
  expect(selectStrandContext(nodes, '3')).toEqual({ before: [], after: [] })
})

test('nearby thread continuations precede much later direct replies', () => {
  const nodes = [
    node('1', null),
    node('2', '1'),
    node('3', '2'),
    node('9', '1'),
  ]
  expect(selectStrandContext(nodes, '1').after).toEqual(['2', '3', '9'])
})
