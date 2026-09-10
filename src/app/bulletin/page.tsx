import type { Metadata } from 'next'
import styles from '@/components/bulletin/BulletinBoard.module.css'
import { isBulletinAdmin, requireBulletinUser } from '@/lib/bulletin/data'
import { loadBulletinPage } from '@/lib/bulletin/page'
import { DEFAULT_BULLETIN_FILTERS } from '@/lib/bulletin/types'
import { BulletinBoard } from '@/components/bulletin/BulletinBoard'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Bulletin | Community Archive',
  robots: { index: false, follow: false },
}

export default async function BulletinBoardPage() {
  await requireBulletinUser()
  const [isAdmin, page] = await Promise.all([
    isBulletinAdmin(),
    loadBulletinPage(DEFAULT_BULLETIN_FILTERS).catch(() => null),
  ])
  return (
    <main className={styles.page}>
      {page === null ? (
        <div role="alert" className="rounded-lg border p-6">
          The bulletin could not be loaded. Refresh to try again.
        </div>
      ) : (
        <BulletinBoard
          key={Date.now()}
          notices={page.notices}
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
