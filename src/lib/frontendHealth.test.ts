import { checkFrontendHealth } from '@/lib/frontendHealth'

describe('frontend readiness health', () => {
  it('reports healthy when both bounded dependency probes succeed', async () => {
    const fetchImpl = jest.fn(
      async (_input: URL | RequestInfo, _init?: RequestInit) =>
        new Response('{}', { status: 200 }),
    )

    const result = await checkFrontendHealth({
      env: {
        CLICKHOUSE_ANALYTICS_API_URL:
          'https://analytics.community-archive.org/analytics',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        VERCEL_ENV: 'preview',
        VERCEL_GIT_COMMIT_SHA: '0123456789abcdef',
      },
      fetchImpl,
      timeoutMs: 100,
    })

    expect(result).toMatchObject({
      build: { deploymentEnvironment: 'preview', gitSha: '0123456789ab' },
      service: 'community-archive-web',
      status: 'healthy',
    })
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.supabase.co/auth/v1/health',
      'https://analytics.community-archive.org/health',
    ])
  })

  it('reports unhealthy without leaking dependency errors', async () => {
    const fetchImpl = jest
      .fn((_input: URL | RequestInfo, _init?: RequestInit) =>
        Promise.resolve(new Response('{}')),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockRejectedValueOnce(new Error('secret upstream response'))

    const result = await checkFrontendHealth({
      env: {
        CLICKHOUSE_ANALYTICS_API_URL: 'https://analytics.example/analytics',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      },
      fetchImpl,
      timeoutMs: 100,
    })

    expect(result.status).toBe('unhealthy')
    expect(result.dependencies.analyticsGateway.status).toBe('unavailable')
    expect(JSON.stringify(result)).not.toContain('secret upstream response')
  })

  it('treats missing or malformed configuration as unavailable', async () => {
    const fetchImpl = jest.fn(
      (_input: URL | RequestInfo, _init?: RequestInit) =>
        Promise.resolve(new Response('{}')),
    )

    const result = await checkFrontendHealth({
      env: {
        CLICKHOUSE_ANALYTICS_API_URL: 'not a url',
      },
      fetchImpl,
    })

    expect(result.status).toBe('unhealthy')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
