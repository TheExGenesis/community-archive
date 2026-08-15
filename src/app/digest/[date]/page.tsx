import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { checkIsAdmin } from '@/app/admin/data'
import { DigestEditionView } from '@/components/digest/DigestEditionView'
import { getPublishedDigest, listPublishedDigestDays } from '@/lib/digest/data'

export const revalidate = 300
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function generateMetadata({
  params,
}: {
  params: { date: string }
}): Promise<Metadata> {
  return {
    title: DATE_PATTERN.test(params.date)
      ? `What Happened Yesterday · ${params.date} · Community Archive`
      : 'What Happened Yesterday · Community Archive',
  }
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
  return (
    <DigestEditionView edition={edition} archive={archive} isAdmin={isAdmin} />
  )
}
