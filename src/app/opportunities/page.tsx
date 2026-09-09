import type { Metadata } from 'next'
import Link from 'next/link'
import {
  isBulletinAdmin,
  loadOpportunities,
  loadBulletinRelationships,
  requireOpportunityUser,
} from '@/lib/bulletin/data'
import { OpportunityBoard } from '@/components/bulletin/OpportunityBoard'
import { ViewerForm } from '@/components/bulletin/ViewerForm'
import { RefreshButton } from '@/components/bulletin/RefreshButton'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Opportunities | Community Archive',
  robots: { index: false, follow: false },
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams?: { me?: string }
}) {
  await requireOpportunityUser()
  const isAdmin = await isBulletinAdmin()
  const personal = await loadBulletinRelationships(searchParams?.me)
  let opportunities
  try {
    opportunities = await loadOpportunities()
  } catch {
    opportunities = null
  }
  return (
    <main className="mx-auto min-h-[70vh] w-full min-w-0 max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Community bulletin
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            Opportunities
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Find someone to help, something to join, or an offer worth taking
            up. Asks and offers from the community, collected daily.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link
              href="/admin/opportunities"
              className="text-sm text-brand hover:underline"
            >
              Run dashboard →
            </Link>
          )}
          <RefreshButton />
        </div>
      </header>
      <ViewerForm
        username={searchParams?.me || personal.username}
        unavailable={!!searchParams?.me && !personal.available}
      />
      {opportunities === null ? (
        <div role="alert" className="rounded-lg border p-6">
          Opportunities could not be loaded. Refresh to try again.
        </div>
      ) : (
        <OpportunityBoard
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
