import 'server-only'
import { cookies, headers } from 'next/headers'

export const LOCAL_ADMIN_COOKIE = 'ca-local-admin'
/** UI/read preview only. Never use this to authorize a production mutation. */
export function localAdminPreviewAllowed(
  host: string | null,
  nodeEnv = process.env.NODE_ENV,
  deployed = !!process.env.VERCEL,
  enabled = process.env.LOCAL_ADMIN_PREVIEW === 'true',
) {
  if (!enabled || nodeEnv !== 'development' || deployed || !host) return false
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
}
export async function getLocalAdminPreview(): Promise<
  'admin' | 'signed-out' | null
> {
  if (!localAdminPreviewAllowed((await headers()).get('host'))) return null
  return (await cookies()).get(LOCAL_ADMIN_COOKIE)?.value === 'signed-out'
    ? 'signed-out'
    : 'admin'
}
