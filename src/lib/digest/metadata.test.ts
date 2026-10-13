import { getDigestMetadata, getDigestStoryMetadata } from './metadata'
import type { DigestEdition, DigestStory } from './types'

const edition = {
  digestDate: '2026-08-13',
  publishedAt: '2026-08-14T06:00:00.000Z',
  createdAt: '2026-08-14T05:00:00.000Z',
  content: {
    executiveSummary: [
      '**AI builders** compare notes on a new release.',
      "A joke becomes the day's most shared post.",
    ],
  },
} as DigestEdition

describe('daily digest metadata', () => {
  test('builds a dated Open Graph and Twitter preview from the edition', () => {
    const metadata = getDigestMetadata(edition, '/digest/2026-08-13', 'article')

    expect(metadata).toMatchObject({
      title: 'What Happened Yesterday · 13 August 2026 · Community Archive',
      description:
        "AI builders compare notes on a new release. A joke becomes the day's most shared post.",
      alternates: { canonical: '/digest/2026-08-13' },
      openGraph: {
        url: '/digest/2026-08-13',
        type: 'article',
        publishedTime: '2026-08-14T06:00:00.000Z',
      },
      twitter: { card: 'summary_large_image' },
    })
    // The route's opengraph-image file supplies the picture.
    expect(metadata.openGraph?.images).toBeUndefined()
  })

  test("points the undated latest page at that day's headline image", () => {
    const metadata = getDigestMetadata(edition, '/digest', 'website')

    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({
        url: '/digest/2026-08-13/opengraph-image',
        width: 1200,
        height: 630,
      }),
    ])
  })

  test('keeps a useful fallback preview when no edition is published', () => {
    const metadata = getDigestMetadata(null, '/digest', 'website')

    expect(metadata).toMatchObject({
      title: 'What Happened Yesterday · Community Archive',
      alternates: { canonical: '/digest' },
      openGraph: { url: '/digest', type: 'website' },
      twitter: { card: 'summary_large_image' },
    })
    expect(metadata.description).toContain('strongest conversations')
  })

  test('previews a story with its own headline and standfirst', () => {
    const story = {
      slug: 'new-release',
      title: 'Builders compare notes on a **new release**',
      subtitle: 'Early testers disagree about what changed.',
    } as DigestStory

    expect(
      getDigestStoryMetadata(edition, story, '/digest/2026-08-13/new-release'),
    ).toMatchObject({
      title: 'Builders compare notes on a new release · Community Archive',
      description: 'Early testers disagree about what changed.',
      alternates: { canonical: '/digest/2026-08-13/new-release' },
      openGraph: {
        title: 'Builders compare notes on a new release',
        url: '/digest/2026-08-13/new-release',
        type: 'article',
        publishedTime: '2026-08-14T06:00:00.000Z',
      },
      twitter: { card: 'summary_large_image' },
    })
  })

  test('falls back to the digest title for an unknown story', () => {
    expect(
      getDigestStoryMetadata(edition, undefined, '/digest/2026-08-13/missing'),
    ).toEqual({ title: 'What Happened Yesterday · Community Archive' })
  })
})
