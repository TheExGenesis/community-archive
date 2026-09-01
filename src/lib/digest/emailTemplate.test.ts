import { AUGUST_11_MOCK_DIGEST } from './mock'
import { renderDigestEmail } from './emailTemplate'

const LINKS = {
  siteUrl: 'https://www.community-archive.org',
  unsubscribeUrl:
    'https://www.community-archive.org/api/digest/email/unsubscribe?token=tok',
}

describe('renderDigestEmail', () => {
  it('renders subject, stories, edition link, and unsubscribe link', () => {
    const { subject, html, text } = renderDigestEmail(
      AUGUST_11_MOCK_DIGEST,
      LINKS,
    )

    expect(subject).toBe('Community Archive Digest — August 11, 2026')
    const editionUrl = `${LINKS.siteUrl}/digest/${AUGUST_11_MOCK_DIGEST.digestDate}`
    expect(html).toContain(editionUrl)
    expect(html).toContain(LINKS.unsubscribeUrl)
    expect(text).toContain(editionUrl)
    expect(text).toContain(LINKS.unsubscribeUrl)
    for (const story of AUGUST_11_MOCK_DIGEST.content.stories) {
      expect(text).toContain(story.title.toUpperCase())
    }
  })

  it('renders the top banger and per-story tweet cards', () => {
    const { html, text } = renderDigestEmail(AUGUST_11_MOCK_DIGEST, LINKS)
    const { topBanger, stories } = AUGUST_11_MOCK_DIGEST.content

    expect(html).toContain('Top tweet')
    expect(html).toContain(`@${topBanger.username}`)
    expect(html).toContain(`${LINKS.siteUrl}/tweets/${topBanger.id}`)
    expect(text).toContain(`@${topBanger.username}`)
    const firstTweet = stories[0].bangers[0]
    expect(html).toContain(`${LINKS.siteUrl}/tweets/${firstTweet.id}`)
    // At most two tweets render per story; the rest link back to the site.
    const thirdTweet = stories.find((s) => s.bangers.length > 2)?.bangers[2]
    if (thirdTweet) {
      expect(html).not.toContain(`${LINKS.siteUrl}/tweets/${thirdTweet.id}`)
      expect(html).toContain('more tweet')
    }
  })

  it('escapes HTML in model-authored copy', () => {
    const edition = {
      ...AUGUST_11_MOCK_DIGEST,
      content: {
        ...AUGUST_11_MOCK_DIGEST.content,
        executiveSummary: ['<script>alert(1)</script> & more'],
      },
    }

    const { html } = renderDigestEmail(edition, LINKS)

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more')
  })
})
