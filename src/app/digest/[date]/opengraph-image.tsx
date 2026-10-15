import { getPublishedDigest } from '@/lib/digest/data'
import { DIGEST_CARD_SIZE, digestEditionCard } from '@/lib/digest/socialCard'

export const alt = 'Headlines from a Community Archive daily digest'
export const size = DIGEST_CARD_SIZE
export const contentType = 'image/png'
export const revalidate = 300

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export default async function Image({ params }: { params: { date: string } }) {
  return digestEditionCard(
    DATE_PATTERN.test(params.date)
      ? await getPublishedDigest(params.date)
      : null,
  )
}
