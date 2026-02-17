import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/utils/supabase'

// ─── Constants ───────────────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security':
    'max-age=63072000; includeSubDomains; preload',
}

// Known bot/scraper UA substrings (lowercase)
const BOT_UA_PATTERNS = [
  'python-requests',
  'python-urllib',
  'python/',
  'curl/',
  'wget/',
  'scrapy',
  'axios/',
  'go-http-client',
  'java/',
  'libwww-perl',
  'headlesschrome',
  'phantomjs',
  'selenium',
  'puppeteer',
  'playwright',
  'httpie',
  'node-fetch',
  'undici',
  'apache-httpclient',
  'okhttp',
  'postman',
  'insomnia',
  'aiohttp',
  'http.rb',
  'rest-client',
  'mechanize',
  'colly',
  'httpclient',
  'http_request',
  'lwp-trivial',
  'twit/',
  'pycurl',
  'libcurl',
]

// Social preview bots that should always pass through (lowercase)
const PREVIEW_BOT_PATTERNS = [
  'twitterbot',
  'facebookexternalhit',
  'facebot',
  'slackbot',
  'slack-imgproxy',
  'discordbot',
  'googlebot',
  'bingbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'applebot',
  'pinterestbot',
  'redditbot',
  'rogerbot',
  'embedly',
  'quora link preview',
  'outbrain',
  'vkshare',
  'skypeuripreview',
  'iframely',
]

// ─── In-memory rate limiting (secondary signal) ──────────────────────────────

const rateLimitMap = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60_000
const IN_MEMORY_MAX_DEFAULT = 30
const IN_MEMORY_MAX_SG = 5
const CLEANUP_INTERVAL_MS = 5 * 60_000

let lastCleanup = Date.now()

function cleanupStaleEntries() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  rateLimitMap.forEach((timestamps, ip) => {
    const filtered = timestamps.filter((t) => t > cutoff)
    if (filtered.length === 0) {
      rateLimitMap.delete(ip)
    } else {
      rateLimitMap.set(ip, filtered)
    }
  })
}

function checkInMemoryRateLimit(ip: string, maxRequests: number): boolean {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const timestamps = rateLimitMap.get(ip) || []
  const recent = timestamps.filter((t) => t > cutoff)
  if (recent.length >= maxRequests) {
    rateLimitMap.set(ip, recent)
    return true
  }
  recent.push(now)
  rateLimitMap.set(ip, recent)
  return false
}

// ─── Cookie-based rate limiting ──────────────────────────────────────────────

interface RateLimitData {
  c: number // count
  s: number // window start timestamp
}

function parseCookieRateLimit(cookieValue: string | undefined): RateLimitData | null {
  if (!cookieValue) return null
  try {
    const json = Buffer.from(cookieValue, 'base64').toString('utf-8')
    const data = JSON.parse(json) as RateLimitData
    if (typeof data.c === 'number' && typeof data.s === 'number') {
      return data
    }
  } catch {
    // Malformed cookie — treat as no data
  }
  return null
}

function encodeCookieRateLimit(data: RateLimitData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64')
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPreviewBot(ua: string): boolean {
  const lower = ua.toLowerCase()
  return PREVIEW_BOT_PATTERNS.some((p) => lower.includes(p))
}

function isBotUA(ua: string): boolean {
  const lower = ua.toLowerCase()
  return BOT_UA_PATTERNS.some((p) => lower.includes(p))
}

function getIp(request: NextRequest): string {
  return (
    request.ip ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

function blocked(status: number, body: string, extraHeaders?: Record<string, string>): NextResponse {
  const resp = new NextResponse(body, { status, headers: extraHeaders })
  return addSecurityHeaders(resp)
}

// ─── JS Challenge HTML ──────────────────────────────────────────────────────

function buildChallengeHtml(url: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Verifying</title></head>
<body>
<noscript><p>Please enable JavaScript to view this page.</p></noscript>
<script>
(function(){
  var t=Math.floor(Date.now()/3600000).toString(36);
  document.cookie="__cc="+t+";path=/;max-age=3600;SameSite=Lax";
  window.location.replace(${JSON.stringify(url)});
})();
</script>
</body></html>`
}

function isValidChallengeCookie(value: string | undefined): boolean {
  if (!value) return false
  const expected = Math.floor(Date.now() / 3600000).toString(36)
  // Accept current hour and previous hour to avoid edge-case failures
  const prevHour = Math.floor(Date.now() / 3600000 - 1).toString(36)
  return value === expected || value === prevHour
}

// ─── Main Middleware ─────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ua = request.headers.get('user-agent') || ''
  const isTweetsRoute = pathname.startsWith('/tweets/')
  const previewBot = isPreviewBot(ua)

  // ── Stage 1: Bot User-Agent Detection (all routes) ──────────────────────
  if (!previewBot) {
    // Block empty or missing UA
    if (!ua || ua.trim().length === 0) {
      return blocked(403, 'Forbidden')
    }

    // Block suspiciously short UAs (real browsers have 100+ char UAs)
    if (ua.length < 30) {
      return blocked(403, 'Forbidden')
    }

    // Block known bot/scraper UA strings
    if (isBotUA(ua)) {
      return blocked(403, 'Forbidden')
    }
  }

  // ── Stage 2: Browser Header Fingerprinting (/tweets/ only) ──────────────
  if (isTweetsRoute && !previewBot) {
    const accept = request.headers.get('accept') || ''
    const acceptLang = request.headers.get('accept-language')
    const acceptEnc = request.headers.get('accept-encoding') || ''

    // Real browsers request text/html for page navigations
    const hasHtmlAccept = accept.includes('text/html')
    // Real browsers always send Accept-Language
    const hasLang = !!acceptLang
    // Real browsers support gzip or br
    const hasCompression = acceptEnc.includes('gzip') || acceptEnc.includes('br')

    if (!hasHtmlAccept || !hasLang || !hasCompression) {
      return blocked(403, 'Forbidden')
    }
  }

  // ── Stage 3: Geo-Aware Rate Limiting (/tweets/ only) ────────────────────
  if (isTweetsRoute) {
    const ip = getIp(request)
    const country = request.headers.get('x-vercel-ip-country') || ''
    const isSG = country === 'SG'
    const maxRequests = isSG ? IN_MEMORY_MAX_SG : IN_MEMORY_MAX_DEFAULT

    cleanupStaleEntries()

    // Cookie-based rate limit (works across serverless instances)
    const cookieMaxRequests = isSG ? 5 : 30
    const rlCookie = request.cookies.get('__rl')?.value
    const rlData = parseCookieRateLimit(rlCookie)
    const now = Date.now()

    let cookieLimited = false
    let newRlData: RateLimitData

    if (rlData && now - rlData.s < RATE_LIMIT_WINDOW_MS) {
      // Within current window
      if (rlData.c >= cookieMaxRequests) {
        cookieLimited = true
      }
      newRlData = { c: rlData.c + 1, s: rlData.s }
    } else {
      // New window
      newRlData = { c: 1, s: now }
    }

    // In-memory rate limit (secondary)
    const memoryLimited = checkInMemoryRateLimit(ip, maxRequests)

    if (cookieLimited || memoryLimited) {
      const resp = blocked(429, 'Too Many Requests', { 'Retry-After': '60' })
      resp.cookies.set('__rl', encodeCookieRateLimit(newRlData), {
        path: '/',
        maxAge: 60,
        sameSite: 'lax',
        httpOnly: true,
      })
      return resp
    }

    // Update the cookie for non-limited requests (carried forward in Stage 5 response)
    // We'll set it on the final response below
    ;(request as any).__newRlData = newRlData
  }

  // ── Stage 4: JS Challenge Gate (/tweets/[id] only, first visit) ─────────
  if (isTweetsRoute && !previewBot) {
    const challengeCookie = request.cookies.get('__cc')?.value
    if (!isValidChallengeCookie(challengeCookie)) {
      const challengeHtml = buildChallengeHtml(request.url)
      const resp = new NextResponse(challengeHtml, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      })
      // Still set rate limit cookie on challenge response
      const newRlData = (request as any).__newRlData as RateLimitData | undefined
      if (newRlData) {
        resp.cookies.set('__rl', encodeCookieRateLimit(newRlData), {
          path: '/',
          maxAge: 60,
          sameSite: 'lax',
          httpOnly: true,
        })
      }
      return addSecurityHeaders(resp)
    }
  }

  // ── Stage 5: Conditional Supabase Session Refresh ───────────────────────
  let response: NextResponse

  // Only call Supabase if auth cookies exist
  const hasAuthCookies = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

  if (hasAuthCookies) {
    try {
      const { supabase, response: supabaseResponse } = createMiddlewareClient(request)
      await supabase.auth.getSession()
      response = supabaseResponse
    } catch {
      response = NextResponse.next({ request: { headers: request.headers } })
    }
  } else {
    response = NextResponse.next({ request: { headers: request.headers } })
  }

  // ── Stage 6: Security Headers (all responses) ──────────────────────────
  addSecurityHeaders(response)

  // Set rate limit cookie on final response
  const newRlData = (request as any).__newRlData as RateLimitData | undefined
  if (newRlData) {
    response.cookies.set('__rl', encodeCookieRateLimit(newRlData), {
      path: '/',
      maxAge: 60,
      sameSite: 'lax',
      httpOnly: true,
    })
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt (crawler rules)
     * - sitemap.xml (sitemap)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
}
