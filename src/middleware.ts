import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/utils/supabase'

// In-memory rate limiting for /tweets/ routes.
// NOTE: Best-effort only. On serverless platforms (Vercel), each instance
// has its own map and cold starts reset it. Effective against sustained
// scraping from a single region but not a hard guarantee.
const rateLimitMap = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60 // 60 requests per minute per IP
const CLEANUP_INTERVAL_MS = 5 * 60_000 // 5 minutes

let lastCleanup = Date.now()

function cleanupStaleEntries() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  rateLimitMap.forEach((timestamps: number[], ip: string) => {
    const filtered = timestamps.filter((t: number) => t > cutoff)
    if (filtered.length === 0) {
      rateLimitMap.delete(ip)
    } else {
      rateLimitMap.set(ip, filtered)
    }
  })
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const timestamps = rateLimitMap.get(ip) || []
  const recent = timestamps.filter((t: number) => t > cutoff)
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(ip, recent)
    return true
  }
  recent.push(now)
  rateLimitMap.set(ip, recent)
  return false
}

export async function middleware(request: NextRequest) {
  // Rate limit /tweets/ routes to reduce scraper costs
  if (request.nextUrl.pathname.startsWith('/tweets/')) {
    cleanupStaleEntries()
    const ip =
      request.ip ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown'
    if (isRateLimited(ip)) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': '60',
        },
      })
    }
  }

  try {
    const { supabase, response } = createMiddlewareClient(request)

    // Refresh session if expired - required for Server Components
    // https://supabase.com/docs/guides/auth/auth-helpers/nextjs#managing-session-with-middleware
    await supabase.auth.getSession()

    return response
  } catch (e) {
    // If you are here, a Supabase client could not be created!
    return NextResponse.next({
      request: { headers: request.headers },
    })
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
