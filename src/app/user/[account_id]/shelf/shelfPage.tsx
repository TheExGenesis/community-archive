import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { userProfileHref } from '@/lib/navigation'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { getAuthenticatedAccountId } from '@/lib/authenticatedAccount'
import { measureServerRead } from '@/lib/performance/server'
import {
  BENTO_ROWS,
  bentoTiles,
  pickFavourites,
  shelfStats,
} from '@/lib/shelf/bento'
import {
  getOwnQuotes,
  getPublicShelf,
  getShelfPeople,
  type ShelfOwnQuote,
} from '@/lib/shelf/data'
import {
  shelfOwnerName,
  shelfWorkKeyPrefix,
  shelfWorkSlug,
} from '@/lib/shelf/labels'
import type { Shelf, ShelfItem } from '@/lib/shelf/types'
import { ShelfBento } from '@/components/shelf/ShelfBento'
import { ShelfHeader } from '@/components/shelf/ShelfHeader'
import { ShelfShare } from '@/components/shelf/ShelfShare'

export const shelfHref = (username: string, accountId: string) =>
  `${userProfileHref(username, accountId)}/shelf`

export async function readShelf(accountId: string): Promise<Shelf | null> {
  try {
    return await measureServerRead('shelf.public', () =>
      getPublicShelf(accountId),
    )
  } catch {
    return null
  }
}

const findWork = (shelf: Shelf | null, slug: string) => {
  const prefix = shelfWorkKeyPrefix(slug)
  if (!shelf || !prefix) return null
  return (
    shelf.rows
      .flatMap((row) => row.items)
      .find((item) => item.key.startsWith(prefix)) ?? null
  )
}

const firstName = (displayName: string, username: string) =>
  shelfOwnerName(displayName) ?? `@${username}`

/** "351 works tweeted about since 2016". */
function summary(shelf: Shelf) {
  const stats = shelfStats(shelf)
  const works = stats[0].count ?? 0
  const since = stats.find((part) => part.count === null)?.text
  return `${works} ${works === 1 ? 'work' : 'works'} tweeted about${since ? ` ${since}` : ''}`
}

export async function shelfMetadata(
  accountIdParam: string,
  workSlug?: string,
): Promise<Metadata> {
  const resolved = await resolveProfileCore(accountIdParam)
  if (!resolved) return { title: 'User not found' }
  const { accountId, profile } = resolved
  const shelf = await readShelf(accountId)
  const base = shelfHref(profile.username, accountId)
  const name = profile.account_display_name || `@${profile.username}`
  const work = workSlug ? findWork(shelf, workSlug) : null
  if (workSlug && !work)
    return { title: 'Not on this shelf', robots: { index: false } }
  const title = work
    ? `${work.label}, on ${name}'s shelf (@${profile.username}) — Community Archive`
    : `${name}'s shelf (@${profile.username}) — Community Archive`
  const description = work
    ? `@${profile.username} tweeted about ${work.label}${work.creator ? ` by ${work.creator}` : ''}${work.echoAccountIds.length ? `, and so did ${work.echoAccountIds.length} other ${work.echoAccountIds.length === 1 ? 'member' : 'members'}` : ''}.`
    : shelf?.total
      ? `${summary(shelf)}: the books, articles, videos, podcasts and games @${profile.username} chose from their own tweets.`
      : `Books, videos, music, games and tools @${profile.username} has tweeted about, chosen by them.`
  const canonical = work ? `${base}/${shelfWorkSlug(work)}` : base
  return {
    title,
    description,
    alternates: { canonical },
    // An empty or unavailable shelf has nothing worth listing.
    robots: shelf?.total ? undefined : { index: false },
    openGraph: { type: 'website', url: canonical, title, description },
    twitter: { card: 'summary_large_image', title, description },
  }
}

/** The public shelf, optionally opened on one work (`/shelf/<work-slug>`). */
export async function ShelfPage({
  accountIdParam,
  workSlug,
}: {
  accountIdParam: string
  workSlug?: string
}) {
  const resolved = await resolveProfileCore(accountIdParam)
  if (!resolved) notFound()
  const { accountId, profile } = resolved
  const base = shelfHref(profile.username, accountId)

  const [shelf, viewerId] = await Promise.all([
    readShelf(accountId),
    measureServerRead('shelf.viewer', getAuthenticatedAccountId).catch(
      () => null,
    ),
  ])
  const work: ShelfItem | null = workSlug ? findWork(shelf, workSlug) : null
  if (workSlug && !work) notFound()
  const canonical = work ? `${base}/${shelfWorkSlug(work)}` : base
  const requested = `/user/${encodeURIComponent(accountIdParam)}/shelf${workSlug ? `/${encodeURIComponent(workSlug)}` : ''}`
  if (canonical !== requested) redirect(canonical)

  const name = firstName(profile.account_display_name, profile.username)
  const isOwner = viewerId === accountId
  const visitorId = viewerId && !isOwner ? viewerId : null

  let people: Awaited<ReturnType<typeof getShelfPeople>> = []
  let quotes: Record<string, ShelfOwnQuote> = {}
  if (shelf?.total) {
    const items = shelf.rows
      .filter((row) => BENTO_ROWS.includes(row.key))
      .flatMap((row) => row.items)
    // The member's own words go on conversation tiles and on larger tiles without a cover,
    // in the order the grid shows them. Spans are taken as if every work had a tweet photo,
    // so a work that turns out to have one keeps its tall tile in the browser.
    const quoted = bentoTiles(items, pickFavourites(items), () => true)
      .slice(0, 48)
      .filter(
        (tile) =>
          tile.kind === 'talk' ||
          (!tile.item.coverPath && tile.cols * tile.rows > 1),
      )
      .map((tile) => tile.item)
    const faces = shelf.rows.flatMap((row) =>
      row.items.flatMap((item) => item.echoAccountIds.slice(0, 5)),
    )
    ;[people, quotes] = await Promise.all([
      getShelfPeople(
        accountId,
        visitorId ? [...faces, visitorId] : faces,
      ).catch(() => []),
      getOwnQuotes(accountId, quoted).catch(() => ({})),
    ])
  }
  const peopleById = Object.fromEntries(
    people.map((person) => [person.accountId, person]),
  )

  return (
    <div className="flex justify-center px-4 pb-8 pt-4 sm:px-6">
      <div className="h-fit w-full max-w-[1220px]">
        <ShelfHeader
          displayName={profile.account_display_name}
          username={profile.username}
          avatarUrl={profile.avatar_media_url}
          profileHref={userProfileHref(profile.username, accountId)}
          title={`${name}'s shelf`}
          summary={
            shelf?.total
              ? null
              : `Books, videos, music, games and tools @${profile.username} has tweeted about, chosen by them.`
          }
          actions={
            <>
              {isOwner ? (
                <Link
                  href="/shelf"
                  className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted"
                >
                  Curate your shelf
                </Link>
              ) : null}
              {shelf?.total ? (
                <ShelfShare
                  href={base}
                  text={`${name}'s shelf on Community Archive`}
                  top9Href={`/api/shelf/top9?${new URLSearchParams({ account_id: accountId })}`}
                  username={profile.username}
                />
              ) : null}
            </>
          }
        />
        {shelf === null ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-6">
            This shelf could not load. Refresh the page to try again.
          </p>
        ) : shelf.total === 0 ? (
          <div className="px-4 py-14 text-center sm:px-6">
            <p className="text-xl font-semibold">Nothing on this shelf yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Works appear here after {name} picks them from the ones found in
              their tweets.
            </p>
          </div>
        ) : (
          <ShelfBento
            shelf={shelf}
            ownerName={
              profile.account_display_name.trim() || `@${profile.username}`
            }
            people={peopleById}
            quotes={quotes}
            viewer={visitorId ? (peopleById[visitorId] ?? null) : null}
            shelfHref={base}
            initialKey={work?.key ?? null}
          />
        )}
      </div>
    </div>
  )
}
