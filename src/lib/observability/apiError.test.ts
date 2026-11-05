import {
  buildApiErrorLogLine,
  reportApiError,
  requestIdFromHeaders,
  userStateFromCookieHeader,
} from './apiError'
import { captureServerException } from './serverErrorCapture'

jest.mock('./serverErrorCapture', () => {
  const actual = jest.requireActual('./serverErrorCapture')
  return { ...actual, captureServerException: jest.fn(async () => true) }
})

const captureMock = captureServerException as jest.MockedFunction<
  typeof captureServerException
>

describe('api error reporting', () => {
  beforeEach(() => {
    captureMock.mockClear()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  test('user state is coarse and never reads identity', () => {
    expect(userStateFromCookieHeader(null)).toBe('unknown')
    expect(userStateFromCookieHeader('theme=dark')).toBe('guest')
    expect(userStateFromCookieHeader('sb-fabxm-auth-token=abc')).toBe(
      'signed_in',
    )
    expect(
      userStateFromCookieHeader(
        'a=1; sb-fabxm-auth-token.0=abc; sb-fabxm-auth-token.1=def',
      ),
    ).toBe('signed_in')
  })

  test('request id prefers the Vercel id', () => {
    expect(
      requestIdFromHeaders(new Headers({ 'x-vercel-id': 'iad1::abc' })),
    ).toBe('iad1::abc')
    expect(requestIdFromHeaders(new Headers())).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('log line carries the replay fields and nothing identifying', () => {
    const request = new Request(
      'https://community-archive.org/api/tweet-search?q=secret+term',
      {
        headers: { cookie: 'sb-x-auth-token=abc', 'x-vercel-id': 'iad1::1' },
      },
    )
    const line = buildApiErrorLogLine({
      request,
      route: '/api/tweet-search',
      status: 502,
      message: 'Search is unavailable',
      upstream: 'gateway',
      error: new TypeError('fetch failed'),
      extra: { phase: 'canonical' },
    })
    expect(line).toMatchObject({
      level: 'error',
      kind: 'api_error',
      request_id: 'iad1::1',
      route: '/api/tweet-search',
      method: 'GET',
      status: 502,
      upstream: 'gateway',
      user_state: 'signed_in',
      error: { name: 'TypeError', message: 'fetch failed' },
      phase: 'canonical',
    })
    expect(JSON.stringify(line)).not.toContain('secret')
    expect(JSON.stringify(line)).not.toContain('abc')
  })

  test('reportApiError logs JSON, captures 5xx, and returns request_id to the caller', async () => {
    const request = new Request(
      'https://community-archive.org/api/portal/stream',
      {
        headers: { 'x-vercel-id': 'iad1::2' },
      },
    )
    const response = await reportApiError({
      request,
      route: '/api/portal/stream',
      status: 502,
      message: 'The live stream is temporarily unavailable',
      upstream: 'gateway',
      error: new Error('timeout'),
    })
    expect(response.status).toBe(502)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    await expect(response.json()).resolves.toEqual({
      error: 'The live stream is temporarily unavailable',
      request_id: 'iad1::2',
    })
    const logged = (console.error as jest.Mock).mock.calls[0][0]
    expect(JSON.parse(logged)).toMatchObject({
      kind: 'api_error',
      request_id: 'iad1::2',
    })
    expect(captureMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        route: '/api/portal/stream',
        status: 502,
        upstream: 'gateway',
        requestId: 'iad1::2',
      }),
    )
  })

  test('4xx is logged but not sent to error tracking', async () => {
    const response = await reportApiError({
      request: new Request('https://community-archive.org/api/x'),
      route: '/api/x',
      status: 400,
      message: 'Bad input',
    })
    expect(response.status).toBe(400)
    expect(captureMock).not.toHaveBeenCalled()
  })
})
