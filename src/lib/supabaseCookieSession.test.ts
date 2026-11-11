import { NextRequest } from 'next/server'
import { createChunks } from '@supabase/ssr'
import { createMiddlewareClient } from '@/utils/supabase'

// Exercise the installed SDK and the application adapter together. Only HTTP is
// mocked, so chunk selection, stale-chunk cleanup and logout use the real SDK.
test('real SSR SDK chunks a session, clears stale chunks and removes it on logout', async () => {
  const previousEnv = process.env
  process.env = {
    ...previousEnv,
    NODE_ENV: 'test',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-dummy-anon',
  }
  const fetchMock = jest.spyOn(globalThis, 'fetch')
  const user = {
    id: 'cookie-test-user',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'cookie-test@example.invalid',
    app_metadata: { provider: 'email' },
    user_metadata: { fixture: 'x'.repeat(9000) },
    created_at: '2026-10-26T00:00:00Z',
  }
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`
  fetchMock.mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes('/auth/v1/token?grant_type=password')) {
      return new Response(
        JSON.stringify({
          access_token: accessToken,
          refresh_token: 'fixture-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
      return new Response(
        JSON.stringify({
          access_token: accessToken,
          refresh_token: 'refreshed-fixture-token',
          token_type: 'bearer',
          expires_in: 3600,
          user,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify(user), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('/auth/v1/logout'))
      return new Response('{}', { status: 200 })
    throw new Error(`Unexpected mocked Auth request: ${url}`)
  })

  const cookieName = 'sb-127-auth-token'
  const request = new NextRequest('https://archive.test/profile', {
    headers: { cookie: `${cookieName}.8=stale; preference=kept` },
  })
  try {
    const client = createMiddlewareClient(request)
    const signedIn = await client.supabase.auth.signInWithPassword({
      email: user.email,
      password: 'fixture-password',
    })
    expect(signedIn.error).toBeNull()
    const chunks = client.response.cookies
      .getAll()
      .filter(
        (cookie) => cookie.name.startsWith(`${cookieName}.`) && cookie.value,
      )
    expect(chunks.length).toBeGreaterThan(1)
    expect(client.response.cookies.get(`${cookieName}.8`)).toMatchObject({
      value: '',
      maxAge: 0,
    })
    expect(client.response.headers.get('cache-control')).toContain('no-store')
    expect(client.response.headers.get('pragma')).toBe('no-cache')
    for (const chunk of chunks) {
      expect(request.cookies.get(chunk.name)?.value).toBe(chunk.value)
      expect(chunk).toMatchObject({ path: '/', sameSite: 'lax' })
    }

    const expired = {
      ...signedIn.data.session,
      expires_at: Math.floor(Date.now() / 1000) - 60,
    }
    const expiredChunks = createChunks(
      cookieName,
      `base64-${Buffer.from(JSON.stringify(expired)).toString('base64url')}`,
    )
    expect(expiredChunks.length).toBeGreaterThan(1)
    const refreshRequest = new NextRequest('https://archive.test/profile', {
      headers: {
        cookie:
          expiredChunks
            .map(({ name, value }) => `${name}=${value}`)
            .join('; ') + `; ${cookieName}.8=stale`,
      },
    })
    const refreshClient = createMiddlewareClient(refreshRequest)
    const beforeRefresh = refreshClient.response
    const verified = await refreshClient.supabase.auth.getUser()
    expect(verified.error).toBeNull()
    expect(verified.data.user?.id).toBe(user.id)
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('grant_type=refresh_token'),
      ),
    ).toHaveLength(1)
    expect(refreshClient.response).not.toBe(beforeRefresh)
    expect(refreshClient.response.cookies.get(`${cookieName}.8`)).toMatchObject(
      { value: '', maxAge: 0 },
    )
    const refreshedChunks = refreshClient.response.cookies
      .getAll()
      .filter(({ name, value }) => name.startsWith(`${cookieName}.`) && value)
    expect(refreshedChunks.length).toBeGreaterThan(1)
    for (const chunk of refreshedChunks) {
      expect(refreshRequest.cookies.get(chunk.name)?.value).toBe(chunk.value)
      expect(
        refreshClient.response.headers.get('x-middleware-request-cookie'),
      ).toContain(`${chunk.name}=`)
    }
    expect(refreshClient.response.headers.get('cache-control')).toContain(
      'no-store',
    )
    expect(refreshClient.response.headers.get('expires')).toBe('0')
    expect(refreshClient.response.headers.get('pragma')).toBe('no-cache')

    const signedOut = await client.supabase.auth.signOut()
    expect(signedOut.error).toBeNull()
    for (const chunk of chunks) {
      expect(client.response.cookies.get(chunk.name)).toMatchObject({
        value: '',
        maxAge: 0,
      })
      expect(request.cookies.get(chunk.name)?.value).toBe('')
    }
    expect(request.cookies.get('preference')?.value).toBe('kept')
    expect(client.response.headers.get('cache-control')).toContain('no-store')
  } finally {
    fetchMock.mockRestore()
    process.env = previousEnv
  }
})
