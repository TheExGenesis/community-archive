// One registry for navigation capture, payload validation, and route coverage.
export const analyticsRoutes = {
  '/': ['home', 'product'],
  '/bangers': ['bangers', 'product'],
  '/digest': ['digest', 'product'],
  '/digest/[date]': ['digest', 'product'],
  '/digest/week': ['digest', 'product'],
  '/digest/week/[weekStart]': ['digest', 'product'],
  '/digest/week/[weekStart]/[slug]': ['digest_story', 'product'],
  '/digest/[date]/[slug]': ['digest_story', 'product'],
  '/stream': ['live_stream', 'product'],
  '/research': ['research', 'product'],
  '/research/you-can-just-do-things': ['research_article', 'product'],
  '/search': ['search', 'product'],
  '/search/ask': ['ask_archive', 'product'],
  '/settings': ['settings', 'product'],
  '/settings/api-keys': ['api_keys', 'product'],
  '/profile': ['settings', 'product'],
  '/trends': ['trends', 'product'],
  '/trending': ['trend_stories', 'product'],
  '/trending/[date]': ['trend_stories', 'product'],
  '/trending/[date]/[slug]': ['trend_story', 'product'],
  '/library': ['library', 'product'],
  '/more-tools': ['more_tools', 'product'],
  '/tube': ['tube', 'product'],
  '/tube/watch/[id]': ['tube_watch', 'product'],
  '/tube/liked': ['tube_library', 'product'],
  '/tube/history': ['tube_library', 'product'],
  '/tube/later': ['tube_library', 'product'],
  '/tube/categories': ['tube_categories', 'product'],
  '/tube/playlists': ['tube_playlists', 'product'],
  '/tube/settings': ['tube_settings', 'product'],
  '/tube/about': ['tube_about', 'information'],
  '/user-dir': ['user_directory', 'product'],
  '/user/[account_id]': ['user_profile', 'product'],
  // Cached signed-out views; the browser URL stays /user/... or /tweets/...
  '/guest/user/[account_id]': ['user_profile', 'product'],
  '/guest/tweets/[tweet_id]': ['tweet', 'product'],
  '/guest/trends': ['trends', 'product'],
  '/guest/home': ['home', 'product'],
  '/guest/user-dir': ['user_directory', 'product'],
  '/tweets': ['tweets', 'product'],
  '/tweets/[tweet_id]': ['tweet', 'product'],
  '/social-graph': ['social_graph', 'product'],
  '/conversation-map': ['conversation_map', 'product'],
  '/strands': ['strands', 'product'],
  '/strands/[seed]': ['strand', 'product'],
  '/birdseye': ['birdseye', 'product'],
  '/birdseye/profiles': ['birdseye_profiles', 'admin'],
  '/community': ['community', 'product'],
  // Bulletin launched as /opportunities. The page names stay so PostHog history is continuous.
  '/bulletin': ['opportunities', 'product'],
  '/bulletin/about': ['opportunities_about', 'information'],
  '/tools': ['tools', 'product'],
  '/explore': ['explore', 'product'],
  '/notes': ['notes', 'product'],
  '/opt-in': ['opt_in', 'product'],
  '/about': ['about', 'information'],
  '/data-policy': ['data_policy', 'information'],
  '/docs': ['docs', 'product'],
  '/supporters': ['supporters', 'information'],
  '/remove-dms': ['remove_dms', 'utility'],
  '/stream-monitor': ['stream_monitor', 'utility'],
  '/missing-accounts': ['missing_accounts', 'utility'],
  '/spread-explorer': ['spread_explorer', 'product'],
  '/mission-control': ['mission_control', 'admin'],
  '/admin': ['admin', 'admin'],
  '/admin/keywords': ['admin_keywords', 'admin'],
  '/admin/digest': ['admin_digest', 'admin'],
  '/admin/bulletin': ['admin_opportunities', 'admin'],
  '/login': ['login', 'authentication'],
  '/auth/auth-code-error': ['auth_error', 'authentication'],
} as const

export type AnalyticsPage =
  | (typeof analyticsRoutes)[keyof typeof analyticsRoutes][0]
  | 'unknown'
export const analyticsPageNames = [
  ...Array.from(new Set(Object.values(analyticsRoutes).map(([page]) => page))),
  'unknown',
]

export function analyticsRoute(path: string) {
  const pathname = path.split(/[?#]/)[0].replace(/\/$/, '') || '/'
  // Exact matches take precedence over dynamic segments.
  const exact = analyticsRoutes[pathname as keyof typeof analyticsRoutes]
  if (exact) return { page: exact[0], group: exact[1], path: pathname }
  for (const [template, [page, group]] of Object.entries(analyticsRoutes)) {
    if (!template.includes('[')) continue
    const pattern = template.replace(/\[[^\]]+\]/g, '[^/]+')
    if (new RegExp(`^${pattern}$`).test(pathname))
      return { page, group, path: template }
  }
  return { page: 'unknown', group: 'unknown', path: '/unknown' } as const
}

export function analyticsFeature(page: string): string {
  if (page === 'digest_story') return 'digest'
  if (page === 'strand') return 'strands'
  return page
}

// URLs must not carry search text, archive IDs, OAuth codes, or private topics.
export function sanitizeAnalyticsUrl(value: unknown): unknown {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    const ownHost =
      /^(www\.)?community-archive\.org$/.test(url.hostname) ||
      ['localhost', '127.0.0.1'].includes(url.hostname)
    return ownHost
      ? `${url.origin}${analyticsRoute(url.pathname).path}`
      : url.origin
  } catch {
    return undefined
  }
}
