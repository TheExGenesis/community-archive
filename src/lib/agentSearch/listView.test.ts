import { parseListView } from './listView'

test('no hint, or "tweets", is one row per tweet', () => {
  expect(parseListView(undefined)).toEqual({ kind: 'tweets' })
  expect(parseListView('')).toEqual({ kind: 'tweets' })
  expect(parseListView(' Tweets ')).toEqual({ kind: 'tweets' })
})

test('"by author" groups every tweet under its author', () => {
  expect(parseListView('by author')).toEqual({
    kind: 'people',
    showcase: 'all',
  })
  expect(parseListView('grouped by person')).toEqual({
    kind: 'people',
    showcase: 'all',
  })
})

test('"people" folds each person\'s tweets; a number shows that many', () => {
  expect(parseListView('people')).toEqual({ kind: 'people', showcase: 0 })
  expect(parseListView('people, 2 each')).toEqual({
    kind: 'people',
    showcase: 2,
  })
  expect(parseListView('People 3')).toEqual({ kind: 'people', showcase: 3 })
  // A person shows at most five before the rest fold.
  expect(parseListView('people, 40 each')).toEqual({
    kind: 'people',
    showcase: 5,
  })
})

test('a hint it does not know still shows the list, as tweets', () => {
  expect(parseListView('timeline')).toEqual({ kind: 'tweets' })
})
