import styles from '@/components/bulletin/OpportunityBoard.module.css'
import { uiFont, displayFont } from './fonts'

export default function LoadingOpportunities() {
  return (
    <main
      className={`${styles.page} ${uiFont.variable} ${displayFont.variable}`}
      aria-busy="true"
    >
      <header className={styles.subbar}>
        <h1 className={styles.title}>Opportunities</h1>
        <p role="status" className={styles.lede}>
          Loading opportunities…
        </p>
      </header>
      <div className={styles.board} aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div className={styles.lane} key={i}>
            <div className="h-6 w-2/3 animate-pulse rounded bg-muted/40" />
            {Array.from({ length: 3 }, (_, j) => (
              <div
                key={j}
                className="h-[180px] animate-pulse rounded-[10px] border bg-muted/20"
              />
            ))}
          </div>
        ))}
      </div>
    </main>
  )
}
