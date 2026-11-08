'use client'

import { CommentThread } from '@/components/engagement/CommentThread'

/** The discussion thread under a published weekly edition. */
export function WeeklyComments({
  editionId,
  ...props
}: {
  editionId: string
  initialCount?: number
  isSignedIn?: boolean
}) {
  return <CommentThread endpoint={`/api/digest/week/${editionId}`} {...props} />
}
