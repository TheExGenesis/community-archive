import { isAdminUser } from '@/app/admin/data'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

const PRODUCTION_SUPABASE_HOST = 'fabxmporizzqflnftavs.supabase.co'

export { analyticsGatewayRequestUrl } from './clickhouseGateway'

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
