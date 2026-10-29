import { Database } from '@/database-types'
import { browserAuthDiagnostics } from '@/lib/browserAuthDiagnostics'
import { serverAuthDiagnostics } from '@/lib/serverAuthDiagnostics'
import { devLog } from '@/lib/devLog'
import {
  createBrowserClient as browserClient,
  createServerClient as serverClient,
  type CookieMethodsServer,
} from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import {
  createBrowserReadFetch,
  createRoutedSupabaseFetch,
} from './supabaseReadRouting'

const getSupabaseConfig = (includeServiceRole: boolean = false) => {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const useRemoteDevDb = process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true'

  const getUrl = () =>
    isDevelopment && !useRemoteDevDb
      ? process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL!
      : process.env.NEXT_PUBLIC_SUPABASE_URL!

  const getAnonKey = () =>
    isDevelopment && !useRemoteDevDb
      ? process.env.NEXT_PUBLIC_LOCAL_ANON_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const getServiceRole = () =>
    isDevelopment && !useRemoteDevDb
      ? process.env.NEXT_PUBLIC_LOCAL_SERVICE_ROLE!
      : process.env.SUPABASE_SERVICE_ROLE!

  const config = {
    url: getUrl(),
    anonKey: getAnonKey(),
    ...(includeServiceRole ? { serviceRole: getServiceRole() } : {}),
  }

  return config
}

const createCookieHandler = (
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): CookieMethodsServer => ({
  getAll: () => cookieStore.getAll(),
  setAll: (cookiesToSet) => {
    serverAuthDiagnostics(cookieStore.getAll(), cookiesToSet, 'route')
    try {
      for (const { name, value, options } of cookiesToSet) {
        cookieStore.set({ name, value, ...options })
      }
    } catch {
      // Server Components cannot mutate cookies; middleware refreshes sessions.
    }
  },
})

export const createBrowserClient = () => {
  const { url, anonKey } = getSupabaseConfig()
  return browserClient<Database, 'public'>(url, anonKey, {
    cookies: {},
    auth: browserAuthDiagnostics(),
    global: { fetch: createBrowserReadFetch() },
  })
}

export const createAdminBrowserClient = () => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'Admin browser client can only be created in development mode',
    )
  }

  const { url, serviceRole } = getSupabaseConfig(true)

  if (!serviceRole) {
    throw new Error('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE is not set')
  }

  // Remove the 'sb-localhost-auth-token' from localStorage
  if (typeof window !== 'undefined') {
    localStorage.removeItem('sb-localhost-auth-token')
  }

  return browserClient<Database>(url, serviceRole)
}

export const createServerClient = (
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  options: { readSource?: 'app' } = {},
) => {
  const { url, anonKey } = getSupabaseConfig()
  return serverClient<Database>(url, anonKey, {
    cookies: createCookieHandler(cookieStore),
    global: { fetch: createRoutedSupabaseFetch('anon', options) },
  })
}

export const createMiddlewareClient = (request: NextRequest) => {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const { url, anonKey } = getSupabaseConfig()
  const supabase = serverClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        serverAuthDiagnostics(
          request.cookies.getAll(),
          cookiesToSet,
          request.nextUrl.pathname,
        )
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        const previousCookies = response.cookies.getAll()
        const previousHeaders = response.headers
        response = NextResponse.next({ request: { headers: request.headers } })
        for (const cookie of previousCookies) response.cookies.set(cookie)
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set({ name, value, ...options })
        }
        // SSR supplies these headers to prevent refreshed sessions being cached.
        for (const name of ['cache-control', 'expires', 'pragma']) {
          const value = previousHeaders.get(name)
          if (value) response.headers.set(name, value)
        }
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value)
        }
      },
    },
  })

  return {
    supabase,
    get response() {
      return response
    },
  }
}

export const createServerAdminClient = (
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) => {
  const { url, serviceRole } = getSupabaseConfig(true)
  return serverClient<Database>(url, serviceRole!, {
    cookies: createCookieHandler(cookieStore),
  })
}

// Real service-role client: NO cookies, NO session. Use this when a server
// route needs to bypass RLS or call SECURITY DEFINER RPCs granted to
// service_role only. `createServerAdminClient` above is the SSR variant that
// passes the user's JWT as Authorization (service_role only as apikey), which
// PostgREST treats as the user's authenticated role — fine for ops that
// should still respect the user's identity, wrong for true admin ops.
/** Cookie-free anonymous client for public reads inside shared caches. */
export const createServerAnonClient = () => {
  const { url, anonKey } = getSupabaseConfig()
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: createRoutedSupabaseFetch('anon', { noStore: true }),
    },
  })
}

export const createServerServiceRoleClient = (
  options: { noStore?: boolean; readSource?: 'app' } = {},
) => {
  const { url, serviceRole } = getSupabaseConfig(true)
  return createClient<Database>(url, serviceRole!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: createRoutedSupabaseFetch('service_role', options) },
  })
}

export async function createDbScriptClient() {
  const isDevelopment = process.env.NODE_ENV === 'development'
  if (!isDevelopment) {
    throw new Error(
      'createDbScriptClient can only be called in development mode',
    )
  }
  const { url, serviceRole } = getSupabaseConfig(true)
  return createClient<Database>(url!, serviceRole!)
}
