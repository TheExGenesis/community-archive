import type { Instrumentation } from 'next'

const mockCaptureExceptionImmediate = jest.fn()
const mockPostHogConstructor = jest.fn()
jest.mock('posthog-node', () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      mockPostHogConstructor(...args)
    }
    captureExceptionImmediate = mockCaptureExceptionImmediate
  },
}))

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

import {
  describeRequestError,
  reportRequestError,
  reportServerError,
  resetServerPostHogClientForTests,
  resolveRequestUserId,
  sanitizeServerErrorContext,
  toReportableError,
} from './serverErrors'

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
  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
    resetServerPostHogClientForTests()
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'test-token'
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://analytics.example.com'
    delete process.env.NEXT_RUNTIME
    mockCaptureExceptionImmediate.mockResolvedValue(undefined)
  })

  afterAll(() => {
    process.env = originalEnv
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
    it('is a no-op when PostHog is not configured', async () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
      await expect(
        reportServerError('digest_email', new Error('x')),
      ).resolves.toBe(false)
      expect(mockPostHogConstructor).not.toHaveBeenCalled()
      expect(mockCaptureExceptionImmediate).not.toHaveBeenCalled()
    })

    it('sends the error with the scope and bounded context under the server id', async () => {
      const error = new Error('send failed')
      await expect(
        reportServerError('digest_email', error, {
          stage: 'send',
          failure_count: 2,
          recipient_email: 'someone@example.com',
        }),
      ).resolves.toBe(true)
      expect(mockPostHogConstructor).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({
          host: 'https://analytics.example.com',
          flushAt: 1,
          disableGeoip: true,
          enableExceptionAutocapture: false,
        }),
      )
      expect(mockCaptureExceptionImmediate).toHaveBeenCalledWith(
        error,
        'server',
        {
          stage: 'send',
          failure_count: 2,
          scope: 'digest_email',
          runtime: 'server',
          $process_person_profile: false,
        },
      )
    })

    it('attributes to a signed-in user id without the server flag', async () => {
      await reportServerError(
        'archive_delete',
        { message: 'row missing', code: 'PGRST116' },
        { stage: 'read_upload' },
        'user-123',
      )
      const [reported, distinctId, properties] =
        mockCaptureExceptionImmediate.mock.calls[0]
      expect(reported.message).toBe('row missing')
      expect(distinctId).toBe('user-123')
      expect(properties).toEqual({
        stage: 'read_upload',
        scope: 'archive_delete',
        runtime: 'server',
      })
    })

    it('swallows transport failures', async () => {
      mockCaptureExceptionImmediate.mockRejectedValue(new Error('offline'))
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      await expect(
        reportServerError('digest_generation', new Error('x')),
      ).resolves.toBe(false)
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
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
      headers: { cookie: 'sb-project-auth-token=x', 'user-agent': 'Jest' },
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
      expect(mockCaptureExceptionImmediate).toHaveBeenCalledWith(
        error,
        'user-123',
        {
          route_name: 'api',
          page_group: 'api',
          route_path: '/api/search',
          http_method: 'POST',
          router_kind: 'app',
          route_type: 'route',
          scope: 'request',
          runtime: 'server',
        },
      )
      const properties = mockCaptureExceptionImmediate.mock.calls[0][2]
      expect(JSON.stringify(properties)).not.toContain('private-words')
      expect(JSON.stringify(properties)).not.toContain('user-agent')
    })

    it('falls back to the server id when no user is signed in', async () => {
      await reportRequestError(
        new Error('x'),
        { ...request, headers: {} },
        routeContext({ routePath: '/api/search/route' }),
      )
      expect(mockCaptureExceptionImmediate).toHaveBeenCalledWith(
        expect.any(Error),
        'server',
        expect.objectContaining({ $process_person_profile: false }),
      )
    })

    it('does nothing on the edge runtime or without configuration', async () => {
      process.env.NEXT_RUNTIME = 'edge'
      await expect(
        reportRequestError(new Error('x'), request, routeContext()),
      ).resolves.toBe(false)
      delete process.env.NEXT_RUNTIME
      delete process.env.NEXT_PUBLIC_POSTHOG_HOST
      resetServerPostHogClientForTests()
      await expect(
        reportRequestError(new Error('x'), request, routeContext()),
      ).resolves.toBe(false)
      expect(mockCaptureExceptionImmediate).not.toHaveBeenCalled()
    })
  })
})
