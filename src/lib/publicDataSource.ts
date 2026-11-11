import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/database-types'

export { productionReadMode as usesProductionReadSource } from '@/utils/supabaseReadRouting'
import { productionReadMode } from '@/utils/supabaseReadRouting'

export function publicDataConfig(env: NodeJS.ProcessEnv = process.env) {
  const portal = productionReadMode(env)
  const local =
    env.NODE_ENV === 'development' &&
    env.NEXT_PUBLIC_USE_REMOTE_DEV_DB !== 'true'
  const url = portal
    ? env.PORTAL_READ_SUPABASE_URL
    : local
      ? env.NEXT_PUBLIC_LOCAL_SUPABASE_URL
      : env.NEXT_PUBLIC_SUPABASE_URL
  const key = portal
    ? env.PORTAL_READ_SUPABASE_ANON_KEY
    : local
      ? env.NEXT_PUBLIC_LOCAL_ANON_KEY
      : env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Public read source is not configured')
  if (key.startsWith('sb_secret_'))
    throw new Error('Public reads require an anonymous key')
  if (key.split('.').length === 3) {
    let role: unknown
    try {
      role = JSON.parse(
        Buffer.from(key.split('.')[1], 'base64url').toString(),
      ).role
    } catch {
      throw new Error('Invalid public read key')
    }
    if (role !== 'anon')
      throw new Error('Public reads require an anonymous key')
  }
  return {
    url,
    key,
    sourceId: `${env.VERCEL_ENV ?? env.NODE_ENV}:${portal ? 'portal' : 'app'}:${new URL(url).origin}:${portal ? (env.PUBLIC_READ_ORIGIN ?? '') : ''}`,
  }
}

/** Cookie-free public reads: never forwards a staging session or permits a write. */
export function createPublicReadClient() {
  const { url, key } = publicDataConfig()
  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method !== 'GET' && method !== 'HEAD')
          throw new Error('Public data source is read-only')
        return fetch(input, {
          ...init,
          cache: 'no-store',
          signal: init?.signal ?? AbortSignal.timeout(10_000),
        })
      },
    },
  })
}
