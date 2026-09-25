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

    expect(subject).toBe('Community Archive Digest — Tuesday, August 11, 2026')
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
    const edition = {
      ...AUGUST_11_MOCK_DIGEST,
      content: {
        ...AUGUST_11_MOCK_DIGEST.content,
        topBanger: {
          ...AUGUST_11_MOCK_DIGEST.content.topBanger,
          id: 'standalone',
        },
      },
    }
    const { html, text } = renderDigestEmail(edition, LINKS)
    const { topBanger, stories } = edition.content

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

  it('renders the saved volume-ranked trends, numbered story links, and restrained tweet photos', () => {
    const story = AUGUST_11_MOCK_DIGEST.content.stories[0]
    const edition = {
      ...AUGUST_11_MOCK_DIGEST,
      content: {
        ...AUGUST_11_MOCK_DIGEST.content,
        trends: {
          sinceDate: '2026-08-04',
          untilDate: '2026-08-10',
          terms: [
            { term: 'claude opus', tweets: 120, changePct: 1769 },
            { term: 'regulatory capture', tweets: 80, changePct: -72 },
          ],
        },
        stories: [
          {
            ...story,
            bangers: [
              {
                ...story.bangers[0],
                media: [
                  { type: 'photo', url: 'https://example.com/photo.jpg' },
                ],
              },
            ],
          },
        ],
      },
    }
    const { html, text } = renderDigestEmail(edition, LINKS, [])

    expect(html).toContain('Trending terms · 7 days')
    expect(html).toContain('#1 by tweet volume')
    expect(html).toContain('120 <span')
    expect(html).toContain('2026-08-04–2026-08-10 UTC')
    expect(html).toContain('/search?q=claude+opus')
    expect(html).toContain(
      `href="${LINKS.siteUrl}/digest/${edition.digestDate}/${story.slug}"`,
    )
    expect(html).toContain('color:#111827;">01.</span>')
    expect(html).toContain('max-height:200px')
    expect(html).toContain('max-width:calc(100% - 32px)')
    expect(html).not.toContain('24-hour coverage:')
    expect(text).toContain('TRENDING TERMS · 7 DAYS')
    expect(text).toContain('#1 claude opus · 120 tweets')
    expect(text).toContain(`01. ${story.title.toUpperCase()}`)
    expect(text).toContain(
      `${LINKS.siteUrl}/digest/${edition.digestDate}/${story.slug}`,
    )
  })

  it('leaves a repeated representative tweet in its story, without a second featured card', () => {
    const tweet = AUGUST_11_MOCK_DIGEST.content.stories[0].bangers[0]
    const edition = {
      ...AUGUST_11_MOCK_DIGEST,
      content: { ...AUGUST_11_MOCK_DIGEST.content, topBanger: tweet },
    }
    const { html, text } = renderDigestEmail(edition, LINKS)
    expect(html).not.toContain('Top tweet')
    expect(text).not.toContain('TOP TWEET')
    expect(html.split(`${LINKS.siteUrl}/tweets/${tweet.id}`)).toHaveLength(2)
    expect(text).toContain(tweet.text)
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

  it('places up to three escaped Bulletin items near the bottom in HTML and text', () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      side: 'ask' as const,
      kind: 'help' as const,
      label: 'Help wanted',
      summary: index === 0 ? '<script>unsafe</script>' : `Request ${index + 1}`,
      tweet: {
        ...AUGUST_11_MOCK_DIGEST.content.stories[0].bangers[0],
        id: String(index + 1),
        username: `author${index + 1}`,
        name: `Author ${index + 1}`,
        text: `Original post ${index + 1}`,
        avatar: null,
        media: [],
        quotedTweet: undefined,
      },
    }))
    const { html, text } = renderDigestEmail(
      AUGUST_11_MOCK_DIGEST,
      LINKS,
      items,
    )

    expect(html).toContain('New in the Bulletin')
    expect(html).not.toContain('For You')
    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;')
    expect(html).not.toContain('<script>unsafe</script>')
    expect(html).toContain('https://x.com/author3/status/3')
    expect(html).not.toContain('https://x.com/author4/status/4')
    expect(html).toContain('Request 3')
    expect(html).not.toContain('Request 4')
    expect(html).toContain('border:1px solid #e8e8e5')
    expect(html.indexOf('New in the Bulletin')).toBeGreaterThan(
      html.indexOf('Read the full digest with tweets'),
    )
    expect(text).toContain('NEW IN THE BULLETIN')
    expect(text).toContain('https://x.com/author3/status/3')
    expect(text).not.toContain('https://x.com/author4/status/4')
    expect(text).toContain('Original post 3')

    const personalized = renderDigestEmail(
      AUGUST_11_MOCK_DIGEST,
      LINKS,
      items,
      {
        personalizedBulletin: true,
      },
    )
    expect(personalized.html).toContain('For You')
    expect(personalized.html).toContain('margin:72px 0 32px')
    expect(personalized.text).toContain('NEW IN THE BULLETIN · FOR YOU')
  })
})

it('uses the UTC publication date and omits the coverage line from email', () => {
  const edition = {
    ...AUGUST_11_MOCK_DIGEST,
    publishedAt: '2026-08-12T00:30:00Z',
  }
  const { subject, html, text } = renderDigestEmail(edition, LINKS)
  expect(subject).toBe('Community Archive Digest — Wednesday, August 12, 2026')
  expect(html).toContain('/digest/2026-08-11')
  expect(text).not.toContain('24-hour coverage:')
  expect(html).not.toContain('24-hour coverage:')
})
