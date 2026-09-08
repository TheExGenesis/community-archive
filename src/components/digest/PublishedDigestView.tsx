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
          comments: edition.isPreview ? (
            <></>
          ) : (
            <Suspense fallback={<p role="status">Loading discussion…</p>}>
              <Comments edition={edition} />
            </Suspense>
          ),
        }}
      />
    </>
  )
}
