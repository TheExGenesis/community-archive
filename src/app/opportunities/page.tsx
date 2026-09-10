import type { Metadata } from 'next'
import styles from '@/components/bulletin/OpportunityBoard.module.css'
import { isBulletinAdmin, requireOpportunityUser } from '@/lib/bulletin/data'
import { loadBulletinPage } from '@/lib/bulletin/page'
import { DEFAULT_BULLETIN_FILTERS } from '@/lib/bulletin/types'
import { OpportunityBoard } from '@/components/bulletin/OpportunityBoard'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Opportunities | Community Archive',
  robots: { index: false, follow: false },
}

export default async function OpportunitiesPage() {
  await requireOpportunityUser()
  const [isAdmin, page] = await Promise.all([
    isBulletinAdmin(),
    loadBulletinPage(DEFAULT_BULLETIN_FILTERS).catch(() => null),
  ])
  return (
    <main className={styles.page}>
      {page === null ? (
        <div role="alert" className="rounded-lg border p-6">
          Opportunities could not be loaded. Refresh to try again.
        </div>
      ) : (
        <OpportunityBoard
          key={Date.now()}
          opportunities={page.opportunities}
          initialPage={page}
          me={page.personal.account_id}
          username={page.personal.username}
          graph={page.personal}
          now={page.now}
          isAdmin={isAdmin}
        />
      )}
    </main>
  )
}
