import type { ArchivePerson } from './types'

const label = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`

export function interactionBreakdown(person: ArchivePerson): string {
  const counts = person.interaction_counts
  if (!counts) {
    return label(person.interactions, 'interaction')
  }

  const parts = [
    counts.replies > 0 ? label(counts.replies, 'reply', 'replies') : null,
    counts.mentions > 0 ? label(counts.mentions, 'mention') : null,
    counts.quotes > 0 ? label(counts.quotes, 'quote') : null,
    counts.reposts > 0 ? label(counts.reposts, 'repost') : null,
  ].filter((part): part is string => part !== null)

  return parts.length > 0
    ? `${person.interactions} total · ${parts.join(' · ')}`
    : label(person.interactions, 'interaction')
}
