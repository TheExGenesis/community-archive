import dynamic from 'next/dynamic'
import { redirect } from 'next/navigation'
import { getIsMember } from '@/lib/portal/auth'
import { getSocialGraphSnapshot } from '@/lib/socialGraph'
import { MUTED, SERIF } from '@/components/portal/styles'

const SocialGraphExplorer = dynamic(() => import('./SocialGraphExplorer'), {
  ssr: false,
  loading: () => (
    <div className="h-[min(72vh,760px)] animate-pulse rounded-[4px] border border-zinc-200 bg-zinc-200/60 dark:border-[#26262a] dark:bg-[#151517]" />
  ),
})

export const metadata = { title: 'Social graph · Community Archive' }

export default async function SocialGraphPage() {
  if (!(await getIsMember())) redirect('/login?redirect=/social-graph')

  let snapshot
  try {
    snapshot = await getSocialGraphSnapshot()
  } catch (error) {
    console.error('Social graph snapshot request failed:', error)
    return (
      <main className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
          <h1 className="text-[26px] font-semibold" style={SERIF}>
            Social graph
          </h1>
          <p className={`mt-2 text-[13px] ${MUTED}`}>
            The daily interaction graph is temporarily unavailable. No live
            database query runs from this page, so it will recover when the next
            snapshot is published.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold" style={SERIF}>
              Mutual interactions
            </h1>
            <p className={`mt-1 max-w-3xl text-[13px] ${MUTED}`}>
              Replies and quotes between archive members. Edge strength uses the
              weaker direction, normalized by each person&apos;s total outgoing
              interactions.
            </p>
          </div>
          <p className={`text-[11px] ${MUTED}`}>
            Snapshot {new Date(snapshot.generatedAt).toLocaleString()}
          </p>
        </div>
        <SocialGraphExplorer snapshot={snapshot} />
      </div>
    </main>
  )
}
