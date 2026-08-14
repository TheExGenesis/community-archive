import {
  getMobileNav,
  getPrimaryNav,
  getTweetBackLink,
  isNavItemActive,
  tweetPermalinkHref,
  userProfileHref,
} from './navigation'

describe('user profile navigation', () => {
  it('prefers readable usernames while retaining account-ID compatibility', () => {
    expect(userProfileHref('@archive_user', '123')).toBe(
      '/user/123?username=archive_user',
    )
    expect(userProfileHref(undefined, '123')).toBe('/user/123')
    expect(userProfileHref('not valid', '123')).toBe('/user/123')
    expect(userProfileHref('123', '456')).toBe('/user/456')
    expect(userProfileHref('a'.repeat(15), '456')).toBe(
      `/user/456?username=${'a'.repeat(15)}`,
    )
    expect(userProfileHref('a'.repeat(16), '456')).toBe('/user/456')
  })
})

describe('member navigation', () => {
  it('uses explicit Users, Live stream, Bangers, and Search destinations', () => {
    expect(getPrimaryNav(true)).toContainEqual({
      href: '/user-dir',
      label: 'Users',
    })
    expect(getPrimaryNav(true)).toContainEqual({
      href: '/stream',
      label: 'Live stream',
    })
    expect(getPrimaryNav(true)).toContainEqual({
      href: '/bangers?period=all',
      label: 'Bangers',
    })
    expect(getMobileNav(true)).toEqual(
      expect.arrayContaining([
        { href: '/user-dir', label: 'Users' },
        { href: '/stream', label: 'Live stream' },
        { href: '/bangers?period=all', label: 'Bangers' },
        { href: '/search', label: 'Search' },
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
    expect(getPrimaryNav(true)).toContainEqual({
      href: '/trends',
      label: 'Trends',
    })
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

  it('maps homepage, stream, Trends, and Search origins to honest labels', () => {
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
