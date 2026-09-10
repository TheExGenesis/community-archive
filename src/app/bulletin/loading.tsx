import styles from '@/components/bulletin/BulletinBoard.module.css'

export default function LoadingBulletin() {
  return (
    <main className={styles.page} aria-busy="true">
      <header className={styles.head}>
        <h1 className={styles.title}>Bulletin</h1>
        <p role="status" className={styles.lede}>
          Loading notices…
        </p>
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
