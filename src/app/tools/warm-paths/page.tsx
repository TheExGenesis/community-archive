import type { Metadata } from 'next'
import { getTwitterUsername, requireAdmin } from '@/app/admin/data'
import { MUTED, SERIF } from '@/components/portal/styles'
import WarmPathsClient from './WarmPathsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Warm paths · Community Archive',
  robots: { index: false, follow: false },
}

// Admin-only: rankings of who can introduce whom are a new use of members'
// interactions, so this stays a private research tool for now.
export default async function WarmPathsPage() {
  const { user } = await requireAdmin('/tools/warm-paths')
  return (
    <main className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
        <h1 className="mb-1.5 text-[26px] font-semibold" style={SERIF}>
          Warm paths
        </h1>
        <p className={`mb-[18px] text-[13px] ${MUTED}`}>
          Who can introduce you to whom, ranked by how real the conversations
          along the way are. A tie needs replies or quotes in both directions;
          recent, long-running ties count most. Only members are in the graph,
          so every path runs through members. Admins only.
        </p>
        <WarmPathsClient defaultFrom={getTwitterUsername(user) ?? ''} />
      </div>
    </main>
  )
}
