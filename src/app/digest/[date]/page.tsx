import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { checkIsAdmin } from '@/app/admin/data'
import { DigestEditionView } from '@/components/digest/DigestEditionView'
import {
  getDigestCommentCount,
  getDigestLikeState,
  getPublishedDigest,
  listPublishedDigestDays,
} from '@/lib/digest/data'
import { getDigestMetadata } from '@/lib/digest/metadata'
import { getCurrentUser } from '@/lib/portal/auth'

export const revalidate = 300
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function generateMetadata({
  params,
}: {
  params: { date: string }
}): Promise<Metadata> {
  if (!DATE_PATTERN.test(params.date))
    return getDigestMetadata(null, `/digest/${params.date}`, 'article')

  return getDigestMetadata(
    await getPublishedDigest(params.date),
    `/digest/${params.date}`,
    'article',
  )
}

export default async function DatedDigestPage({
  params,
}: {
  params: { date: string }
}) {
  if (!DATE_PATTERN.test(params.date)) notFound()
  const [edition, archive, isAdmin] = await Promise.all([
    getPublishedDigest(params.date),
    listPublishedDigestDays(),
    checkIsAdmin(),
  ])
  if (!edition) notFound()
  const [likes, user, commentCount] = await Promise.all([
    getDigestLikeState(edition),
    getCurrentUser(),
    getDigestCommentCount(edition),
  ])
  return (
    <DigestEditionView
      edition={edition}
      archive={archive}
      isAdmin={isAdmin}
      likeCount={likes.count}
      likedByViewer={likes.likedByViewer}
      isSignedIn={Boolean(user)}
      commentCount={commentCount}
    />
  )
}
