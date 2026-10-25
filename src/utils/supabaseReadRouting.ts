// Imported by the shared Supabase factory. Browser auth always stays on app.
// Only server reads can use the production bridge; keys never enter the client.
export type ReadRole = 'anon' | 'service_role'

// POST is ambiguous for RPCs. Only these audited reads become GET requests;
// publication, view increments, consent, uploads and other mutations stay local.
const READ_RPCS = new Set([
  'resolve_directory_identity',
  'policy_account_is_blocked',
  'policy_json_contains_blocked_author',
  'get_tweet_page_data',
  'get_bulletin_board_state',
  'get_bulletin_runs',
  'get_bulletin_prompts',
  'get_bulletin_refreshes',
  'admin_activity_page',
  'admin_list_blocked_scraping_users',
  'get_simple_streamed_tweet_counts',
  'get_unique_scraper_count',
  'get_tweet_counts_by_granularity',
  'get_tweet_count_by_date',
  'get_scraper_counts_by_granularity',
  'get_account_most_mentioned_accounts',
  'get_top_mentioned_users',
  'search_user_suggestions',
  'search_tweets',
  'search_tweets_exact_phrase',
  'ca_tweet_like_summary',
])

export const isReadRpc = (name: string) => READ_RPCS.has(name)

const PUBLIC_BROWSER_TABLES = new Set([
  'user_directory',
  'all_account',
  'account',
  'all_profile',
  'tweets',
  'enriched_tweets',
  'tweet_media',
  'tweet_urls',
  'user_mentions',
  'mentioned_users',
  'quote_tweets',
  'followers',
  'following',
  'digest_editions',
  'digest_edition_likes',
  'digest_edition_comments',
  'community_projects',
  'community_project_likes',
  'community_project_comments',
])
export function isPublicBrowserRead(path: string) {
  const table = path.match(/^\/rest\/v1\/([a-zA-Z0-9_]+)$/)?.[1]
  const rpc = path.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1]
  return Boolean(
    (table && PUBLIC_BROWSER_TABLES.has(table)) || (rpc && isReadRpc(rpc)),
  )
}

/** Public browser content can use production; auth and personal state stay local. */
export function createBrowserReadFetch(): typeof fetch {
  return async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1]
    if (
      process.env.NEXT_PUBLIC_DATA_READ_SOURCE === 'production' &&
      isPublicBrowserRead(url.pathname) &&
      (method === 'GET' ||
        method === 'HEAD' ||
        (method === 'POST' && rpc && isReadRpc(rpc)))
    ) {
      if (method === 'POST') {
        const params = JSON.parse(String(init?.body ?? '{}'))
        for (const [key, value] of Object.entries(params))
          url.searchParams.set(
            key,
            Array.isArray(value)
              ? `{${value.join(',')}}`
              : typeof value === 'object' && value !== null
                ? JSON.stringify(value)
                : String(value),
          )
      }
      const query = new URLSearchParams({
        path: url.pathname + url.search,
        head: method === 'HEAD' ? '1' : '0',
      })
      const incoming = new Headers(init?.headers)
      const forwarded = new Headers()
      for (const name of ['accept', 'range', 'range-unit', 'prefer']) {
        const value = incoming.get(name)
        if (value) forwarded.set(name, value)
      }
      return fetch(`/api/public-data?${query}`, {
        method: 'GET',
        headers: forwarded,
        cache: 'no-store',
        signal: init?.signal,
      })
    }
    return fetch(input, init)
  }
}

export function productionReadMode(env: NodeJS.ProcessEnv = process.env) {
  const source = env.DATA_READ_SOURCE ?? 'app'
  if (source !== 'app' && source !== 'production')
    throw new Error('DATA_READ_SOURCE must be app or production')
  return source === 'production'
}

export function productionReadCacheKey() {
  return `${process.env.VERCEL_ENV ?? process.env.NODE_ENV}:${process.env.DATA_READ_SOURCE ?? 'app'}:${process.env.PUBLIC_READ_ORIGIN ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}`
}

export function createRoutedSupabaseFetch(
  role: ReadRole,
  options: { noStore?: boolean; readSource?: 'app' } = {},
): typeof fetch {
  return async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    )
    let method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase()
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1]
    const readRpc = method === 'POST' && rpc && READ_RPCS.has(rpc)
    const rest = /^\/rest\/v1\/(?:[a-zA-Z0-9_]+|rpc\/[a-z0-9_]+)$/.test(
      url.pathname,
    )
    const displayFile =
      /^\/storage\/v1\/object\/(?:authenticated\/)?(?:community-app-data|community-project-covers)\//.test(
        url.pathname,
      )
    if (
      typeof window === 'undefined' &&
      options.readSource !== 'app' &&
      productionReadMode() &&
      ((rest && (method === 'GET' || method === 'HEAD' || readRpc)) ||
        (displayFile && method === 'GET'))
    ) {
      const origin = process.env.PUBLIC_READ_ORIGIN
      const secret = process.env.PUBLIC_READ_SECRET
      if (!origin || !secret || secret.length < 32)
        throw new Error('Production read bridge is not configured')
      const target = new URL('/api/public-data', origin)
      if (target.protocol !== 'https:')
        throw new Error('Production read bridge requires HTTPS')
      if (readRpc) {
        const params = JSON.parse(String(init?.body ?? '{}'))
        for (const [key, value] of Object.entries(params))
          url.searchParams.set(
            key,
            Array.isArray(value)
              ? `{${value.join(',')}}`
              : typeof value === 'object' && value !== null
                ? JSON.stringify(value)
                : String(value),
          )
        method = 'GET'
      }
      const incoming = new Headers(init?.headers)
      const forwarded: Record<string, string> = {}
      for (const name of [
        'accept',
        'accept-profile',
        'range',
        'range-unit',
        'prefer',
      ]) {
        const value = incoming.get(name)
        if (value) forwarded[name] = value
      }
      const response = await fetch(target, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'read',
          path: url.pathname + url.search,
          method,
          role,
          headers: forwarded,
        }),
        cache: 'no-store',
        redirect: 'error',
        signal: init?.signal ?? AbortSignal.timeout(15_000),
      })
      return response
    }
    if (
      typeof window === 'undefined' &&
      productionReadMode() &&
      !['GET', 'HEAD'].includes(method)
    ) {
      const readOrigin = process.env.PORTAL_READ_SUPABASE_URL
      if (
        url.hostname === 'fabxmporizzqflnftavs.supabase.co' ||
        (readOrigin && url.origin === new URL(readOrigin).origin)
      )
        throw new Error(
          'Staging writes cannot target the production read source',
        )
    }
    return fetch(input, options.noStore ? { ...init, cache: 'no-store' } : init)
  }
}
