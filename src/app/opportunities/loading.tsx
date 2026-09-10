import styles from '@/components/bulletin/OpportunityBoard.module.css'

export default function LoadingOpportunities() {
  return (
    <main className={styles.page} aria-busy="true">
      <header className={styles.head}>
        <h1 className={styles.title}>Opportunities</h1>
        <p role="status" className={styles.lede}>
          Loading opportunities…
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
