import { LoadingStatus } from '@/components/LoadingStatus'
import styles from '@/components/bulletin/BulletinBoard.module.css'

export default function LoadingBulletin() {
  return (
    <main className={styles.page} aria-busy="true">
      <header className={styles.head}>
        <h1 className={styles.title}>Bulletin</h1>
        <LoadingStatus
          className={`block ${styles.lede}`}
          label="Loading notices…"
          slowLabel="Still loading the bulletin…"
        />
      </header>
      <div className={styles.board} aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="h-[112px] animate-pulse rounded-lg border bg-muted/20"
          />
        ))}
      </div>
    </main>
  )
}
