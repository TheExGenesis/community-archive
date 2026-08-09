import { GET } from '@/app/api/health/route'
import { checkFrontendHealth } from '@/lib/frontendHealth'

jest.mock('@/lib/frontendHealth', () => ({
  checkFrontendHealth: jest.fn(),
}))

const mockedCheckFrontendHealth = jest.mocked(checkFrontendHealth)

function healthResult(status: 'degraded' | 'healthy' | 'unhealthy') {
  return {
    build: { deploymentEnvironment: 'test', gitSha: 'test' },
    dependencies: {
      analyticsGateway: { latencyMs: 1, status: 'ok' as const },
      supabaseAuth: { latencyMs: 1, status: 'ok' as const },
    },
    service: 'community-archive-web' as const,
    status,
  }
}

describe('frontend health route', () => {
  it.each([
    ['healthy', 200],
    ['degraded', 200],
    ['unhealthy', 503],
  ] as const)('maps %s readiness to HTTP %s', async (status, httpStatus) => {
    mockedCheckFrontendHealth.mockResolvedValueOnce(healthResult(status))

    const response = await GET()

    expect(response.status).toBe(httpStatus)
    await expect(response.json()).resolves.toMatchObject({ status })
  })
})
