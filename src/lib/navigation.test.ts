import {
  getMobileNav,
  getPrimaryNav,
  getTweetBackLink,
  tweetPermalinkHref,
} from './navigation'

describe('member navigation', () => {
  it('includes the member directory in desktop and mobile navigation', () => {
    expect(getPrimaryNav(true)).toContainEqual({
      href: '/user-dir',
      label: 'Library',
    })
    expect(getMobileNav(true)).toContainEqual({
      href: '/user-dir',
      label: 'Library',
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
