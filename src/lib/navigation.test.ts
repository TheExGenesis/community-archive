import {
  getMobileNav,
  getPrimaryNav,
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

describe('member navigation', () => {
  it('maps Community navigation to its own analytics destination', () => {
    expect(navAnalyticsDestination('/community')).toBe('community')
  })

  it('uses the requested primary order without a redundant Home link', () => {
    expect(getPrimaryNav(true)).toEqual([
      { href: '/bangers?period=all', label: 'Bangers' },
      { href: '/digest', label: 'Digest' },
      { href: '/user-dir', label: 'Users' },
      { href: '/community', label: 'Gallery' },
      { href: '/trends', label: 'Trends' },
      { href: '/stream', label: 'Live stream' },
      { href: '/social-graph', label: 'Graph' },
      { href: '/research', label: 'Research' },
    ])
    expect(getMobileNav(true)).toEqual(
      expect.arrayContaining([
        { href: '/user-dir', label: 'Users' },
        { href: '/stream', label: 'Live stream' },
        { href: '/bangers?period=all', label: 'Bangers' },
        { href: '/digest', label: 'Digest' },
        { href: '/search', label: 'Search' },
        { href: '/community', label: 'Gallery' },
        { href: '/social-graph', label: 'Graph' },
      ]),
    )
    expect(isNavItemActive('/bangers', '/bangers?period=all')).toBe(true)
    expect(isNavItemActive('/stream', '/stream')).toBe(true)
    expect(isNavItemActive('/search', '/bangers?period=all')).toBe(false)
  })

  it('keeps Bangers public while reserving Trends for signed-in members', () => {
    expect(getPrimaryNav(false)).toContainEqual({
      href: '/bangers?period=all',
      label: 'Bangers',
    })
    expect(getPrimaryNav(false)).not.toContainEqual({
      href: '/trends',
      label: 'Trends',
    })
    expect(getPrimaryNav(false)).toContainEqual({
      href: '/digest',
      label: 'Digest',
    })
    expect(getPrimaryNav(false)).toContainEqual({
      href: '/user-dir',
      label: 'Users',
    })
    expect(getPrimaryNav(false)).toContainEqual({
      href: '/community',
      label: 'Gallery',
    })
    expect(getPrimaryNav(true)).toContainEqual({
      href: '/trends',
      label: 'Trends',
    })
  })

  it('shows Graph as a standard navigation item to every audience', () => {
    const graphItem = {
      href: '/social-graph',
      label: 'Graph',
    }
    expect(getPrimaryNav(false)).toContainEqual(graphItem)
    expect(getPrimaryNav(true)).toContainEqual(graphItem)
    expect(getPrimaryNav(true, true)).toContainEqual(graphItem)
    expect(getMobileNav(false)).toContainEqual(graphItem)
    expect(getMobileNav(true)).toContainEqual(graphItem)
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
