export interface NavItem {
  href: string
  label: string
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
        { href: '/user-dir', label: 'Library' },
        { href: '/stream', label: 'Stream' },
        { href: '/trends', label: 'Trends' },
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
