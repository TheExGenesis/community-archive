import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/portal/auth'
import { loadWeeklyBulletinItemsForViewer } from '@/lib/digest/bulletin'
import type { WeeklyDigestEdition } from '@/lib/digest/weeklyData'
import { BulletinItems } from './PublishedDigestView'
import { WeeklyComments } from './WeeklyComments'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function Bulletin({ edition }: { edition: WeeklyDigestEdition }) {
  try {
    const recommendation = await loadWeeklyBulletinItemsForViewer(
      edition.content.weekStart,
      edition.content.weekEnd,
    )
    return <BulletinItems {...recommendation} />
  } catch (error) {
    console.error('Weekly digest bulletin selection failed:', error)
    return null
  }
}

async function Comments({ editionId }: { editionId: string }) {
  const user = await getCurrentUser()
  return <WeeklyComments editionId={editionId} isSignedIn={Boolean(user)} />
}

/** Bulletin asks and offers posted during the week, for this reader. */
export function WeeklyBulletin({ edition }: { edition: WeeklyDigestEdition }) {
  return (
    <Suspense fallback={null}>
      <Bulletin edition={edition} />
    </Suspense>
  )
}

/** The discussion under a published weekly edition. */
export function WeeklyDiscussion({
  edition,
}: {
  edition: WeeklyDigestEdition
}) {
  // Local sample editions have no database row to attach comments to.
  if (!UUID_PATTERN.test(edition.id)) return null
  return (
    <Suspense fallback={<p role="status">Loading discussion…</p>}>
      <Comments editionId={edition.id} />
    </Suspense>
  )
}
