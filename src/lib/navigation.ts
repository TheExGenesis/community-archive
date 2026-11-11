import { analyticsRoute } from './analyticsRoutes'
import { BANGERS_WEEK_HREF } from './portal/bangers'
import { isTwitterUsername } from './apiInputValidation'

export interface NavItem {
  href: string
  label: string
}

export function navAnalyticsDestination(href: string): string {
  if (href.includes('#upload-archive')) return 'upload_archive'
  return analyticsRoute(href).page
}

export type TweetOrigin =
  | 'home'
  | 'stream'
  | 'bangers'
  | 'digest'
  | 'opportunities'
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
  // Bulletin launched as /opportunities. The origin key stays so ?from= links
  // and PostHog tweet-origin breakdowns remain continuous.
  opportunities: {
    href: '/bulletin',
    label: 'Back to Bulletin',
    matches: (href) => href === '/bulletin' || href.startsWith('/bulletin?'),
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

export type NavIcon =
  | 'bangers'
  | 'strands'
  | 'users'
  | 'stream'
  | 'trends'
  | 'graph'
  | 'bulletin'
  | 'map'
  | 'tube'
  | 'ask'
  | 'week'
  | 'spread'

export interface NavMenuItem extends NavItem {
  description: string
  icon: NavIcon
  /** Shown only while Ask the archive is visible to the viewer. */
  requiresAsk?: true
  /** Shown only to admins (or the localhost admin preview of `pnpm dev`). */
  requiresAdmin?: true
}

export interface NavGroup {
  label: string
  items: NavMenuItem[]
}

export type NavEntry = NavGroup | NavItem

export const isNavGroup = (entry: NavEntry): entry is NavGroup =>
  'items' in entry

/**
 * Single source of truth for site navigation: Home, Today's Digest, the
 * archive menu, Community, the Tools menu of first-party products, then
 * Research — the same for every audience.
 */
export const getPrimaryNav = (): NavEntry[] => [
  { href: '/', label: 'Home' },
  { href: '/digest', label: "Today's Digest" },
  {
    label: 'Explore archive',
    items: [
      {
        href: '/search/ask',
        label: 'Ask the archive',
        description:
          'Ask a question; an agent searches members’ tweets and cites them.',
        icon: 'ask',
        requiresAsk: true,
      },
      {
        href: '/user-dir',
        label: 'Explore by user',
        description: 'Browse people and their archived tweets.',
        icon: 'users',
      },
      {
        href: '/stream',
        label: 'Live Stream',
        description:
          "Watch tweets arrive from the community's browser extensions.",
        icon: 'stream',
      },
      {
        href: '/digest/week',
        label: 'The Week in Review',
        description: "The week's top stories, woven from the daily digests.",
        icon: 'week',
      },
    ],
  },
  { href: '/community', label: 'Community' },
  {
    label: 'Tools',
    items: [
      {
        href: BANGERS_WEEK_HREF,
        label: 'Bangers',
        description: 'The best tweets of all time.',
        icon: 'bangers',
      },
      {
        href: '/strands',
        label: 'Strands',
        description: 'Follow ideas and narratives as they evolve over time.',
        icon: 'strands',
      },
      {
        href: '/conversation-map',
        label: 'Conversation Map',
        description: 'A zoomable map of each year’s most-quoted posts.',
        icon: 'map',
      },
      {
        href: '/tube',
        label: 'CA Tube',
        description: 'YouTube videos the community keeps sharing.',
        icon: 'tube',
      },
      {
        href: '/bulletin',
        label: 'Bulletin Board',
        description: 'Asks, offers, and opportunities across the community.',
        icon: 'bulletin',
      },
      {
        href: '/trends',
        label: 'Trends',
        description: 'Discover what the community is talking about.',
        icon: 'trends',
      },
      {
        href: '/social-graph',
        label: 'Social Graph',
        description: 'Explore connections between people and ideas.',
        icon: 'graph',
      },
      {
        href: '/admin/spread-explorer',
        label: 'Spread Explorer',
        description: 'Admin: how any word spreads across the TPOT hex map.',
        icon: 'spread',
        requiresAdmin: true,
      },
    ],
  },
  { href: '/research', label: 'Research' },
]

/** Links rendered in the header's right-hand utility cluster. */
export const getUtilityNav = (): NavItem[] => [{ href: '/docs', label: 'Docs' }]

/** Everything the mobile menu shows: primary + utilities + search. */
export const getMobileNav = (): NavEntry[] => [
  ...getPrimaryNav(),
  ...getUtilityNav(),
  { href: '/search', label: 'Search' },
]

/** Every link a nav renders, with groups expanded in place. */
export const flattenNav = (entries: NavEntry[]): NavItem[] =>
  entries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]))

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href.includes('#')) return false
  const itemPathname = href.split('?')[0]
  return (
    pathname === itemPathname ||
    (itemPathname !== '/' && pathname.startsWith(`${itemPathname}/`))
  )
}

/** A group's items the viewer may see: Ask the archive only while visible,
 *  admin tools only for admins. The pages enforce access themselves. */
export const visibleNavItems = (
  group: NavGroup,
  {
    askVisible,
    isAdmin = false,
    localPreview = null,
  }: {
    askVisible: boolean
    isAdmin?: boolean
    localPreview?: 'admin' | 'signed-out' | null
  },
): NavMenuItem[] =>
  group.items.filter(
    (item) =>
      (!item.requiresAsk || askVisible) &&
      (!item.requiresAdmin || isAdmin || localPreview === 'admin'),
  )

export const isNavGroupActive = (pathname: string, group: NavGroup): boolean =>
  group.items.some((item) => isNavItemActive(pathname, item.href))
