type HealthDependency = {
  latencyMs: number
  status: 'ok' | 'unavailable'
}

export type FrontendHealthResult = {
  build: {
    deploymentEnvironment: string
    gitSha: string
  }
  dependencies: {
    analyticsGateway: HealthDependency
    supabaseAuth: HealthDependency
  }
  service: 'community-archive-web'
  status: 'healthy' | 'unhealthy'
}

type HealthEnvironment = {
  [name: string]: string | undefined
  CLICKHOUSE_ANALYTICS_API_URL?: string
  NEXT_PUBLIC_SUPABASE_URL?: string
  VERCEL_ENV?: string
  VERCEL_GIT_COMMIT_SHA?: string
}

type CheckFrontendHealthOptions = {
  env?: HealthEnvironment
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt))
}

async function checkDependency(
  url: URL | undefined,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<HealthDependency> {
  const startedAt = performance.now()
  if (!url) {
    return { latencyMs: elapsedMilliseconds(startedAt), status: 'unavailable' }
  }

  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    return {
      latencyMs: elapsedMilliseconds(startedAt),
      status: response.ok ? 'ok' : 'unavailable',
    }
  } catch {
    return {
      latencyMs: elapsedMilliseconds(startedAt),
      status: 'unavailable',
    }
  }
}

function supabaseHealthUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined
  try {
    return new URL('/auth/v1/health', value)
  } catch {
    return undefined
  }
}

function analyticsHealthUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined
  try {
    return new URL('/health', new URL(value).origin)
  } catch {
    return undefined
  }
}

export async function checkFrontendHealth({
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 2_500,
}: CheckFrontendHealthOptions = {}): Promise<FrontendHealthResult> {
  const [supabaseAuth, analyticsGateway] = await Promise.all([
    checkDependency(
      supabaseHealthUrl(env.NEXT_PUBLIC_SUPABASE_URL),
      fetchImpl,
      timeoutMs,
    ),
    checkDependency(
      analyticsHealthUrl(env.CLICKHOUSE_ANALYTICS_API_URL),
      fetchImpl,
      timeoutMs,
    ),
  ])
  const healthy =
    supabaseAuth.status === 'ok' && analyticsGateway.status === 'ok'

  return {
    build: {
      deploymentEnvironment: env.VERCEL_ENV || 'unknown',
      gitSha: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || 'unknown',
    },
    dependencies: { analyticsGateway, supabaseAuth },
    service: 'community-archive-web',
    status: healthy ? 'healthy' : 'unhealthy',
  }
}
