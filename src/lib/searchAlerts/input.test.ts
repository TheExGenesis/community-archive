import {
  defaultSearchAlertMode,
  parseSearchAlertInput,
  searchAlertLabel,
  searchAlertSearchHref,
} from './input'

test('parses a search like the site search does', () => {
  expect(parseSearchAlertInput({ query: '  "Community   Archive" ' })).toEqual({
    ok: true,
    value: { query: 'Community Archive', mode: 'phrase', fromUser: null },
  })
  expect(
    parseSearchAlertInput({ query: 'archive', fromUser: '@ExGenesis' }),
  ).toEqual({
    ok: true,
    value: { query: 'archive', mode: 'all', fromUser: 'exgenesis' },
  })
  expect(defaultSearchAlertMode('one two')).toBe('phrase')
})

test('rejects empty, oversized and malformed input', () => {
  expect(parseSearchAlertInput(null).ok).toBe(false)
  expect(parseSearchAlertInput({ query: '   ' }).ok).toBe(false)
  expect(parseSearchAlertInput({ query: 'x'.repeat(201) }).ok).toBe(false)
  expect(parseSearchAlertInput({ query: 'x', mode: 'fuzzy' }).ok).toBe(false)
  expect(parseSearchAlertInput({ query: 'x', fromUser: 'not a user' }).ok).toBe(
    false,
  )
})

test('links an alert to the site search from the day of its boundary', () => {
  expect(
    searchAlertSearchHref(
      { query: 'community archive', fromUser: 'exgenesis' },
      '2026-11-19T23:30:00.000Z',
    ),
  ).toBe('/search?q=community+archive&fromUser=exgenesis&sinceDate=2026-11-19')
  expect(searchAlertLabel({ query: 'x', fromUser: null })).toBe('“x”')
})
