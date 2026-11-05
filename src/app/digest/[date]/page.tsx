import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublishedDigestView } from '@/components/digest/PublishedDigestView'
import { getPublishedDigest } from '@/lib/digest/data'
import { getDigestMetadata } from '@/lib/digest/metadata'

export const revalidate = 300
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>
}): Promise<Metadata> {
  const { date } = await params
  if (!DATE_PATTERN.test(date))
    return getDigestMetadata(null, `/digest/${date}`, 'article')

  return getDigestMetadata(
    await getPublishedDigest(date),
    `/digest/${date}`,
    'article',
  )
}

export default async function DatedDigestPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params
  if (!DATE_PATTERN.test(date)) notFound()
  const edition = await getPublishedDigest(date)
  if (!edition) notFound()
  return <PublishedDigestView edition={edition} />
}
