import type { Instrumentation } from 'next'

const mockGetClaims = jest.fn()
jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getClaims: mockGetClaims } }),
  parseCookieHeader: (header: string) =>
    header.split(';').map((pair) => {
      const [name, value] = pair.trim().split('=')
      return { name, value }
    }),
}))
jest.mock('@/utils/supabase', () => ({
  getSupabaseConfig: () => ({
    url: 'https://project.supabase.co',
    anonKey: 'anon',
  }),
}))
jest.mock('@/lib/observability/serverErrorCapture', () => {
  const actual = jest.requireActual('@/lib/observability/serverErrorCapture')
  return {
    ...actual,
    captureServerException: jest.fn(async () => true),
    serverErrorCaptureEnabled: jest.fn(() => true),
  }
})

import {
  captureServerException,
  serverErrorCaptureEnabled,
} from '@/lib/observability/serverErrorCapture'
import {
  describeRequestError,
  reportRequestError,
  reportServerError,
  resolveRequestUserId,
  sanitizeServerErrorContext,
  toReportableError,
} from './serverErrors'

const captureMock = captureServerException as jest.MockedFunction<
  typeof captureServerException
>
const enabledMock = serverErrorCaptureEnabled as jest.MockedFunction<
  typeof serverErrorCaptureEnabled
>

type RequestErrorContext = Parameters<Instrumentation.onRequestError>[2]

const routeContext = (
  overrides: Partial<RequestErrorContext> = {},
): RequestErrorContext => ({
  routerKind: 'App Router',
  routePath: '/api/archive-uploads/[id]/route',
  routeType: 'route',
  revalidateReason: undefined,
  ...overrides,
})

describe('serverErrors', () => {
  const originalRuntime = process.env.NEXT_RUNTIME

  beforeEach(() => {
    jest.clearAllMocks()
    enabledMock.mockReturnValue(true)
    captureMock.mockResolvedValue(true)
    delete process.env.NEXT_RUNTIME
  })

  afterAll(() => {
    if (originalRuntime === undefined) delete process.env.NEXT_RUNTIME
    else process.env.NEXT_RUNTIME = originalRuntime
  })

  describe('sanitizeServerErrorContext', () => {
    it('keeps enum tokens, counts, and booleans only', () => {
      expect(
        sanitizeServerErrorContext({
          stage: 'send',
          failure_count: 3,
          personalized: true,
          status_code: 500,
          error_code: 'PGRST116',
          query: 'private words here',
          email: 'someone@example.com',
          url: 'https://www.community-archive.org/search?q=x',
          fraction: 0.5,
          'Bad Key': 'x',
          missing: undefined,
        }),
      ).toEqual({
        stage: 'send',
        failure_count: 3,
        personalized: true,
        status_code: 500,
        error_code: 'PGRST116',
      })
    })
  })

  describe('toReportableError', () => {
    it('passes Error instances through unchanged', () => {
      const error = new TypeError('boom')
      expect(toReportableError(error)).toBe(error)
    })

    it('turns Supabase style error objects into named errors', () => {
      const reportable = toReportableError({
        message: 'permission denied',
        code: '42501',
      })
      expect(reportable).toBeInstanceOf(Error)
      expect(reportable.message).toBe('permission denied')
      expect(reportable.name).toBe('Error 42501')
    })

    it('never throws on unexpected values', () => {
      expect(toReportableError('plain string').message).toBe('plain string')
      expect(toReportableError(undefined).message).toBe('Unknown error')
    })
  })

  describe('reportServerError', () => {
    it('is a no-op when server capture is disabled', async () => {
      enabledMock.mockReturnValue(false)
      await expect(
        reportServerError('digest_email', new Error('x')),
      ).resolves.toBe(false)
      expect(captureMock).not.toHaveBeenCalled()
    })

    it('sends the scope and bounded context under the server id', async () => {
      const error = new Error('send failed')
      await expect(
        reportServerError('digest_email', error, {
          stage: 'send',
          failure_count: 2,
          recipient_email: 'someone@example.com',
        }),
      ).resolves.toBe(true)
      expect(captureMock).toHaveBeenCalledWith(error, {
        route: 'digest_email',
        method: undefined,
        requestId: undefined,
        userState: 'unknown',
        distinctId: undefined,
        extra: {
          stage: 'send',
          failure_count: 2,
          scope: 'digest_email',
          runtime: 'server',
        },
      })
    })

    it('attributes to a verified user id', async () => {
      await reportServerError(
        'archive_delete',
        { message: 'row missing', code: 'PGRST116' },
        { stage: 'read_upload' },
        'user-123',
      )
      const [reported, context] = captureMock.mock.calls[0]
      expect((reported as Error).message).toBe('row missing')
      expect(context).toMatchObject({
        route: 'archive_delete',
        distinctId: 'user-123',
        userState: 'signed_in',
        extra: { stage: 'read_upload', scope: 'archive_delete' },
      })
    })

    it('reports transport failures as false', async () => {
      captureMock.mockResolvedValue(false)
      await expect(
        reportServerError('digest_generation', new Error('x')),
      ).resolves.toBe(false)
    })
  })

  describe('describeRequestError', () => {
    it('maps page requests to the analytics route without the raw path', () => {
      expect(
        describeRequestError(
          {
            path: '/user/1234567890?tab=likes&q=private-words',
            method: 'GET',
          },
          routeContext({
            routePath: '/user/[account_id]/page',
            routeType: 'render',
            renderSource: 'react-server-components',
          }),
        ),
      ).toEqual({
        route_name: 'user_profile',
        page_group: 'product',
        route_path: '/user/[account_id]',
        http_method: 'GET',
        router_kind: 'app',
        route_type: 'render',
        render_source: 'react-server-components',
        revalidate_reason: undefined,
      })
    })

    it('reports API routes by template only', () => {
      expect(
        describeRequestError(
          { path: '/api/archive-uploads/987654321', method: 'DELETE' },
          routeContext(),
        ),
      ).toMatchObject({
        route_name: 'api',
        page_group: 'api',
        route_path: '/api/archive-uploads/[id]',
        http_method: 'DELETE',
        route_type: 'route',
      })
    })

    it('falls back to unknown for unregistered paths and odd methods', () => {
      expect(
        describeRequestError(
          { path: '/not-a-page/secret-token', method: 'weird' },
          routeContext({
            routePath: '/not-a-page/[token]/page?x=1',
            routeType: 'render',
          }),
        ),
      ).toMatchObject({
        route_name: 'unknown',
        page_group: 'unknown',
        route_path: '/unknown',
        http_method: 'UNKNOWN',
      })
    })
  })

  describe('resolveRequestUserId', () => {
    it('skips the lookup without a Supabase auth cookie', async () => {
      await expect(
        resolveRequestUserId({ cookie: 'theme=dark' }),
      ).resolves.toBe(null)
      expect(mockGetClaims).not.toHaveBeenCalled()
    })

    it('returns the verified subject for a signed-in session', async () => {
      mockGetClaims.mockResolvedValue({
        data: { claims: { sub: 'user-123', is_anonymous: false } },
        error: null,
      })
      await expect(
        resolveRequestUserId({
          cookie: 'sb-project-auth-token=base64-token; theme=dark',
        }),
      ).resolves.toBe('user-123')
    })

    it('ignores anonymous sessions and verification failures', async () => {
      mockGetClaims.mockResolvedValue({
        data: { claims: { sub: 'anon-1', is_anonymous: true } },
        error: null,
      })
      await expect(
        resolveRequestUserId({ cookie: 'sb-project-auth-token=x' }),
      ).resolves.toBe(null)
      mockGetClaims.mockRejectedValue(new Error('auth down'))
      await expect(
        resolveRequestUserId({ cookie: 'sb-project-auth-token=x' }),
      ).resolves.toBe(null)
    })
  })

  describe('reportRequestError', () => {
    const request = {
      path: '/api/search?q=private-words',
      method: 'POST',
      headers: {
        cookie: 'sb-project-auth-token=x',
        'user-agent': 'Jest',
        'x-vercel-id': 'iad1::abc-123',
      },
    }

    it('captures unhandled route errors with bounded context and the user id', async () => {
      mockGetClaims.mockResolvedValue({
        data: { claims: { sub: 'user-123' } },
        error: null,
      })
      const error = new Error('database unavailable')
      await expect(
        reportRequestError(
          error,
          request,
          routeContext({ routePath: '/api/search/route' }),
        ),
      ).resolves.toBe(true)
      expect(captureMock).toHaveBeenCalledWith(error, {
        route: '/api/search',
        method: 'POST',
        requestId: 'iad1::abc-123',
        userState: 'signed_in',
        distinctId: 'user-123',
        extra: {
          route_name: 'api',
          page_group: 'api',
          router_kind: 'app',
          route_type: 'route',
          scope: 'request',
          runtime: 'server',
        },
      })
      const serialized = JSON.stringify(captureMock.mock.calls[0][1])
      expect(serialized).not.toContain('private-words')
      expect(serialized).not.toContain('user-agent')
      expect(serialized).not.toContain('Jest')
    })

    it('falls back to the server id with a coarse user state', async () => {
      await reportRequestError(
        new Error('x'),
        { ...request, headers: { cookie: 'theme=dark' } },
        routeContext({ routePath: '/api/search/route' }),
      )
      expect(mockGetClaims).not.toHaveBeenCalled()
      expect(captureMock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          distinctId: undefined,
          userState: 'guest',
          requestId: undefined,
        }),
      )
    })

    it('does nothing on the edge runtime or when capture is disabled', async () => {
      process.env.NEXT_RUNTIME = 'edge'
      await expect(
        reportRequestError(new Error('x'), request, routeContext()),
      ).resolves.toBe(false)
      delete process.env.NEXT_RUNTIME
      enabledMock.mockReturnValue(false)
      await expect(
        reportRequestError(new Error('x'), request, routeContext()),
      ).resolves.toBe(false)
      expect(mockGetClaims).not.toHaveBeenCalled()
      expect(captureMock).not.toHaveBeenCalled()
    })
  })
})
