import { safeAuthRedirect, loginHref } from './authRedirect'

test('preserves a filtered internal destination through the login URL', () => {
  const destination = '/trends?q=AI+agents&q=art&granularity=month#chart'
  const href = new URL(loginHref(destination), 'https://community-archive.org')
  expect(safeAuthRedirect(href.searchParams.get('redirect'))).toBe(destination)
})

test.each([
  'https://evil.example',
  '//evil.example',
  '/\\evil.example',
  '/\n/evil.example',
  ' /trends',
  null,
])('rejects unsafe return destination %s', (value) => {
  expect(safeAuthRedirect(value)).toBe('/')
})
