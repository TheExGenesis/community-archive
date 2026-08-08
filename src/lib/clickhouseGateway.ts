const ALLOWED_ENDPOINTS: Record<string, ReadonlySet<string>> = {
  summary: new Set(),
  search: new Set([
    'q',
    'mode',
    'from_user',
    'reply_to_user',
    'since',
    'until',
    'limit',
    'offset',
  ]),
  'word-trend': new Set(['q', 'bucket', 'match', 'from', 'to']),
  'stream-stats': new Set(['start', 'end', 'granularity', 'scope']),
  'recent-bangers': new Set(['limit', 'hours']),
  'portal-stream': new Set([
    'limit',
    'before',
    'before_id',
    'after',
    'after_id',
  ]),
  'missing-accounts': new Set(['limit']),
  'top-quotes': new Set([
    'limit',
    'exclude_self',
    'target_ca_users_only',
    'quote_ca_users_only',
    'include_usernames',
    'exclude_usernames',
  ]),
}

export function isClickHouseReadsEnabled(
  enabled = process.env.ENABLE_CLICKHOUSE_READS,
): boolean {
  return enabled === 'true'
}

export function clickHouseSearchGatewayBaseUrl(
  searchUrl = process.env.CLICKHOUSE_SEARCH_API_URL,
  analyticsUrl = process.env.CLICKHOUSE_ANALYTICS_API_URL,
): string | undefined {
  return searchUrl || analyticsUrl
}

export function clickHouseAnalyticsGatewayBaseUrl(
  analyticsUrl = process.env.CLICKHOUSE_ANALYTICS_API_URL,
  searchUrl = process.env.CLICKHOUSE_SEARCH_API_URL,
): string | undefined {
  if (analyticsUrl) return analyticsUrl
  if (!searchUrl) return undefined
  return `${searchUrl.replace(/\/$/, '')}/analytics`
}

export function analyticsGatewayRequestUrl(
  path: string[],
  incomingSearchParams: URLSearchParams,
  baseUrl = clickHouseAnalyticsGatewayBaseUrl(),
): URL {
  if (!baseUrl)
    throw new Error('CLICKHOUSE_ANALYTICS_API_URL is not configured')

  const cleanPath = path.map((segment) => decodeURIComponent(segment))
  let allowedParams: ReadonlySet<string> | undefined
  if (cleanPath.length === 1) {
    allowedParams = ALLOWED_ENDPOINTS[cleanPath[0]]
  } else if (
    cleanPath.length === 2 &&
    cleanPath[0] === 'user' &&
    /^[A-Za-z0-9_@]{1,80}$/.test(cleanPath[1])
  ) {
    allowedParams = new Set(['limit'])
  } else if (
    cleanPath.length === 2 &&
    cleanPath[0] === 'tweet' &&
    /^\d{1,20}$/.test(cleanPath[1])
  ) {
    allowedParams = new Set()
  }

  if (!allowedParams)
    throw new Error('Unsupported ClickHouse analytics endpoint')

  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  const relativePath = cleanPath.map(encodeURIComponent).join('/')
  const target = new URL(relativePath, base)
  for (const key of Array.from(allowedParams)) {
    const value = incomingSearchParams.get(key)
    if (value !== null) target.searchParams.set(key, value)
  }
  return target
}

type NextFetchInit = RequestInit & {
  next?: {
    revalidate?: number
  }
}

interface AnalyticsGatewayJsonOptions {
  fetchImpl?: typeof fetch
  revalidate?: number
  timeoutMs?: number
  baseUrl?: string
  token?: string
}

export async function fetchAnalyticsGatewayJson<T>(
  path: string[],
  searchParams = new URLSearchParams(),
  options: AnalyticsGatewayJsonOptions = {},
): Promise<T> {
  const token = options.token ?? process.env.CLICKHOUSE_ANALYTICS_API_TOKEN
  if (!token)
    throw new Error('CLICKHOUSE_ANALYTICS_API_TOKEN is not configured')

  const target = analyticsGatewayRequestUrl(
    path,
    searchParams,
    options.baseUrl ?? clickHouseAnalyticsGatewayBaseUrl(),
  )
  const fetchImpl = options.fetchImpl ?? fetch
  const init: NextFetchInit = {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
  }

  if (options.revalidate !== undefined) {
    init.next = { revalidate: options.revalidate }
  } else {
    init.cache = 'no-store'
  }

  const response = await fetchImpl(target, init)
  const body = await response.text()
  if (!response.ok) {
    throw new Error(
      `ClickHouse analytics request failed (${response.status}): ${body.slice(0, 300)}`,
    )
  }

  try {
    return JSON.parse(body) as T
  } catch {
    throw new Error('ClickHouse analytics returned invalid JSON')
  }
}
