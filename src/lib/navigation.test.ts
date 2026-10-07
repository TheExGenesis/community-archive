import {
  flattenNav,
  getMobileNav,
  getPrimaryNav,
  isNavGroup,
  isNavGroupActive,
  getTweetBackLink,
  isNavItemActive,
  navAnalyticsDestination,
  tweetPermalinkHref,
  userProfileHref,
} from './navigation'

describe('user profile navigation', () => {
  it('prefers readable usernames while retaining account-ID compatibility', () => {
    expect(userProfileHref('exgenesis', '322603863')).toBe('/user/exgenesis')
    expect(userProfileHref('@archive_user', '123')).toBe('/user/archive_user')
    expect(userProfileHref('archive_user')).toBe('/user/archive_user')
    expect(userProfileHref(undefined, '123')).toBe('/user/123')
    expect(userProfileHref('not valid', '123')).toBe('/user/123')
    expect(userProfileHref('123', '456')).toBe('/user/456')
    expect(userProfileHref('a'.repeat(15), '456')).toBe(
      `/user/${'a'.repeat(15)}`,
    )
    expect(userProfileHref('a'.repeat(16), '456')).toBe('/user/456')
  })
})

describe('site navigation', () => {
  it('maps Community navigation to its own analytics destination', () => {
    expect(navAnalyticsDestination('/community')).toBe('community')
  })

  it('leads with Home and the digest, then three menus, then Research', () => {
    const nav = getPrimaryNav()
    expect(nav.map((entry) => entry.label)).toEqual([
      'Home',
      "Today's Digest",
      'Ideas',
      'Explore archive',
      'Community',
      'Research',
    ])
    const menus = Object.fromEntries(
      nav
        .filter(isNavGroup)
        .map((group) => [
          group.label,
          group.items.map((item) => [item.label, item.href]),
        ]),
    )
    expect(menus).toEqual({
      Ideas: [
        ['Bangers', '/bangers?period=week'],
        ['Strands', '/strands'],
      ],
      'Explore archive': [
        ['Explore by user', '/user-dir'],
        ['Live Stream', '/stream'],
        ['Trends', '/trends'],
        ['Social Graph', '/social-graph'],
      ],
      Community: [
        ['Bulletin Board', '/bulletin'],
        ['Community Apps', '/community'],
      ],
    })
    expect(nav.slice(0, 2)).toEqual([
      { href: '/', label: 'Home' },
      { href: '/digest', label: "Today's Digest" },
    ])
    expect(nav[5]).toEqual({ href: '/research', label: 'Research' })
    for (const item of nav.filter(isNavGroup).flatMap((g) => g.items)) {
      expect(item.description).toMatch(/\.$/)
    }
  })

  it('adds Docs and Search to the mobile menu', () => {
    const mobile = flattenNav(getMobileNav())
    expect(isNavItemActive('/digest', '/')).toBe(false)
    expect(mobile.slice(-2)).toEqual([
      { href: '/docs', label: 'Docs' },
      { href: '/search', label: 'Search' },
    ])
  })

  it('highlights a page and the menu that holds it', () => {
    expect(isNavItemActive('/bangers', '/bangers?period=week')).toBe(true)
    expect(isNavItemActive('/stream', '/stream')).toBe(true)
    expect(isNavItemActive('/strands/abc', '/strands')).toBe(true)
    expect(isNavItemActive('/search', '/bangers?period=week')).toBe(false)
    const [ideas, explore] = getPrimaryNav().filter(isNavGroup)
    expect(isNavGroupActive('/strands/abc', ideas)).toBe(true)
    expect(isNavGroupActive('/strands/abc', explore)).toBe(false)
  })
})

describe('tweet detail navigation', () => {
  it('encodes and restores a filtered Bangers origin', () => {
    const href = tweetPermalinkHref(
      '123',
      'bangers',
      '/bangers?period=today&sort=recent',
    )
    const url = new URL(href, 'https://community-archive.org')

    expect(url.pathname).toBe('/tweets/123')
    expect(url.searchParams.get('from')).toBe('bangers')
    expect(getTweetBackLink(Object.fromEntries(url.searchParams))).toEqual({
      href: '/bangers?period=today&sort=recent',
      label: 'Back to Bangers',
      hasKnownOrigin: true,
    })
  })

  it('maps homepage, stream, Trends, Search, Digest, and profile origins to honest labels', () => {
    expect(getTweetBackLink({ from: 'home', returnTo: '/' }).label).toBe(
      'Back to homepage',
    )
    expect(
      getTweetBackLink({ from: 'stream', returnTo: '/stream' }).label,
    ).toBe('Back to live stream')
    expect(
      getTweetBackLink({ from: 'trends', returnTo: '/trends' }).label,
    ).toBe('Back to Trends')
    expect(
      getTweetBackLink({ from: 'search', returnTo: '/search?q=archive' }).label,
    ).toBe('Back to search')
    expect(
      getTweetBackLink({
        from: 'digest',
        returnTo: '/digest/2026-08-12/taste',
      }).label,
    ).toBe('Back to What Happened Yesterday')
    expect(
      getTweetBackLink({
        from: 'profile',
        returnTo: '/user/exgenesis?chapter=2025',
      }),
    ).toEqual({
      href: '/user/exgenesis?chapter=2025',
      label: 'Back to profile',
      hasKnownOrigin: true,
    })
  })

  it('rejects mismatched and external return targets', () => {
    expect(
      getTweetBackLink({ from: 'bangers', returnTo: '/search?q=wrong' }).href,
    ).toBe('/bangers')
    expect(
      getTweetBackLink({ from: 'search', returnTo: '//example.com' }).href,
    ).toBe('/search')
    expect(
      getTweetBackLink({ from: 'profile', returnTo: '/tweets/123' }).href,
    ).toBe('/user-dir')
    expect(getTweetBackLink()).toEqual({
      href: '/',
      label: 'Back to Community Archive',
      hasKnownOrigin: false,
    })
  })
})

test('bulletin navigation preserves the source return link', () => {
  expect(flattenNav(getMobileNav())).toContainEqual(
    expect.objectContaining({ href: '/bulletin', label: 'Bulletin Board' }),
  )
  expect(navAnalyticsDestination('/bulletin')).toBe('opportunities')
  expect(getTweetBackLink({ from: 'opportunities' }).href).toBe('/bulletin')
})
