'use client'

import { CommentThread } from '@/components/engagement/CommentThread'
import { LikeButton } from '@/components/engagement/LikeButton'

export function StrandLikeButton({
  strandId,
  ...props
}: {
  strandId: string
  initialCount: number
  initialLiked?: boolean
  isSignedIn?: boolean
}) {
  return (
    <LikeButton
      endpoint={`/api/strands/${strandId}`}
      noun="strand"
      {...props}
    />
  )
}

export function StrandComments({
  strandId,
  ...props
}: {
  strandId: string
  initialCount?: number
  isSignedIn?: boolean
}) {
  return <CommentThread endpoint={`/api/strands/${strandId}`} {...props} />
}
