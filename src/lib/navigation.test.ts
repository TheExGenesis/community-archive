import {
  getMobileNav,
  getPrimaryNav,
  getTweetBackLink,
  isNavItemActive,
  tweetPermalinkHref,
} from './navigation'

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

  it('maps homepage, Trends, and Search origins to honest labels', () => {
    expect(getTweetBackLink({ from: 'home', returnTo: '/' }).label).toBe(
      'Back to homepage',
    )
    expect(
      getTweetBackLink({ from: 'trends', returnTo: '/trends' }).label,
    ).toBe('Back to Trends')
    expect(
      getTweetBackLink({ from: 'search', returnTo: '/search?q=archive' }).label,
    ).toBe('Back to search')
  })

  it('rejects mismatched and external return targets', () => {
    expect(
      getTweetBackLink({ from: 'bangers', returnTo: '/search?q=wrong' }).href,
    ).toBe('/bangers')
    expect(
      getTweetBackLink({ from: 'search', returnTo: '//example.com' }).href,
    ).toBe('/search')
    expect(getTweetBackLink()).toEqual({
      href: '/',
      label: 'Back to Community Archive',
      hasKnownOrigin: false,
    })
  })
})
