'use client'
import Link from 'next/link'
import { useMemo } from 'react'
import { queryOptions } from '@tanstack/react-query'
import { mapUrl } from '@/lib/hexMap/version'
import type {
  MapStory,
  WeeklyMapPage,
  WeeklyMapStory,
  WeeklyMapWeek,
} from '@/lib/hexMap/stories'
import { captureHomepageMapAction } from '@/lib/posthog'
import StoryCard from './StoryCard'
import styles from './hero.module.css'

export const weeklyStoriesOptions = queryOptions({
  queryKey: ['hex-weekly-stories'],
  queryFn: async ({ signal }): Promise<WeeklyMapPage> => {
    const response = await fetch(mapUrl('stories?kind=weekly'), { signal })
    if (!response.ok) throw new Error('This week is unavailable')
    return response.json()
  },
  // The route is shared at the edge for two minutes; match it.
  staleTime: 120_000,
  retry: false,
  refetchOnWindowFocus: false,
})

const day = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date.slice(0, 10)}T12:00:00Z`),
  )
const range = (start: string, end: string) =>
  `${day(start, { day: 'numeric', month: 'short' })} – ${day(end, {
    day: 'numeric',
    month: 'short',
  })}`

/** One map highlight for the whole weekly story: its daily stories combined. */
export function weeklyHighlight(story: WeeklyMapStory): MapStory {
  const people = new Map<string, MapStory['people'][number]>()
  for (const daily of story.stories)
    for (const person of daily.people)
      if (!people.has(person.username.toLowerCase()))
        people.set(person.username.toLowerCase(), person)
  const cells = Array.from(new Set(story.stories.flatMap((s) => s.cells)))
  return {
    id: `week:${story.id}`,
    kind: 'digest',
    title: story.title,
    subtitle: story.subtitle,
    date: story.days[0] ?? '',
    category: 'Week',
    href: story.href,
    people: Array.from(people.values()),
    cells,
    origin: story.stories.find((s) => s.origin !== undefined)?.origin,
  }
}

function WeeklyCard({
  story,
  expanded,
  onExpand,
  onOpen,
  onHover,
}: {
  story: WeeklyMapStory
  expanded: boolean
  onExpand: (id: string | null) => void
  onOpen: (story: MapStory) => void
  onHover: (story: MapStory | null) => void
}) {
  const highlight = useMemo(() => weeklyHighlight(story), [story])
  const panelId = `weekly-${story.id.replace(/[^a-z0-9-]/gi, '-')}`
  const days = story.days.length
  return (
    <div className={styles.weeklyStory}>
      <button
        type="button"
        className={styles.story}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => {
          if (!expanded) captureHomepageMapAction('weekly_story_expanded')
          onExpand(expanded ? null : story.id)
        }}
        onMouseEnter={() => onHover(highlight)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(highlight)}
        onBlur={() => onHover(null)}
      >
        <div className={styles.meta}>
          {days ? `${days} ${days === 1 ? 'day' : 'days'} · ` : ''}
          {story.stories.length}{' '}
          {story.stories.length === 1 ? 'daily story' : 'daily stories'}
          <span aria-hidden className={styles.weeklyToggle}>
            {expanded ? '−' : '+'}
          </span>
        </div>
        <h3>{story.title}</h3>
        <p>{story.subtitle}</p>
      </button>
      {expanded && (
        <div id={panelId} className={styles.weeklyDailies}>
          {story.stories.map((daily) => (
            <StoryCard
              key={daily.id}
              story={daily}
              showDate
              onOpen={onOpen}
              onHover={onHover}
            />
          ))}
          <Link href={story.href} className={styles.detailLink}>
            Read the weekly story ↗
          </Link>
        </div>
      )}
    </div>
  )
}

export default function WeeklyStories({
  week,
  heading,
  href,
  expanded,
  onExpand,
  onOpen,
  onHover,
}: {
  week: WeeklyMapWeek
  heading: string
  href: string
  expanded: string | null
  onExpand: (id: string | null) => void
  onOpen: (story: MapStory) => void
  onHover: (story: MapStory | null) => void
}) {
  if (!week.stories.length) return null
  return (
    <section className={styles.edition} aria-label={heading}>
      <h2>{heading}</h2>
      <p className={styles.lead}>
        {week.soFar ? 'The Week So Far' : 'The Week in Review'},{' '}
        {range(week.weekStart, week.throughDate ?? week.weekEnd)}.{' '}
        <Link href={href}>Read it all ↗</Link>
      </p>
      {week.stories.map((story) => (
        <WeeklyCard
          key={story.id}
          story={story}
          expanded={expanded === story.id}
          onExpand={onExpand}
          onOpen={onOpen}
          onHover={onHover}
        />
      ))}
    </section>
  )
}
