import { BANGERS_ALL_TIME_HREF } from './portal/bangers'

export interface NavItem {
  href: string
  label: string
}

export type TweetOrigin = 'home' | 'bangers' | 'trends' | 'search'

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
  bangers: {
    href: '/bangers',
    label: 'Back to Bangers',
    matches: (href) => href === '/bangers' || href.startsWith('/bangers?'),
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
export const getPrimaryNav = (isMember: boolean): NavItem[] =>
  isMember
    ? [
        { href: '/', label: 'Home' },
        { href: '/user-dir', label: 'Users' },
        { href: '/stream', label: 'Live stream' },
        { href: BANGERS_ALL_TIME_HREF, label: 'Bangers' },
        { href: '/trends', label: 'Trends' },
        { href: '/social-graph', label: 'Graph' },
        { href: '/research', label: 'Research' },
        { href: '/tools', label: 'Tools' },
      ]
    : [
        { href: '/#products', label: 'Tools' },
        { href: '/user-dir', label: 'Library' },
        { href: '/docs', label: 'Docs' },
        { href: '/#upload-archive', label: 'Upload archive' },
      ]

/** Links rendered in the header's right-hand utility cluster. */
export const getUtilityNav = (isMember: boolean): NavItem[] =>
  isMember ? [{ href: '/docs', label: 'Docs' }] : []

/** Everything the mobile hamburger shows: primary + utilities + search. */
export const getMobileNav = (isMember: boolean): NavItem[] => [
  ...getPrimaryNav(isMember),
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
