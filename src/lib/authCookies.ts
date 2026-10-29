// Supabase stores the session either as one `sb-<ref>-auth-token` cookie or,
// when it is larger than one cookie, as `sb-<ref>-auth-token.0`, `.1`, …
// chunks. The library reads the unchunked name first and only falls back to
// the chunks when it is absent, so a stale unchunked cookie that it cannot
// delete (HttpOnly, or set for a parent domain by another deployment) shadows
// every fresh chunked login: the stale refresh token is rejected and the
// client then removes all auth cookies, including the valid ones.
//
// These helpers pick the newest decodable session when both shapes are
// present, hide the loser from the Supabase client, and describe the cookie
// deletions needed to clear it on every scope we could have written.

export type CookieLike = { name: string; value: string }

export type CookieDeletion = {
  name: string
  value: ''
  options: { path: '/'; maxAge: 0; domain?: string }
}

const AUTH_TOKEN_COOKIE = /^(sb-.+?-auth-token)(?:\.(\d+))?$/
const BASE64_PREFIX = 'base64-'

// Registrable suffixes we deploy under that must never receive a Domain cookie.
const PUBLIC_SUFFIXES = new Set([
  'vercel.app',
  'netlify.app',
  'pages.dev',
  'github.io',
  'ngrok-free.app',
])

function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function parseSession(text: string): { expiresAt: number | null } | null {
  const parsed: unknown = JSON.parse(text)
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { access_token?: unknown }).access_token !== 'string'
  ) {
    return null
  }
  const expiresAt = (parsed as { expires_at?: unknown }).expires_at
  return { expiresAt: typeof expiresAt === 'number' ? expiresAt : null }
}

/** Decodes a stored session cookie value (current base64url or legacy JSON). */
export function decodeStoredSession(
  value: string,
): { expiresAt: number | null } | null {
  try {
    if (value.startsWith(BASE64_PREFIX)) {
      return parseSession(decodeBase64Url(value.slice(BASE64_PREFIX.length)))
    }
  } catch {
    return null
  }
  for (const candidate of [value, safeDecodeURIComponent(value)]) {
    if (candidate === null) continue
    try {
      return parseSession(candidate)
    } catch {
      // try the next representation
    }
  }
  return null
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function combineChunks<T extends CookieLike>(
  base: string,
  chunks: T[],
): string | null {
  const byIndex = new Map(
    chunks.map((cookie) => [
      Number(cookie.name.slice(base.length + 1)),
      cookie.value,
    ]),
  )
  const parts: string[] = []
  for (let index = 0; byIndex.has(index); index += 1) {
    parts.push(byIndex.get(index)!)
  }
  return parts.length ? parts.join('') : null
}

/**
 * Removes stale duplicate session cookies from a cookie list.
 *
 * Returns the cookies the Supabase client should see and the names of the
 * cookies that lost, so callers can expire them.
 */
export function reconcileAuthCookies<T extends CookieLike>(
  cookies: readonly T[],
): { cookies: T[]; stale: string[] } {
  const groups = new Map<string, { single: T[]; chunks: T[] }>()
  for (const cookie of cookies) {
    const match = AUTH_TOKEN_COOKIE.exec(cookie.name)
    if (!match) continue
    const group = groups.get(match[1]) ?? { single: [], chunks: [] }
    ;(match[2] === undefined ? group.single : group.chunks).push(cookie)
    groups.set(match[1], group)
  }

  const stale = new Set<string>()
  groups.forEach(({ single, chunks }, base) => {
    if (single.length === 0 || chunks.length === 0) return

    const singleSession = decodeStoredSession(single[0].value)
    const combined = combineChunks(base, chunks)
    const chunkedSession = combined ? decodeStoredSession(combined) : null

    let keepChunks: boolean
    if (chunkedSession && singleSession) {
      keepChunks =
        (chunkedSession.expiresAt ?? 0) >= (singleSession.expiresAt ?? 0)
    } else {
      // An undecodable single cookie is always stale. When neither decodes,
      // keep the chunks so the client sees the same "absent" session it
      // would without the stale single cookie.
      keepChunks = !singleSession
    }

    for (const cookie of keepChunks ? single : chunks) stale.add(cookie.name)
  })

  if (stale.size === 0) return { cookies: cookies.slice(), stale: [] }
  return {
    cookies: cookies.filter((cookie) => !stale.has(cookie.name)),
    stale: Array.from(stale).sort(),
  }
}

/**
 * The parent domain a legacy cookie may have been scoped to, e.g.
 * `.community-archive.org` for `www.community-archive.org`. Null for
 * localhost, IP addresses and shared hosting suffixes.
 */
export function legacyCookieDomain(host?: string | null): string | null {
  if (!host) return null
  const hostname = host.split(':')[0].trim().toLowerCase()
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    /^[\d.]+$/.test(hostname) ||
    hostname.includes(':')
  ) {
    return null
  }
  const labels = hostname.split('.')
  if (labels.length < 2) return null
  const apex = labels.slice(-2).join('.')
  if (PUBLIC_SUFFIXES.has(apex)) return null
  return `.${apex}`
}

/**
 * Deletions that clear a stale auth cookie on every scope this app or an
 * earlier deployment could have used: host-only, and the parent domain when
 * the host has one.
 */
export function authCookieDeletions(
  names: readonly string[],
  host?: string | null,
): CookieDeletion[] {
  const domain = legacyCookieDomain(host)
  return names.flatMap((name) => {
    const deletions: CookieDeletion[] = [
      { name, value: '', options: { path: '/', maxAge: 0 } },
    ]
    if (domain) {
      deletions.push({
        name,
        value: '',
        options: { path: '/', maxAge: 0, domain },
      })
    }
    return deletions
  })
}

/** Parses `document.cookie` into name/value pairs without decoding values. */
export function parseDocumentCookie(cookieHeader: string): CookieLike[] {
  return cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf('=')
      return separator < 0
        ? { name: entry, value: '' }
        : { name: entry.slice(0, separator), value: entry.slice(separator + 1) }
    })
}
