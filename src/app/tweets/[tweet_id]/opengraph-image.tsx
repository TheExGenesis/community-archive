import { ImageResponse } from 'next/og'
import { loadTweetPage } from '@/lib/tweetSummary/loadTweetPage'
import {
  eyebrowLabel,
  fallbackTitle,
  plainTweetText,
} from '@/lib/tweetSummary/subject'

export const alt = 'An archived tweet on Community Archive'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600

// Cut at a word boundary so the card never ends mid-word.
const clip = (text: string, max: number) =>
  text.length > max
    ? `${text
        .slice(0, max)
        .replace(/\s+\S*$/, '')
        .replace(/[,;:.]$/, '')}…`
    : text

export default async function Image({
  params,
}: {
  params: { tweet_id: string }
}) {
  const page = await loadTweetPage(params.tweet_id)
  const kind = page?.subject.kind ?? 'tweet'
  const title = page
    ? (page.summary?.title ?? fallbackTitle(page.subject))
    : 'Archived tweet'
  // Without a generated summary, the author's own words are the preview.
  const body = page
    ? page.summary
      ? page.summary.description
      : `“${clip(plainTweetText(page.tweet.full_text), 200)}”`
    : ''
  const byline = page
    ? `@${page.tweet.username} · ${new Date(page.tweet.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : ''

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '64px 80px',
          background: '#f8fbfd',
          color: '#111113',
          borderTop: '18px solid #25aadf',
        }}
      >
        <div
          style={{
            display: 'flex',
            color: '#168bb8',
            fontSize: 25,
            letterSpacing: 3,
          }}
        >
          {eyebrowLabel(kind).toUpperCase()}
        </div>
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
          {body && (
            <div
              style={{
                display: 'flex',
                marginTop: 26,
                fontSize: 30,
                lineHeight: 1.4,
                maxWidth: 1000,
                color: '#5e6570',
              }}
            >
              {clip(body, 230)}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 25,
            color: '#168bb8',
          }}
        >
          <span>{byline}</span>
          <span>COMMUNITY-ARCHIVE.ORG</span>
        </div>
      </div>
    ),
    size,
  )
}
