import { isAdminUser } from '@/app/admin/data'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

const PRODUCTION_SUPABASE_HOST = 'fabxmporizzqflnftavs.supabase.co'

export function isClickHouseLabEnvironmentEnabled(
  enabled = process.env.ENABLE_CLICKHOUSE_LAB,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): boolean {
  return (
    enabled === 'true' &&
    Boolean(supabaseUrl) &&
    !supabaseUrl?.includes(PRODUCTION_SUPABASE_HOST)
  )
}

export async function requireClickHouseLab() {
  if (!isClickHouseLabEnvironmentEnabled()) notFound()

  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login?redirect=/clickhouse')
  }
  if (!isAdminUser(user)) notFound()
  return user
}

export async function canAccessClickHouseLab(): Promise<boolean> {
  if (!isClickHouseLabEnvironmentEnabled()) return false
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return !error && Boolean(user && isAdminUser(user))
}

const ALLOWED_ENDPOINTS: Record<string, ReadonlySet<string>> = {
  summary: new Set(),
  'word-trend': new Set(['q', 'bucket', 'match', 'from', 'to']),
  'top-quotes': new Set(['limit']),
}

export function analyticsGatewayRequestUrl(
  path: string[],
  incomingSearchParams: URLSearchParams,
  baseUrl = process.env.CLICKHOUSE_ANALYTICS_API_URL,
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
