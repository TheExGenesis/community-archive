import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { userProfileHref } from '@/lib/navigation'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { getAuthenticatedAccountId } from '@/lib/authenticatedAccount'
import { measureServerRead } from '@/lib/performance/server'
import { getPublicShelf } from '@/lib/shelf/data'
import type { Shelf } from '@/lib/shelf/types'
import { ShelfHeader } from '@/components/shelf/ShelfHeader'
import { ShelfView } from '@/components/shelf/ShelfView'

interface PageProps {
  params: { account_id: string }
}

const shelfHref = (username: string, accountId: string) =>
  `${userProfileHref(username, accountId)}/shelf`

async function readShelf(accountId: string): Promise<Shelf | null> {
  try {
    return await measureServerRead('shelf.public', () =>
      getPublicShelf(accountId),
    )
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const resolved = await resolveProfileCore(params.account_id)
  if (!resolved) return { title: 'User not found' }
  const { accountId, profile } = resolved
  const shelf = await readShelf(accountId)
  const title = `${profile.account_display_name}'s shelf (@${profile.username}) — Community Archive`
  const description = `Books, videos, music, games and tools @${profile.username} has tweeted about, chosen by them.`
  const canonical = shelfHref(profile.username, accountId)
  return {
    title,
    description,
    alternates: { canonical },
    // An empty or unavailable shelf has nothing worth listing.
    robots: shelf?.total ? undefined : { index: false },
    openGraph: { type: 'website', url: canonical, title, description },
  }
}

async function OwnerCurateLink({ accountId }: { accountId: string }) {
  const owner = await measureServerRead(
    'shelf.owner',
    getAuthenticatedAccountId,
  )
  if (owner !== accountId) return null
  return (
    <Link
      href="/shelf"
      className="rounded-full border border-border px-4 py-[7px] text-sm font-semibold hover:bg-muted"
    >
      Curate your shelf
    </Link>
  )
}

export default async function UserShelfPage({ params }: PageProps) {
  const resolved = await resolveProfileCore(params.account_id)
  if (!resolved) notFound()
  const { accountId, profile } = resolved

  const canonical = shelfHref(profile.username, accountId)
  if (canonical !== `/user/${encodeURIComponent(params.account_id)}/shelf`)
    redirect(canonical)

  const shelf = await readShelf(accountId)
  const firstName =
    profile.account_display_name.trim() || `@${profile.username}`

  return (
    <div className="flex justify-center px-4 pb-8 pt-4 sm:px-6">
      <div className="h-fit w-full max-w-[1220px] overflow-hidden rounded-lg border border-border bg-card">
        <ShelfHeader
          displayName={profile.account_display_name}
          username={profile.username}
          avatarUrl={profile.avatar_media_url}
          profileHref={userProfileHref(profile.username, accountId)}
          title="Shelf"
          summary={
            shelf?.total
              ? `${shelf.total} ${shelf.total === 1 ? 'work' : 'works'} @${profile.username} has tweeted about, chosen by them.`
              : `Books, videos, music, games and tools @${profile.username} has tweeted about, chosen by them.`
          }
          actions={
            <Suspense fallback={null}>
              <OwnerCurateLink accountId={accountId} />
            </Suspense>
          }
        />
        {shelf === null ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-6">
            This shelf could not load. Refresh the page to try again.
          </p>
        ) : shelf.total === 0 ? (
          <div className="px-4 py-14 text-center sm:px-6">
            <p className="font-serif text-xl font-semibold">
              Nothing on this shelf yet
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Works appear here after {firstName} picks them from the ones found
              in their tweets.
            </p>
          </div>
        ) : (
          <ShelfView shelf={shelf} ownerName={firstName} />
        )}
      </div>
    </div>
  )
}
