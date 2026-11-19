/**
 * Checks the boundary set by 20261119190000_retire_anon_corpus_access.sql
 * through PostgREST, the way outside clients and the browser reach it.
 *
 *   SUPABASE_URL=...  SUPABASE_ANON_KEY=...  \
 *   [SUPABASE_AUTHENTICATED_JWT=...]  [SUPABASE_SERVICE_ROLE_KEY=...]  \
 *     pnpm script scripts/check-anon-corpus-access.mts
 *
 * As anon, corpus reads must fail while the app features the website and the
 * browser extension use keep working. With a signed-in user's access token,
 * signed-in search must still work; with the service-role key, the server's
 * Bulletin read must still work (the Bulletin has no anonymous database read).
 * Exits non-zero on any unexpected result. Read-only: every call is a SELECT
 * or a read RPC.
 */

const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
const anonKey = process.env.SUPABASE_ANON_KEY
const userJwt = process.env.SUPABASE_AUTHENTICATED_JWT
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY.')
  process.exit(2)
}

type Expect = 'allowed' | 'denied'
interface Check {
  name: string
  role: 'anon' | 'authenticated' | 'service_role'
  expect: Expect
  path: string
  body?: Record<string, unknown>
  profile?: string
  /** The function itself rejects anon callers; reaching it proves EXECUTE. */
  reachedIsAllowed?: boolean
}

const now = new Date()
const dayAgo = new Date(now.getTime() - 86_400_000)

const checks: Check[] = [
  // Corpus: denied to anon.
  {
    name: 'tweets',
    role: 'anon',
    expect: 'denied',
    path: '/rest/v1/tweets?select=tweet_id&limit=1',
  },
  {
    name: 'enriched_tweets',
    role: 'anon',
    expect: 'denied',
    path: '/rest/v1/enriched_tweets?select=tweet_id&limit=1',
  },
  {
    name: 'quote_tweets',
    role: 'anon',
    expect: 'denied',
    path: '/rest/v1/quote_tweets?select=tweet_id&limit=1',
  },
  {
    name: 'followers',
    role: 'anon',
    expect: 'denied',
    path: '/rest/v1/followers?select=account_id&limit=1',
  },
  {
    name: 'global_activity_summary',
    role: 'anon',
    expect: 'denied',
    path: '/rest/v1/global_activity_summary?select=*&limit=1',
  },
  {
    name: 'tweet_page_summaries',
    role: 'anon',
    expect: 'denied',
    path: '/rest/v1/tweet_page_summaries?select=*&limit=1',
  },
  {
    name: 'rpc search_tweets',
    role: 'anon',
    expect: 'denied',
    path: '/rest/v1/rpc/search_tweets',
    body: { search_query: 'archive', limit_: 1 },
  },
  {
    name: 'rpc get_streaming_stats_daily',
    role: 'anon',
    expect: 'denied',
    path: '/rest/v1/rpc/get_streaming_stats_daily',
    body: { p_start_date: dayAgo.toISOString(), p_end_date: now.toISOString() },
  },
  {
    name: 'rpc get_tweet_page_data',
    role: 'anon',
    expect: 'denied',
    path: '/rest/v1/rpc/get_tweet_page_data',
    body: { p_tweet_id: '1' },
  },
  // App features: still allowed to anon.
  {
    name: 'account',
    role: 'anon',
    expect: 'allowed',
    path: '/rest/v1/account?select=account_id&limit=1',
  },
  {
    name: 'profile',
    role: 'anon',
    expect: 'allowed',
    path: '/rest/v1/profile?select=account_id&limit=1',
  },
  {
    name: 'user_directory',
    role: 'anon',
    expect: 'allowed',
    path: '/rest/v1/user_directory?select=account_id&limit=1',
  },
  {
    name: 'digest_editions',
    role: 'anon',
    expect: 'allowed',
    path: '/rest/v1/digest_editions?select=id&limit=1',
  },
  {
    name: 'rpc search_user_suggestions',
    role: 'anon',
    expect: 'allowed',
    path: '/rest/v1/rpc/search_user_suggestions',
    body: { search_text: 'a', result_limit: 1 },
  },
  {
    name: 'tes.blocked_scraping_users',
    role: 'anon',
    expect: 'allowed',
    path: '/rest/v1/blocked_scraping_users?select=account_id&limit=1',
    profile: 'tes',
  },
  {
    name: 'rpc tes.get_user_intercepted_stats',
    role: 'anon',
    expect: 'allowed',
    path: '/rest/v1/rpc/get_user_intercepted_stats',
    body: { days_back: 1 },
    profile: 'tes',
    reachedIsAllowed: true,
  },
]
if (userJwt)
  checks.push(
    {
      name: 'signed-in rpc search_tweets',
      role: 'authenticated',
      expect: 'allowed',
      path: '/rest/v1/rpc/search_tweets',
      body: { search_query: 'archive', limit_: 1 },
    },
    {
      name: 'signed-in rpc search_tweets_exact_phrase',
      role: 'authenticated',
      expect: 'allowed',
      path: '/rest/v1/rpc/search_tweets_exact_phrase',
      body: { exact_phrase: 'the archive', limit_: 1 },
    },
    {
      name: 'signed-in tweets',
      role: 'authenticated',
      expect: 'allowed',
      path: '/rest/v1/tweets?select=tweet_id&limit=1',
    },
  )
if (serviceRoleKey)
  checks.push({
    name: 'service-role rpc get_bulletin_board_state',
    role: 'service_role',
    expect: 'allowed',
    path: '/rest/v1/rpc/get_bulletin_board_state',
    body: { max_results: 1 },
  })

let failures = 0
for (const check of checks) {
  const bearer =
    check.role === 'anon'
      ? anonKey
      : check.role === 'authenticated'
        ? userJwt!
        : serviceRoleKey!
  const headers: Record<string, string> = {
    apikey: check.role === 'service_role' ? serviceRoleKey! : anonKey,
    Authorization: `Bearer ${bearer}`,
  }
  if (check.profile) {
    headers[check.body ? 'Content-Profile' : 'Accept-Profile'] = check.profile
  }
  if (check.body) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${url}${check.path}`, {
    method: check.body ? 'POST' : 'GET',
    headers,
    body: check.body ? JSON.stringify(check.body) : undefined,
  })
  const text = await response.text()
  // PostgREST answers a missing privilege with 401 (anon) or 403 and code 42501.
  const denied =
    !response.ok &&
    (/"42501"/.test(text) || [401, 403].includes(response.status))
  const outcome: Expect | 'error' =
    response.ok || (check.reachedIsAllowed && !denied)
      ? 'allowed'
      : denied
        ? 'denied'
        : 'error'
  const ok = outcome === check.expect
  if (!ok) failures += 1
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${check.role.padEnd(13)} ${check.name.padEnd(42)} expected ${check.expect}, got ${outcome} (${response.status})${ok ? '' : ` ${text.slice(0, 160)}`}`,
  )
}
if (!userJwt)
  console.log('skip signed-in checks: set SUPABASE_AUTHENTICATED_JWT')
if (!serviceRoleKey)
  console.log('skip Bulletin check: set SUPABASE_SERVICE_ROLE_KEY')
console.log(failures ? `${failures} check(s) failed` : 'all checks passed')
process.exit(failures ? 1 : 0)
