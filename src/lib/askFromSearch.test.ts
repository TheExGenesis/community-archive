import {
  askFilterLabel,
  askPrefillFrom,
  buildAskHref,
  isAskShortcut,
  questionWithFilters,
} from './askFromSearch'

test('a search expression becomes an Ask link with the same parameters', () => {
  expect(buildAskHref('singapore from:visakanv since:2025-01-01')).toBe(
    '/search/ask?q=singapore&fromUser=visakanv&sinceDate=2025-01-01',
  )
  expect(buildAskHref('   ')).toBe('/search/ask')
})

test('the Ask page prefills the query and keeps only well-formed filters', () => {
  expect(
    askPrefillFrom({
      q: ' singapore ',
      fromUser: '@visakanv',
      replyToUser: 'bad name!',
      sinceDate: '2025-01-01',
      untilDate: 'yesterday',
    }),
  ).toEqual({
    text: 'singapore',
    filters: [
      { key: 'from', value: 'visakanv' },
      { key: 'since', value: '2025-01-01' },
    ],
  })
  expect(askPrefillFrom({})).toBeNull()
  // Filters alone still prefill, for the member to add a question.
  expect(askPrefillFrom({ fromUser: 'patio11' })).toEqual({
    text: '',
    filters: [{ key: 'from', value: 'patio11' }],
  })
})

test('filters read as chips and travel with the question in plain words', () => {
  const filters = [
    { key: 'from' as const, value: 'visakanv' },
    { key: 'since' as const, value: '2025-01-01' },
  ]
  expect(filters.map(askFilterLabel)).toEqual([
    'From @visakanv',
    'Since 1 Jan 2025',
  ])
  expect(questionWithFilters(' singapore ', filters)).toBe(
    'singapore (from @visakanv, since 2025-01-01)',
  )
  expect(questionWithFilters('singapore', [])).toBe('singapore')
})

test('⌘↵ and Ctrl↵ ask; plain Enter does not', () => {
  expect(isAskShortcut({ key: 'Enter', metaKey: true, ctrlKey: false })).toBe(
    true,
  )
  expect(isAskShortcut({ key: 'Enter', metaKey: false, ctrlKey: true })).toBe(
    true,
  )
  expect(isAskShortcut({ key: 'Enter', metaKey: false, ctrlKey: false })).toBe(
    false,
  )
})
