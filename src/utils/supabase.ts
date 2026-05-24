import { Database } from '@/database-types'
import { devLog } from '@/lib/devLog'
import {
  createBrowserClient as browserClient,
  createServerClient as serverClient,
  type CookieOptions,
} from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseConfig } from '@/utils/supabaseConfig'

const createCookieHandler = (cookieStore: ReturnType<typeof cookies>) => ({
  get: (name: string) => cookieStore.get(name)?.value,
  set: (name: string, value: string, options: CookieOptions) => {
    try {
      cookieStore.set({ name, value, ...options })
    } catch (error) {
      // The `set` method was called from a Server Component.
      // This can be ignored if you have middleware refreshing user sessions.
    }
  },
  remove: (name: string, options: CookieOptions) => {
    try {
      cookieStore.set({ name, value: '', ...options })
    } catch (error) {
      // The `delete` method was called from a Server Component.
      // This can be ignored if you have middleware refreshing user sessions.
    }
  },
})

export const createBrowserClient = () => {
  const { url, anonKey } = getSupabaseConfig()
  return browserClient<Database>(url, anonKey)
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

export const createServerClient = (cookieStore: ReturnType<typeof cookies>) => {
  const { url, anonKey } = getSupabaseConfig()
  return serverClient<Database>(url, anonKey, {
    cookies: createCookieHandler(cookieStore),
  })
}

export const createMiddlewareClient = (request: NextRequest) => {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const { url, anonKey } = getSupabaseConfig()
  const supabase = serverClient(url, anonKey, {
    cookies: {
      get: (name: string) => request.cookies.get(name)?.value,
      set: (name: string, value: string, options: CookieOptions) => {
        request.cookies.set({ name, value, ...options })
        response = NextResponse.next({ request: { headers: request.headers } })
        response.cookies.set({ name, value, ...options })
      },
      remove: (name: string, options: CookieOptions) => {
        request.cookies.set({ name, value: '', ...options })
        response = NextResponse.next({ request: { headers: request.headers } })
        response.cookies.set({ name, value: '', ...options })
      },
    },
  })

  return { supabase, response }
}

export const createServerAdminClient = (
  cookieStore: ReturnType<typeof cookies>,
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
export const createServerServiceRoleClient = () => {
  const { url, serviceRole } = getSupabaseConfig(true)
  return createClient<Database>(url, serviceRole!, {
    auth: { autoRefreshToken: false, persistSession: false },
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
