'use client'
import Link from 'next/link'
import { useMemo, type CSSProperties } from 'react'
import { queryOptions } from '@tanstack/react-query'
import { mapUrl } from '@/lib/hexMap/version'
import { WEEKLY_MAP_COLORS } from '@/lib/digest/weeklyMap'
import type {
  MapStory,
  WeeklyMapPage,
  WeeklyMapStory,
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
  color,
  expanded,
  onExpand,
  onOpen,
  onHover,
}: {
  story: WeeklyMapStory
  color: string
  expanded: boolean
  onExpand: (id: string | null) => void
  onOpen: (story: MapStory) => void
  onHover: (story: MapStory | null) => void
}) {
  const highlight = useMemo(() => weeklyHighlight(story), [story])
  const panelId = `weekly-${story.id.replace(/[^a-z0-9-]/gi, '-')}`
  const days = story.days.length
  return (
    <div
      className={styles.weeklyStory}
      style={{ '--weekly-color': color } as CSSProperties}
    >
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
  page,
  expanded,
  onExpand,
  onOpen,
  onHover,
}: {
  page: WeeklyMapPage
  expanded: string | null
  onExpand: (id: string | null) => void
  onOpen: (story: MapStory) => void
  onHover: (story: MapStory | null) => void
}) {
  if (!page.stories.length) return null
  return (
    <section
      className={`${styles.edition} ${styles.weeklySection}`}
      aria-label="This week"
    >
      <h2>This week</h2>
      <p className={styles.lead}>
        {page.soFar ? 'The Week So Far' : 'The Week in Review'},{' '}
        {range(page.weekStart, page.throughDate ?? page.weekEnd)}.{' '}
        <Link href="/digest/week">Read it all ↗</Link>
      </p>
      {page.stories.map((story, index) => (
        <WeeklyCard
          key={story.id}
          story={story}
          color={WEEKLY_MAP_COLORS[index % WEEKLY_MAP_COLORS.length]}
          expanded={expanded === story.id}
          onExpand={onExpand}
          onOpen={onOpen}
          onHover={onHover}
        />
      ))}
    </section>
  )
}
