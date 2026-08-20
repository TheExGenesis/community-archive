import { BANGERS_ALL_TIME_HREF } from './portal/bangers'
import { isTwitterUsername } from './apiInputValidation'

export interface NavItem {
  href: string
  label: string
  tone?: 'muted'
}

export function navAnalyticsDestination(href: string): string {
  if (href.startsWith('/bangers')) return 'bangers'
  if (href.startsWith('/digest')) return 'digest'
  if (href.startsWith('/docs')) return 'docs'
  if (href.startsWith('/research')) return 'research'
  if (href.startsWith('/search')) return 'search'
  if (href.startsWith('/settings')) return 'settings'
  if (href.startsWith('/social-graph')) return 'social_graph'
  if (href.startsWith('/stream')) return 'live_stream'
  if (href.startsWith('/trends')) return 'trends'
  if (href.startsWith('/user-dir')) return 'user_directory'
  if (href.startsWith('/user/')) return 'user_profile'
  if (href.includes('#upload-archive')) return 'upload_archive'
  if (href.startsWith('/admin')) return 'admin'
  return 'home'
}

export type TweetOrigin =
  | 'home'
  | 'stream'
  | 'bangers'
  | 'digest'
  | 'trends'
  | 'search'
  | 'profile'

export function userProfileHref(
  username: string | null | undefined,
  accountId?: string | null,
): string {
  const cleanUsername = username?.trim().replace(/^@/, '')
  const validUsername =
    cleanUsername &&
    isTwitterUsername(cleanUsername) &&
    !/^\d+$/.test(cleanUsername)
      ? cleanUsername
      : null
  if (validUsername) return `/user/${encodeURIComponent(validUsername)}`
  return accountId ? `/user/${encodeURIComponent(accountId)}` : '/user-dir'
}

export interface TweetBackLink {
  href: string
  label: string
  hasKnownOrigin: boolean
}

const TWEET_ORIGINS: Record<
  TweetOrigin,
  { href: string; label: string; matches: (href: string) => boolean }
> = {
  home: {
    href: '/',
    label: 'Back to homepage',
    matches: (href) => href === '/' || href.startsWith('/?'),
  },
  stream: {
    href: '/stream',
    label: 'Back to live stream',
    matches: (href) => href === '/stream' || href.startsWith('/stream?'),
  },
  bangers: {
    href: '/bangers',
    label: 'Back to Bangers',
    matches: (href) => href === '/bangers' || href.startsWith('/bangers?'),
  },
  digest: {
    href: '/digest',
    label: 'Back to What Happened Yesterday',
    matches: (href) => href === '/digest' || href.startsWith('/digest/'),
  },
  trends: {
    href: '/trends',
    label: 'Back to Trends',
    matches: (href) => href === '/trends' || href.startsWith('/trends?'),
  },
  search: {
    href: '/search',
    label: 'Back to search',
    matches: (href) => href === '/search' || href.startsWith('/search?'),
  },
  profile: {
    href: '/user-dir',
    label: 'Back to profile',
    matches: (href) => href.startsWith('/user/'),
  },
}

function isTweetOrigin(value: string | undefined): value is TweetOrigin {
  return Boolean(value && value in TWEET_ORIGINS)
}

function safeReturnTo(origin: TweetOrigin, value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return TWEET_ORIGINS[origin].href
  }
  return TWEET_ORIGINS[origin].matches(value)
    ? value
    : TWEET_ORIGINS[origin].href
}

export function tweetPermalinkHref(
  tweetId: string,
  origin?: TweetOrigin,
  returnTo?: string,
): string {
  const pathname = `/tweets/${encodeURIComponent(tweetId)}`
  if (!origin) return pathname
  const params = new URLSearchParams({
    from: origin,
    returnTo: safeReturnTo(origin, returnTo),
  })
  return `${pathname}?${params.toString()}`
}

export function getTweetBackLink(searchParams?: {
  from?: string | string[]
  returnTo?: string | string[]
}): TweetBackLink {
  const from = Array.isArray(searchParams?.from)
    ? searchParams?.from[0]
    : searchParams?.from
  if (!isTweetOrigin(from)) {
    return {
      href: '/',
      label: 'Back to Community Archive',
      hasKnownOrigin: false,
    }
  }
  const requestedReturnTo = Array.isArray(searchParams?.returnTo)
    ? searchParams?.returnTo[0]
    : searchParams?.returnTo
  return {
    href: safeReturnTo(from, requestedReturnTo),
    label: TWEET_ORIGINS[from].label,
    hasKnownOrigin: true,
  }
}

/**
 * Single source of truth for site navigation, keyed by audience.
 *
 * Logged out: the marketing/educational funnel — what the archive is, what's
 * built on it, and how to contribute.
 * Logged in: the portal workspace — the member's daily views of the data.
 */
export const getPrimaryNav = (isMember: boolean, isAdmin = false): NavItem[] =>
  isMember || isAdmin
    ? [
        { href: BANGERS_ALL_TIME_HREF, label: 'Bangers' },
        { href: '/digest', label: 'Digest' },
        { href: '/user-dir', label: 'Users' },
        { href: '/trends', label: 'Trends' },
        { href: '/stream', label: 'Live stream' },
        ...(isAdmin
          ? ([
              { href: '/social-graph', label: 'Graph', tone: 'muted' },
            ] satisfies NavItem[])
          : []),
        { href: '/research', label: 'Research' },
      ]
    : [
        { href: BANGERS_ALL_TIME_HREF, label: 'Bangers' },
        { href: '/digest', label: 'Digest' },
        { href: '/user-dir', label: 'Users' },
        { href: '/docs', label: 'Docs' },
        { href: '/#upload-archive', label: 'Upload archive' },
      ]

/** Links rendered in the header's right-hand utility cluster. */
export const getUtilityNav = (isMember: boolean): NavItem[] =>
  isMember ? [{ href: '/docs', label: 'Docs' }] : []

/** Everything the mobile hamburger shows: primary + utilities + search. */
export const getMobileNav = (isMember: boolean, isAdmin = false): NavItem[] => [
  ...getPrimaryNav(isMember, isAdmin),
  ...getUtilityNav(isMember),
  { href: '/search', label: 'Search' },
]

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href.includes('#')) return false
  const itemPathname = href.split('?')[0]
  return (
    pathname === itemPathname ||
    (itemPathname !== '/' && pathname.startsWith(`${itemPathname}/`))
  )
}
