import Link from 'next/link'
import type { TermWeek } from '@/lib/portal/types'
import GuestTrendsSignIn from './GuestTrendsSignIn'
import { CARD, MUTED, SERIF } from './styles'
import { WeeklyKeywordRows } from './WeeklyKeywordRows'
import { TrendStoryRail } from './trends/TrendStoryRail'
import type { TrendStoryDay } from '@/lib/trendStories/core'

/**
 * The signed-out view of /trends: this week's trending terms from the
 * homepage's cached snapshot, with no per-term series reads.
 */
export default function GuestTrends({
  weekly,
  failed,
  storyDays = [],
}: {
  weekly: TermWeek[]
  failed: boolean
  storyDays?: TrendStoryDay[]
}) {
  return (
    <main className="flex-1 bg-zinc-100/80 dark:bg-transparent">
      <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6">
        <Link
          href="/"
          className={`mb-2 inline-flex items-center text-[12.5px] font-semibold ${MUTED} hover:text-brand`}
        >
          ← Dashboard
        </Link>
        <div className="mb-6">
          <h1 className="text-[30px] font-semibold" style={SERIF}>
            Trends explorer
          </h1>
          <p className={`mt-1 max-w-[680px] text-[13.5px] ${MUTED}`}>
            Compare the archive’s vocabulary over time, then inspect the posts
            behind each line.
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)] xl:grid-cols-[250px_minmax(0,1fr)_minmax(340px,0.72fr)]">
          {storyDays.length ? (
            <div className="min-w-0 lg:col-span-2 xl:sticky xl:top-20 xl:col-span-1">
              <TrendStoryRail days={storyDays} />
            </div>
          ) : null}
          <div className={`${CARD} flex flex-col`}>
            <div className="border-b border-zinc-200 px-4 py-3 text-[13px] font-bold dark:border-[#26262a]">
              {weekly.some((row) => !row.lane)
                ? 'Tracked terms · 7 days'
                : 'Trending terms · 7 days'}
            </div>
            <WeeklyKeywordRows weekly={weekly} failed={failed} />
          </div>
          <GuestTrendsSignIn />
        </div>
      </div>
    </main>
  )
}
