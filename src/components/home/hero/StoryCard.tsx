'use client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { MapStory } from '@/lib/hexMap/stories'
import styles from './hero.module.css'
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
  return (
    <button
      type="button"
      className={styles.story}
      onClick={() => onOpen(story)}
      onMouseEnter={() => onHover(story)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(story)}
      onBlur={() => onHover(null)}
    >
      <div className={styles.meta}>
        {story.kind === 'strand'
          ? `${story.date.slice(0, 10)} · ${story.totalPosts ?? '—'} posts`
          : `${showDate ? `${story.date.slice(0, 10)} · ` : ''}${story.category}`}
        {story.country ? ` · ${story.country}` : ''}
      </div>
      <h3>{story.title}</h3>
      <p>{story.subtitle}</p>
      {!!story.people.length && (
        <div className={styles.people}>
          <div className={styles.avatars}>
            {story.people.slice(0, 4).map((p) => (
              <Avatar
                key={p.username}
                className="-ml-1 h-[22px] w-[22px] border-2 border-background"
              >
                <AvatarImage
                  src={p.avatar ?? undefined}
                  alt=""
                  loading="lazy"
                />
                <AvatarFallback className="text-[9px]">
                  {p.username[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <span>
            {story.people
              .slice(0, 2)
              .map((p) => `@${p.username}`)
              .join(', ')}
            {story.people.length > 2
              ? ` and ${story.people.length - 2} more`
              : ''}
          </span>
        </div>
      )}
    </button>
  )
}
