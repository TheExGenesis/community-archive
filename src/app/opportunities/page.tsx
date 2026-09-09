import type { Metadata } from 'next'
import Link from 'next/link'
import {
  isBulletinAdmin,
  loadOpportunities,
  loadBulletinRelationships,
  requireOpportunityUser,
} from '@/lib/bulletin/data'
import { OpportunityBoard } from '@/components/bulletin/OpportunityBoard'
import { RefreshButton } from '@/components/bulletin/RefreshButton'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Opportunities | Community Archive',
  robots: { index: false, follow: false },
}

export default async function OpportunitiesPage() {
  await requireOpportunityUser()
  const [isAdmin, personal, opportunities] = await Promise.all([
    isBulletinAdmin(),
    loadBulletinRelationships(),
    loadOpportunities().catch(() => null),
  ])
  return (
    <main className="mx-auto min-h-[70vh] w-full min-w-0 max-w-[1800px] space-y-4 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Opportunities
          </h1>
          <p className="text-xs text-muted-foreground">
            Thanks to{' '}
            <Link href="/user/maskys_" className="text-brand hover:underline">
              @maskys_
            </Link>{' '}
            for the first prototype.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/admin/opportunities"
              className="text-xs text-brand hover:underline"
            >
              <span className="sm:hidden">Runs</span>
              <span className="hidden sm:inline">Run dashboard →</span>
            </Link>
          )}
          <RefreshButton />
        </div>
      </header>
      {opportunities === null ? (
        <div role="alert" className="rounded-lg border p-6">
          Opportunities could not be loaded. Refresh to try again.
        </div>
      ) : (
        <OpportunityBoard
          key={Date.now()}
          opportunities={opportunities}
          me={personal.account_id}
          username={personal.username}
          graph={personal}
          now={Date.now()}
        />
      )}
      <details className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          How these notices are found
        </summary>
        <p className="mt-3 leading-6">
          After the daily archive refresh, we check recent original posts from
          participating accounts for phrases suggesting an ask or offer. AI
          checks those candidates and writes the summaries. Read the original
          post before responding; a notice may be misclassified or no longer
          available.
        </p>
        <p className="mt-2 leading-6">
          This is a selection, not a complete directory. Replies, reposts, posts
          arriving more than two days late, and notices without matching phrases
          can be missed. The daily scan covers the previous two UTC days in
          ClickHouse. Undated asks expire after 14 days and offers after 60
          days; standing offers stay open. Use “Show past notices” to include
          expired notices.
        </p>
      </details>
    </main>
  )
}
