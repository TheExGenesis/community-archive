import { getPublishedDigest } from '@/lib/digest/data'
import { DIGEST_CARD_SIZE, digestEditionCard } from '@/lib/digest/socialCard'

export const alt = 'The latest Community Archive daily digest headlines'
export const size = DIGEST_CARD_SIZE
export const contentType = 'image/png'
export const revalidate = 300

export default async function Image() {
  return digestEditionCard(await getPublishedDigest())
}
