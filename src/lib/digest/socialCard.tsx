import { ImageResponse } from 'next/og'
import type { ReactNode } from 'react'
import { markdownToPlainText } from './markdown'
import { DIGEST_CARD_SIZE, formatDigestDate } from './metadata'
import type { DigestEdition, DigestStory } from './types'

export { DIGEST_CARD_SIZE }

const MASTHEAD = 'WHAT HAPPENED YESTERDAY'

const colors = {
  brand: '#25aadf',
  brandText: '#168bb8',
  foreground: '#111113',
  muted: '#5e6570',
  page: '#f8fbfd',
}

// Cut at a word boundary so the card never ends mid-word.
const clip = (text: string, max: number) =>
  text.length > max
    ? `${text
        .slice(0, max)
        .replace(/\s+\S*$/, '')
        .replace(/[,;:.]$/, '')}…`
    : text

/**
 * The day's main headline: the first executive-summary line, which is also the
 * homepage digest card's headline. The lead story title is the fallback.
 */
export function digestCardHeadline(edition: DigestEdition): string {
  const { executiveSummary, stories } = edition.content
  return (
    markdownToPlainText(executiveSummary[0] ?? '') ||
    markdownToPlainText(stories[0]?.title ?? '')
  )
}

/**
 * A couple of other story titles shown small under the main headline. The
 * lead story is skipped because the main headline already covers it.
 */
export function digestCardAlsoHeadlines(edition: DigestEdition): string[] {
  return edition.content.stories
    .slice(1, 3)
    .map((story) => markdownToPlainText(story.title))
    .filter(Boolean)
}

function Card({
  eyebrow,
  footer,
  children,
}: {
  eyebrow: string
  footer: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '56px 80px',
        background: colors.page,
        color: colors.foreground,
        borderTop: `18px solid ${colors.brand}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          color: colors.brandText,
          fontSize: 25,
          letterSpacing: 3,
        }}
      >
        {eyebrow}
      </div>
      {children}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 25,
          color: colors.brandText,
        }}
      >
        <span>{footer}</span>
        <span>COMMUNITY-ARCHIVE.ORG</span>
      </div>
    </div>
  )
}

function Fallback() {
  return (
    <Card eyebrow={MASTHEAD} footer="Daily digest">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.08,
          }}
        >
          What Happened Yesterday
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 26,
            fontSize: 32,
            lineHeight: 1.4,
            maxWidth: 1000,
            color: colors.muted,
          }}
        >
          A daily briefing of the strongest conversations from the Community
          Archive.
        </div>
      </div>
    </Card>
  )
}

/** Link-preview image led by the day's main headline. */
export function digestEditionCard(edition: DigestEdition | null) {
  const headline = edition ? digestCardHeadline(edition) : ''
  if (!edition || !headline)
    return new ImageResponse(<Fallback />, DIGEST_CARD_SIZE)

  const storyCount = edition.content.stories.length
  const alsoHeadlines = digestCardAlsoHeadlines(edition)

  return new ImageResponse(
    (
      <Card
        eyebrow={`${MASTHEAD} · ${formatDigestDate(edition.digestDate).toUpperCase()}`}
        footer={`${storyCount} ${storyCount === 1 ? 'story' : 'stories'}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              // Sizes keep the longest clipped headline, plus the smaller
              // lines under it, inside the card height.
              fontSize:
                headline.length > 110 ? 48 : headline.length > 70 ? 56 : 68,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.12,
            }}
          >
            {clip(headline, 140)}
          </div>
          {alsoHeadlines.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginTop: 30,
                fontSize: 27,
                color: colors.muted,
              }}
            >
              {alsoHeadlines.map((also, index) => (
                <div key={index} style={{ display: 'flex' }}>
                  <span style={{ marginRight: 14, color: colors.brand }}>
                    +
                  </span>
                  {clip(also, 68)}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    ),
    DIGEST_CARD_SIZE,
  )
}

/** Link-preview image for one story: its headline and standfirst. */
export function digestStoryCard(
  edition: DigestEdition | null,
  story: DigestStory | undefined,
) {
  if (!edition || !story) return digestEditionCard(edition)

  const title = markdownToPlainText(story.title)
  const subtitle = markdownToPlainText(story.subtitle)
  // Older saved editions predate categories; the keyword is the fallback label.
  const label = story.category ?? story.keyword

  return new ImageResponse(
    (
      <Card
        eyebrow={`${MASTHEAD}${label ? ` · ${label.toUpperCase()}` : ''}`}
        footer={formatDigestDate(edition.digestDate)}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: title.length > 48 ? 60 : 72,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.08,
            }}
          >
            {clip(title, 90)}
          </div>
          {subtitle && (
            <div
              style={{
                display: 'flex',
                marginTop: 26,
                fontSize: 30,
                lineHeight: 1.4,
                maxWidth: 1000,
                color: colors.muted,
              }}
            >
              {clip(subtitle, 200)}
            </div>
          )}
        </div>
      </Card>
    ),
    DIGEST_CARD_SIZE,
  )
}
