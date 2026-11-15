import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
import { loadWeeklyBulletinItems } from '@/lib/digest/bulletin'
import { listPublishedDigestDays } from '@/lib/digest/data'
import type { WeeklyDigestEdition } from '@/lib/digest/weeklyData'
import { BulletinItems } from './PublishedDigestView'
import { DigestDaySelector } from './DigestDaySelector'
import { getActiveDigestSubscriberCount } from '@/lib/digest/emailSubscriptions'
import { WeeklyComments } from './WeeklyComments'
import { DigestViewCount } from './DigestViewCount'
import { LikeButton } from '@/components/engagement/LikeButton'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Shared picks, cached for an hour: nothing here reads the viewer, so the
// week page itself can be cached for everyone.
const cachedBulletin = (weekStart: string, weekEnd: string) =>
  unstable_cache(
    () => loadWeeklyBulletinItems(weekStart, weekEnd),
    ['weekly-bulletin', weekStart],
    { revalidate: 3600 },
  )()

async function Bulletin({ edition }: { edition: WeeklyDigestEdition }) {
  try {
    const items = await cachedBulletin(
      edition.content.weekStart,
      edition.content.weekEnd,
    )
    return <BulletinItems items={items} personalized={false} />
  } catch (error) {
    console.error('Weekly digest bulletin selection failed:', error)
    return null
  }
}

/** Bulletin asks and offers posted during the week. */
export function WeeklyBulletin({ edition }: { edition: WeeklyDigestEdition }) {
  return (
    <Suspense fallback={null}>
      <Bulletin edition={edition} />
    </Suspense>
  )
}

// Published days change once a morning; share them across requests like the
// week's own reads so the week page stays cacheable.
const cachedDigestDays = unstable_cache(
  listPublishedDigestDays,
  ['weekly-digest-calendar-days'],
  { revalidate: 300 },
)

async function Calendar({ edition }: { edition: WeeklyDigestEdition }) {
  const days = await cachedDigestDays()
  const { weekStart, weekEnd, throughDate } = edition.content
  return (
    <DigestDaySelector
      currentDate={throughDate ?? weekEnd}
      availableDays={days}
      variant="editorial"
      week={{ start: weekStart, end: weekEnd }}
      title="Daily editions"
    />
  )
}

/** A month calendar of daily editions with this week's days tinted. */
export function WeeklyCalendar({ edition }: { edition: WeeklyDigestEdition }) {
  return (
    <Suspense
      fallback={
        <div role="status" className="h-72 animate-pulse bg-muted">
          Loading calendar…
        </div>
      }
    >
      <Calendar edition={edition} />
    </Suspense>
  )
}

const cachedWeeklySubscribers = unstable_cache(
  () => getActiveDigestSubscriberCount('weekly'),
  ['weekly-digest-subscriber-count'],
  { revalidate: 300 },
)

async function SubscriberCount() {
  try {
    const count = await cachedWeeklySubscribers()
    return (
      <span className="text-xs text-muted-foreground">
        {count.toLocaleString('en-US')} email{' '}
        {count === 1 ? 'subscriber' : 'subscribers'}
      </span>
    )
  } catch {
    // A failed count must not break the week or look like zero subscribers.
    return null
  }
}

/**
 * Like button and view count for the week. Both belong to the week, so every
 * edition of it shares them; the button hydrates its count and the viewer's
 * state from the API, keeping the page itself cacheable.
 */
export function WeeklyReactions({ edition }: { edition: WeeklyDigestEdition }) {
  // Local sample editions have no database row.
  if (!UUID_PATTERN.test(edition.id)) return null
  const endpoint = `/api/digest/week/${edition.id}`
  return (
    <>
      <LikeButton endpoint={endpoint} noun="week" initialCount={0} />
      <DigestViewCount
        key={edition.weekStart}
        editionId={edition.id}
        endpoint={endpoint}
      />
    </>
  )
}

/** Weekly-list subscriber count for the header row. */
export function WeeklySubscriberCount() {
  return (
    <Suspense fallback={null}>
      <SubscriberCount />
    </Suspense>
  )
}

/**
 * The week's discussion, shared by the running week-so-far editions and the
 * final edition (see `resolveCommentThread`). The thread learns whether
 * the reader is signed in from its own request, so the page stays cacheable.
 */
export function WeeklyDiscussion({
  edition,
}: {
  edition: WeeklyDigestEdition
}) {
  // Local sample editions have no database row to attach comments to.
  if (!UUID_PATTERN.test(edition.id)) return null
  return <WeeklyComments editionId={edition.id} />
}
