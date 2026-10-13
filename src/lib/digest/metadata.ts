import type { Metadata } from 'next'
import { markdownToPlainText } from './markdown'
import type { DigestEdition, DigestStory } from './types'

export const DIGEST_CARD_SIZE = { width: 1200, height: 630 }

const FALLBACK_TITLE = 'What Happened Yesterday · Community Archive'
const FALLBACK_DESCRIPTION =
  'A daily briefing of the strongest conversations from the Community Archive.'

export const formatDigestDate = (digestDate: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${digestDate}T12:00:00Z`))

const compact = (description: string) =>
  description.length <= 200
    ? description
    : `${description.slice(0, 197).trimEnd()}…`

const compactDescription = (edition: DigestEdition) =>
  compact(
    edition.content.executiveSummary.map(markdownToPlainText).join(' ').trim(),
  )

export function getDigestMetadata(
  edition: DigestEdition | null,
  pathname: string,
  type: 'article' | 'website',
): Metadata {
  const title = edition
    ? `What Happened Yesterday · ${formatDigestDate(edition.digestDate)} · Community Archive`
    : FALLBACK_TITLE
  const description = edition
    ? compactDescription(edition)
    : FALLBACK_DESCRIPTION
  const publishedTime = edition?.publishedAt ?? edition?.createdAt
  // Dated pages get their image from the route's opengraph-image file. The
  // undated latest page names that day's image so caches keyed on the image
  // URL do not keep showing an earlier day's headlines.
  const latestImage =
    edition && type === 'website'
      ? {
          url: `/digest/${edition.digestDate}/opengraph-image`,
          ...DIGEST_CARD_SIZE,
          alt: `Headlines from the ${formatDigestDate(edition.digestDate)} daily digest`,
        }
      : null

  return {
    title,
    description,
    alternates: { canonical: pathname },
    openGraph: {
      title,
      description,
      url: pathname,
      siteName: 'Community Archive',
      type,
      ...(publishedTime && type === 'article' ? { publishedTime } : {}),
      ...(latestImage ? { images: [latestImage] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(latestImage ? { images: [latestImage] } : {}),
    },
  }
}

export function getDigestStoryMetadata(
  edition: DigestEdition | null,
  story: DigestStory | undefined,
  pathname: string,
): Metadata {
  if (!edition || !story) return { title: FALLBACK_TITLE }

  const title = markdownToPlainText(story.title)
  const description = compact(markdownToPlainText(story.subtitle))
  const publishedTime = edition.publishedAt ?? edition.createdAt

  return {
    title: `${title} · Community Archive`,
    description,
    alternates: { canonical: pathname },
    openGraph: {
      title,
      description,
      url: pathname,
      siteName: 'Community Archive',
      type: 'article',
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}
