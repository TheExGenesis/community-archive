'use client'

import { CommentThread } from '@/components/engagement/CommentThread'

export type { ThreadComment as DigestComment } from '@/components/engagement/CommentThread'

export function DigestComments({
  editionId,
  ...props
}: {
  editionId: string
  initialCount?: number
  isSignedIn?: boolean
}) {
  return <CommentThread endpoint={`/api/digest/${editionId}`} {...props} />
}
