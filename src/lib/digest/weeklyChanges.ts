import type { WeeklyDigestContent, WeeklyDigestStory } from './weekly'

/** How a week-so-far story changed since the previous morning's edition. */
export type WeeklyStoryChange = 'new' | 'updated'

const refKey = (ref: { digestDate: string; slug: string }) =>
  `${ref.digestDate}/${ref.slug}`

const refsOf = (story: WeeklyDigestStory) =>
  new Set(story.dailyStories.map(refKey))

/**
 * Compare a week-so-far edition with the one it replaced. Each morning's
 * edition is woven afresh, so slugs and wording are not stable; a story is
 * the same story when it keeps its slug or cites one of the same daily
 * stories. A story with no such match entered the week's top stories today
 * ("new"); a matched story that now cites a daily story it did not cite
 * before got fresh coverage ("updated"). Without a previous edition every
 * story is new.
 */
export function weeklyStoryChanges(
  current: Pick<WeeklyDigestContent, 'stories'>,
  previous: Pick<WeeklyDigestContent, 'stories'> | null,
): Record<string, WeeklyStoryChange> {
  const changes: Record<string, WeeklyStoryChange> = {}
  for (const story of current.stories) {
    const refs = refsOf(story)
    const matches = (previous?.stories ?? []).filter(
      (old) =>
        old.slug === story.slug ||
        old.dailyStories.some((ref) => refs.has(refKey(ref))),
    )
    if (matches.length === 0) {
      changes[story.slug] = 'new'
      continue
    }
    const before = new Set(matches.flatMap((old) => Array.from(refsOf(old))))
    if (Array.from(refs).some((ref) => !before.has(ref)))
      changes[story.slug] = 'updated'
  }
  return changes
}

const weekday = (day: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  )

const previousDay = (day: string) =>
  new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10)

/**
 * "today", "yesterday" or the weekday of the daily edition a change came
 * from, relative to the reader's own date (`YYYY-MM-DD`). Without a reader
 * date (server render) it is the weekday.
 */
export function changeDayLabel(day: string, readerToday?: string): string {
  if (readerToday === day) return 'today'
  if (readerToday && previousDay(readerToday) === day) return 'yesterday'
  return weekday(day)
}
