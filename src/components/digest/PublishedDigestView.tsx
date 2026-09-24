import { Suspense } from 'react'
import Link from 'next/link'
import { checkIsAdmin } from '@/app/admin/data'
import { getCurrentUser } from '@/lib/portal/auth'
import {
  getDigestCommentCount,
  getDigestLikeState,
  listPublishedDigestDays,
} from '@/lib/digest/data'
import type { DigestEdition, DigestCalendarDay } from '@/lib/digest/types'
import { DigestEditionView, DigestRecentEditions } from './DigestEditionView'
import { DigestDaySelector } from './DigestDaySelector'
import { DigestLikeButton } from './DigestLikeButton'
import { DigestComments } from './DigestComments'
import { SectionReady } from '@/components/PagePerformance'
import { DigestSubscriberCount } from './DigestSubscriberCount'
import { DigestTrendMovers } from './DigestTrendMovers'
import TweetCard from '@/components/TweetCard'
import {
  loadDigestBulletinItems,
  type DigestBulletinItem,
} from '@/lib/digest/bulletin'
import { selectDigestTrendMovers } from '@/lib/digest/trends'
import { fetchPortalWeeklyTrends } from '@/lib/portal/analytics'

async function DigestTrends() {
  try {
    const movers = selectDigestTrendMovers(await fetchPortalWeeklyTrends())
    return movers ? <DigestTrendMovers movers={movers} /> : null
  } catch (error) {
    console.error('Digest trends could not be loaded:', error)
    return null
  }
}

function BulletinItems({ items }: { items: DigestBulletinItem[] }) {
  if (!items.length) return null
  return (
    <section className="mt-12 border-t-2 border-zinc-800 pt-7 dark:border-zinc-200">
      <h2
        className="text-[30px] font-semibold"
        style={{ fontFamily: 'Petrona, Georgia, serif' }}
      >
        New in the Bulletin
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Recent community asks and offers
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <article key={item.tweet.id} className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {item.label}
            </p>
            <p className="mb-3 mt-2 text-base leading-relaxed">
              {item.summary}
            </p>
            <TweetCard
              tweet={item.tweet}
              variant="editorial"
              collapsible
              showDate
              origin="digest"
            />
            <a
              href={`https://x.com/${encodeURIComponent(item.tweet.username)}/status/${encodeURIComponent(item.tweet.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-semibold text-brand hover:underline"
            >
              Respond on X →
            </a>
          </article>
        ))}
      </div>
      <Link
        href="/bulletin"
        className="mt-6 inline-block text-sm font-semibold text-brand hover:underline"
      >
        Explore the Bulletin (opt-in required) →
      </Link>
    </section>
  )
}

async function DigestBulletin({ edition }: { edition: DigestEdition }) {
  try {
    return <BulletinItems items={await loadDigestBulletinItems(edition)} />
  } catch (error) {
    console.error('Digest bulletin selection failed:', error)
    return null
  }
}

async function Likes({ edition }: { edition: DigestEdition }) {
  const [likes, user] = await Promise.all([
    getDigestLikeState(edition),
    getCurrentUser(),
  ])
  return (
    <DigestLikeButton
      editionId={edition.id}
      initialCount={likes.count}
      initialLiked={likes.likedByViewer}
      isSignedIn={Boolean(user)}
    />
  )
}

async function AdminLink() {
  if (!(await checkIsAdmin())) return null
  return (
    <Link
      href="/admin/digest"
      className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand transition-colors hover:bg-blue-100 hover:text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:bg-zinc-800 dark:hover:bg-blue-950 dark:hover:text-blue-100"
    >
      Editorial lab →
    </Link>
  )
}

async function Calendar({
  archive,
  date,
  recent = false,
}: {
  archive: Promise<DigestCalendarDay[]>
  date: string
  recent?: boolean
}) {
  const days = await archive
  return recent ? (
    <DigestRecentEditions archive={days} currentDate={date} />
  ) : (
    <DigestDaySelector
      currentDate={date}
      availableDays={days}
      variant="editorial"
    />
  )
}

async function Comments({ edition }: { edition: DigestEdition }) {
  const [count, user] = await Promise.all([
    getDigestCommentCount(edition),
    getCurrentUser(),
  ])
  return (
    <DigestComments
      editionId={edition.id}
      initialCount={count}
      isSignedIn={Boolean(user)}
    />
  )
}

/** Article content never waits for viewer controls, counts, or calendar history. */
export function PublishedDigestView({ edition }: { edition: DigestEdition }) {
  const archive = listPublishedDigestDays()
  return (
    <>
      <SectionReady section="digest_article" />
      <DigestEditionView
        edition={edition}
        archive={[]}
        slots={{
          subscribers: (
            <Suspense fallback={null}>
              <DigestSubscriberCount />
            </Suspense>
          ),
          likes: edition.isPreview ? (
            <></>
          ) : (
            <Suspense
              fallback={
                <span
                  aria-label="Loading likes"
                  className="inline-block h-7 w-14 animate-pulse rounded-full bg-muted"
                />
              }
            >
              <Likes edition={edition} />
            </Suspense>
          ),
          admin: (
            <Suspense fallback={null}>
              <AdminLink />
            </Suspense>
          ),
          calendar: (
            <Suspense
              fallback={
                <div role="status" className="h-72 animate-pulse bg-muted">
                  Loading calendar…
                </div>
              }
            >
              <Calendar archive={archive} date={edition.digestDate} />
            </Suspense>
          ),
          recent: (
            <Suspense fallback={null}>
              <Calendar archive={archive} date={edition.digestDate} recent />
            </Suspense>
          ),
          trends: edition.isPreview ? null : (
            <Suspense fallback={null}>
              <DigestTrends />
            </Suspense>
          ),
          comments: edition.isPreview ? (
            <></>
          ) : (
            <Suspense fallback={<p role="status">Loading discussion…</p>}>
              <Comments edition={edition} />
            </Suspense>
          ),
          bulletin: edition.isPreview ? null : (
            <Suspense fallback={null}>
              <DigestBulletin edition={edition} />
            </Suspense>
          ),
        }}
      />
    </>
  )
}
