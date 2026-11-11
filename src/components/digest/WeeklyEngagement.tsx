import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
import { loadWeeklyBulletinItems } from '@/lib/digest/bulletin'
import type { WeeklyDigestEdition } from '@/lib/digest/weeklyData'
import { BulletinItems } from './PublishedDigestView'
import { WeeklyComments } from './WeeklyComments'

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

/**
 * The discussion under a published weekly edition. The thread learns whether
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
