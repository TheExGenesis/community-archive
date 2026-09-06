import type { Metadata } from 'next'
import { markdownToPlainText } from './markdown'
import type { DigestEdition } from './types'

const FALLBACK_TITLE = 'What Happened Yesterday · Community Archive'
const FALLBACK_DESCRIPTION =
  'A daily briefing of the strongest conversations from the Community Archive.'
const SOCIAL_IMAGE = '/images/logo.png'

const formatDigestDate = (digestDate: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${digestDate}T12:00:00Z`))

const compactDescription = (edition: DigestEdition) => {
  const description = edition.content.executiveSummary
    .map(markdownToPlainText)
    .join(' ')
    .trim()

  if (description.length <= 200) return description
  return `${description.slice(0, 197).trimEnd()}…`
}

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
      images: [
        {
          url: SOCIAL_IMAGE,
          width: 160,
          height: 160,
          alt: 'Community Archive logo',
        },
      ],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [SOCIAL_IMAGE],
    },
  }
}
