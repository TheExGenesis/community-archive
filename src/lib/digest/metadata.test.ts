import { getDigestMetadata } from './metadata'
import type { DigestEdition } from './types'

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
      twitter: { card: 'summary' },
    })
  })

  test('keeps a useful fallback preview when no edition is published', () => {
    const metadata = getDigestMetadata(null, '/digest', 'website')

    expect(metadata).toMatchObject({
      title: 'What Happened Yesterday · Community Archive',
      alternates: { canonical: '/digest' },
      openGraph: { url: '/digest', type: 'website' },
      twitter: { card: 'summary' },
    })
    expect(metadata.description).toContain('strongest conversations')
  })
})
