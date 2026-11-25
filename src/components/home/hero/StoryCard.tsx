'use client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { MapStory } from '@/lib/hexMap/stories'
import { captureHomepageMapAction } from '@/lib/posthog'
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { storyDetailOptions, warmStory } from './useStoryDetail'
import styles from './hero.module.css'

/** Avatars and the first handles of the people in a story. */
export function StoryPeople({ people }: { people: MapStory['people'] }) {
  if (!people.length) return null
  return (
    <div className={styles.people}>
      <div className={styles.avatars}>
        {people.slice(0, 4).map((p) => (
          <Avatar
            key={p.username}
            className="-ml-1 h-[22px] w-[22px] border-2 border-background"
          >
            <AvatarImage src={p.avatar ?? undefined} alt="" loading="lazy" />
            <AvatarFallback className="text-[9px]">
              {p.username[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span>
        {people
          .slice(0, 2)
          .map((p) => `@${p.username}`)
          .join(', ')}
        {people.length > 2 ? ` and ${people.length - 2} more` : ''}
      </span>
    </div>
  )
}

export default function StoryCard({
  story,
  showDate = false,
  onOpen,
  onHover,
}: {
  story: MapStory
  showDate?: boolean
  onOpen: (story: MapStory) => void
  onHover: (story: MapStory | null) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const client = useQueryClient()
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let active = true
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        observer.disconnect()
        warmStory(async () => {
          if (!active) return
          void import('@/components/TweetCard')
          await client.prefetchQuery(storyDetailOptions(story))
        })
      },
      { root: element.closest('aside') },
    )
    observer.observe(element)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [client, story])
  const meta = [
    story.kind === 'strand'
      ? `${story.date.slice(0, 10)} · ${story.totalPosts ?? '—'} posts`
      : showDate
        ? story.date.slice(0, 10)
        : '',
    story.country ?? '',
  ]
    .filter(Boolean)
    .join(' · ')
  const hover = () => {
    onHover(story)
    void client.prefetchQuery(storyDetailOptions(story))
  }
  return (
    <button
      ref={ref}
      type="button"
      className={styles.story}
      onClick={() => {
        captureHomepageMapAction('story_opened')
        onOpen(story)
      }}
      onMouseEnter={hover}
      onMouseLeave={() => onHover(null)}
      onFocus={hover}
      onBlur={() => onHover(null)}
    >
      {meta && <div className={styles.meta}>{meta}</div>}
      <h3>{story.title}</h3>
      <p>{story.subtitle}</p>
      <StoryPeople people={story.people} />
    </button>
  )
}
