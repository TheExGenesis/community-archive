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
  const edition = await getPublishedDigest(params.date)
  if (!edition) notFound()
  return <PublishedDigestView edition={edition} />
}
