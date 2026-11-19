import Link from 'next/link'
import { DigestBulletinCards } from '@/components/digest/DigestBulletinCards'
import { CARD, MUTED } from '@/components/portal/styles'
import type { DigestBulletinItem } from '@/lib/digest/bulletin'

/** A few Bulletin offers and asks, shown directly below the daily digest. */
export function HomeBulletinPanel({
  items,
  personalized,
}: {
  items: DigestBulletinItem[]
  personalized: boolean
}) {
  if (!items.length) return null
  return (
    <section
      aria-labelledby="home-bulletin-title"
      className={`${CARD} px-6 pb-7 pt-6 sm:px-8`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <span className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h2
            id="home-bulletin-title"
            className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand"
          >
            From the Bulletin
          </h2>
          <span className={`text-[12px] ${MUTED}`}>
            {personalized
              ? 'Offers and asks picked for you'
              : 'Offers and asks from community members'}
          </span>
        </span>
        <Link
          href="/bulletin"
          className="text-[13px] font-semibold text-brand hover:underline"
        >
          See the whole board &rarr;
        </Link>
      </div>
      <DigestBulletinCards
        items={items}
        origin="home"
        returnTo="/"
        className="!mt-5"
      />
    </section>
  )
}
