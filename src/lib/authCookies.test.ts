import {
  authCookieDeletions,
  decodeStoredSession,
  legacyCookieDomain,
  parseDocumentCookie,
  reconcileAuthCookies,
} from './authCookies'

const encode = (session: Record<string, unknown>) =>
  'base64-' +
  Buffer.from(JSON.stringify(session), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const session = (expiresAt: number, padding = 0) => ({
  access_token: 'jwt',
  refresh_token: 'refresh',
  expires_at: expiresAt,
  token_type: 'bearer',
  user: { id: 'user', name: 'Ünïcode ✓', padding: 'x'.repeat(padding) },
})

const chunk = (value: string, size: number) =>
  Array.from({ length: Math.ceil(value.length / size) }, (_, index) => ({
    name: `sb-ref-auth-token.${index}`,
    value: value.slice(index * size, (index + 1) * size),
  }))

const verifiers = [
  { name: 'sb-ref-auth-token-code-verifier', value: 'v' },
  { name: 'sb-ref-auth-token-flow-abcdef0123456789-code-verifier', value: 'v' },
  { name: 'sb-ref-auth-token-flows-code-verifier', value: 'v' },
]

test('decodes current base64url and legacy JSON session cookies', () => {
  expect(decodeStoredSession(encode(session(1700)))).toEqual({
    expiresAt: 1700,
  })
  expect(decodeStoredSession(JSON.stringify(session(1800)))).toEqual({
    expiresAt: 1800,
  })
  expect(
    decodeStoredSession(encodeURIComponent(JSON.stringify(session(1900)))),
  ).toEqual({ expiresAt: 1900 })
  expect(decodeStoredSession('base64-!!!')).toBeNull()
  expect(decodeStoredSession('not json')).toBeNull()
  expect(decodeStoredSession(encode({ unrelated: true }))).toBeNull()
})

test('leaves cookie lists without duplicate sessions untouched', () => {
  const chunks = chunk(encode(session(2000, 5000)), 3180)
  expect(chunks.length).toBeGreaterThan(1)
  const cookies = [...verifiers, ...chunks, { name: 'other', value: '1' }]
  const untouched = reconcileAuthCookies(cookies)
  expect(untouched).toEqual({ cookies, stale: [] })
  // The same array comes back, so cookie stores keep their identity.
  expect(untouched.cookies).toBe(cookies)

  const single = [{ name: 'sb-ref-auth-token', value: encode(session(2000)) }]
  expect(reconcileAuthCookies(single)).toEqual({ cookies: single, stale: [] })
})

test('drops a stale unchunked cookie that would shadow a newer chunked session', () => {
  const stale = { name: 'sb-ref-auth-token', value: encode(session(1000)) }
  const fresh = chunk(encode(session(2000, 5000)), 3180)
  const result = reconcileAuthCookies([stale, ...verifiers, ...fresh])
  expect(result.stale).toEqual(['sb-ref-auth-token'])
  expect(result.cookies).toEqual([...verifiers, ...fresh])
})

test('drops stale chunks when the unchunked session is newer', () => {
  const fresh = { name: 'sb-ref-auth-token', value: encode(session(3000)) }
  const stale = chunk(encode(session(1000, 5000)), 3180)
  const result = reconcileAuthCookies([...stale, fresh])
  expect(result.stale).toEqual(stale.map((cookie) => cookie.name).sort())
  expect(result.cookies).toEqual([fresh])
})

test('treats an undecodable unchunked cookie as stale', () => {
  const garbage = { name: 'sb-ref-auth-token', value: 'base64-%%%' }
  const fresh = chunk(encode(session(2000, 5000)), 3180)
  expect(reconcileAuthCookies([garbage, ...fresh])).toEqual({
    cookies: fresh,
    stale: ['sb-ref-auth-token'],
  })
})

test('keeps chunks with a gap only when the unchunked cookie is also broken', () => {
  const fresh = chunk(encode(session(2000, 5000)), 3180).filter(
    (cookie) => cookie.name !== 'sb-ref-auth-token.0',
  )
  const single = { name: 'sb-ref-auth-token', value: encode(session(1000)) }
  // The chunks cannot be combined, so the decodable single cookie wins.
  expect(reconcileAuthCookies([single, ...fresh]).cookies).toEqual([single])
  const garbage = { name: 'sb-ref-auth-token', value: 'nope' }
  expect(reconcileAuthCookies([garbage, ...fresh]).stale).toEqual([
    'sb-ref-auth-token',
  ])
})

test('derives the parent domain only for real registrable hosts', () => {
  expect(legacyCookieDomain('www.community-archive.org')).toBe(
    '.community-archive.org',
  )
  expect(legacyCookieDomain('community-archive.org:443')).toBe(
    '.community-archive.org',
  )
  expect(legacyCookieDomain('localhost:3000')).toBeNull()
  expect(legacyCookieDomain('127.0.0.1')).toBeNull()
  expect(legacyCookieDomain('community-archive-abc-team.vercel.app')).toBeNull()
  expect(legacyCookieDomain(null)).toBeNull()
})

test('expires a stale cookie on the host and on the parent domain', () => {
  expect(
    authCookieDeletions(['sb-ref-auth-token'], 'www.community-archive.org'),
  ).toEqual([
    { name: 'sb-ref-auth-token', value: '', options: { path: '/', maxAge: 0 } },
    {
      name: 'sb-ref-auth-token',
      value: '',
      options: { path: '/', maxAge: 0, domain: '.community-archive.org' },
    },
  ])
  expect(authCookieDeletions(['a'], 'localhost')).toHaveLength(1)
  expect(authCookieDeletions([], 'www.community-archive.org')).toEqual([])
})

test('parses document.cookie without decoding values', () => {
  expect(parseDocumentCookie('a=1; b=x%3Dy; flag; c==')).toEqual([
    { name: 'a', value: '1' },
    { name: 'b', value: 'x%3Dy' },
    { name: 'flag', value: '' },
    { name: 'c', value: '=' },
  ])
})
