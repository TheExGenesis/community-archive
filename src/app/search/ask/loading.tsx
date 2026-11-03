'use client'

import { useSearchParams } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'

// Painted at once while the server checks who is asking, in the shape of
// the page about to arrive: a conversation when the address names one,
// otherwise the first-visit box, suggestions and recent questions.
export default function Loading() {
  const inThread = Boolean(useSearchParams().get('c'))
  return (
    <main className="min-h-screen bg-background" aria-busy="true">
      <section
        className={`mx-auto w-full px-4 py-8 sm:px-6 sm:py-12 ${
          inThread ? 'max-w-[84rem]' : 'max-w-2xl'
        }`}
      >
        {inThread ? <Thread /> : <FirstVisit />}
      </section>
    </main>
  )
}

function FirstVisit() {
  return (
    <div role="status" aria-label="Loading Ask the archive">
      <h1 className="mb-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Ask the archive
      </h1>
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="h-[5.5rem] px-4 pt-3.5">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center justify-end gap-3 px-4 pb-3 pt-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-16" />
        </div>
      </div>
      <div className="mt-2 px-1">
        <Skeleton className="h-3 w-56" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {[13, 17, 15, 18].map((rem) => (
          <Skeleton
            key={rem}
            className="h-8 rounded-full"
            style={{ width: `${rem}rem`, maxWidth: '100%' }}
          />
        ))}
      </div>
      <div className="mt-10">
        <Skeleton className="mb-2 h-3 w-14" />
        <div className="divide-y divide-border border-y">
          {[72, 56, 64].map((width) => (
            <div
              key={width}
              className="flex min-h-[2.75rem] items-center justify-between gap-4 px-1 py-2.5"
            >
              <Skeleton className="h-4" style={{ width: `${width}%` }} />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Thread() {
  return (
    <div role="status" aria-label="Opening the conversation">
      <div className="mb-6 flex min-h-[2.5rem] items-center justify-between gap-2">
        <h1 className="text-[15px] font-semibold text-foreground [font-family:inherit]">
          Ask the archive
        </h1>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  )
}
