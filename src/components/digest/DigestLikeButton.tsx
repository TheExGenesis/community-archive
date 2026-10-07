'use client'

import { LikeButton } from '@/components/engagement/LikeButton'

export function DigestLikeButton({
  editionId,
  ...props
}: {
  editionId: string
  initialCount: number
  initialLiked?: boolean
  isSignedIn?: boolean
}) {
  return (
    <LikeButton
      endpoint={`/api/digest/${editionId}`}
      noun="edition"
      {...props}
    />
  )
}
