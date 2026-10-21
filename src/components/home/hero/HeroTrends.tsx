import Link from 'next/link'
import { buildSearchParams } from '@/lib/searchParams'
import type { HomepageData } from '@/lib/portal/data'
import styles from './hero.module.css'
export default async function HeroTrends({
  data,
}: {
  data: HomepageData['trends']
}) {
  const result = await data
  if (result.failed || !result.data.length) return null
  return (
    <div className={styles.trends} aria-label="Trending terms over seven days">
      <span>Trending:</span>
      {result.data.slice(0, 12).map((term) => (
        <Link
          key={term.term}
          data-map-term={term.term}
          href={`/search?${buildSearchParams(term.term)}`}
          prefetch={false}
        >
          {term.term}
          <span
            className={
              term.deltaPct !== null && term.deltaPct < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }
          >
            {term.deltaPct === null
              ? 'new'
              : `${term.deltaPct > 0 ? '+' : ''}${Math.round(term.deltaPct)}%`}
          </span>
        </Link>
      ))}
    </div>
  )
}
