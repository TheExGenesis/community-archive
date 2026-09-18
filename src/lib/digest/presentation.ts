import type { DigestEdition, DigestEditionContent } from './types'

export function shouldShowRepresentativeTweet(content: DigestEditionContent) {
  return !content.stories.some((story) =>
    [...story.bangers, ...story.commentary].some(
      (tweet) => tweet.id === content.topBanger.id,
    ),
  )
}

export function digestPublicationDate(edition: DigestEdition) {
  const published = edition.publishedAt ? new Date(edition.publishedAt) : null
  return published && !Number.isNaN(published.getTime())
    ? published.toISOString().slice(0, 10)
    : edition.digestDate
}

export function digestCoverageLabel(content: DigestEditionContent) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return `24-hour coverage: ${format.format(new Date(content.windowStart))} – ${format.format(new Date(content.windowEnd))} UTC`
}
