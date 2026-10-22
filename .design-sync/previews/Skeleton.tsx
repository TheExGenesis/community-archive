import { Skeleton } from 'community-archive'

export const Lines = () => (
  <div className="w-80 space-y-3">
    <Skeleton className="h-4 w-48" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-4/5" />
  </div>
)

export const TweetCard = () => (
  <div className="rounded-lg border border-border bg-card p-5" style={{ width: 384 }}>
    <div className="flex gap-3">
      <Skeleton className="h-11 w-11 rounded-full" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-4 w-48 max-w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  </div>
)

export const ResultsHeader = () => (
  <div className="flex items-center justify-between gap-4" style={{ width: 384 }}>
    <div className="space-y-2">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-48" />
    </div>
    <Skeleton className="h-9 w-28" />
  </div>
)
