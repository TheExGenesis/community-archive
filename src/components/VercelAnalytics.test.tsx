import { vercelAnalyticsBeforeSend } from './VercelAnalytics'

jest.mock('@vercel/analytics/next', () => ({ Analytics: () => null }))

const pageview = (url: string) => ({ type: 'pageview' as const, url })

function setDoNotTrack(value: string | null) {
  Object.defineProperty(window.navigator, 'doNotTrack', {
    configurable: true,
    value,
  })
}

afterEach(() => setDoNotTrack(null))

describe('vercelAnalyticsBeforeSend', () => {
  it('keeps a registered page address', () => {
    expect(
      vercelAnalyticsBeforeSend(
        pageview(
          'https://www.community-archive.org/research/you-can-just-do-things',
        ),
      ),
    ).toEqual(
      pageview(
        'https://www.community-archive.org/research/you-can-just-do-things',
      ),
    )
  })

  it('removes search text and other query parameters', () => {
    const sent = vercelAnalyticsBeforeSend(
      pageview('https://www.community-archive.org/search?q=private+words'),
    )
    expect(sent?.url).not.toContain('private')
    expect(sent?.url).not.toContain('?')
  })

  it('does not send an address that is not a web page', () => {
    expect(vercelAnalyticsBeforeSend(pageview('not a url'))).toBeNull()
  })

  it('sends nothing when the browser asks not to be tracked', () => {
    setDoNotTrack('1')
    expect(
      vercelAnalyticsBeforeSend(pageview('https://www.community-archive.org/')),
    ).toBeNull()
  })
})
