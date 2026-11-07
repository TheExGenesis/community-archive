'use client'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { ProfileYearThemes } from '@/lib/metaTwitter/profileThemes'
import { cn } from '@/utils/tailwind'

const headingClass =
  'text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground'

const formatShare = (count: number, total: number) => {
  if (total <= 0) return '0%'
  const share = (count / total) * 100
  return share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`
}

export function ProfileStats({
  displayName,
  themeYears,
}: {
  displayName: string
  /** Periods in display order, e.g. this year then all time. */
  themeYears: ProfileYearThemes[]
}) {
  const years = themeYears.filter((year) => year.themes.length > 0)
  if (years.length === 0) return null

  // One x-scale for every card, so equal bars mean equal shares of posts.
  const maxShare = Math.max(
    ...years.flatMap((year) =>
      year.themes.map((theme) =>
        year.totalPosts > 0 ? theme.postCount / year.totalPosts : 0,
      ),
    ),
    0,
  )

  return (
    <TooltipProvider delayDuration={0}>
      <section
        aria-label={`${displayName}'s top themes`}
        className={cn(
          'grid gap-4 px-6 pb-5 pt-1',
          years.length > 1 && 'lg:grid-cols-2',
        )}
      >
        {years.map((year) => (
          <ThemesPanel
            key={year.year ?? 'all'}
            year={year}
            maxShare={maxShare}
          />
        ))}
      </section>
    </TooltipProvider>
  )
}

function ThemesPanel({
  year,
  maxShare,
}: {
  year: ProfileYearThemes
  maxShare: number
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={headingClass}>Top themes · {year.year ?? 'All time'}</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {year.totalPosts.toLocaleString('en-US')} posts
        </span>
      </div>
      <ol className="mt-3 flex flex-col gap-2.5">
        {year.themes.map((theme) => {
          const share =
            year.totalPosts > 0 ? theme.postCount / year.totalPosts : 0
          return (
            <li key={theme.label}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-baseline justify-between gap-3 text-[13px] leading-tight">
                      <span className="truncate font-semibold text-foreground">
                        {theme.label}
                      </span>
                      <span className="flex-none tabular-nums text-muted-foreground">
                        {formatShare(theme.postCount, year.totalPosts)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5">
                      <div
                        className="h-full rounded-full bg-[hsl(var(--chart-accent))]"
                        style={{
                          width: `${maxShare > 0 ? Math.max((share / maxShare) * 100, 2) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                      {theme.description}
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[260px] text-[12px]"
                >
                  <div className="font-semibold">{theme.label}</div>
                  <div className="text-muted-foreground">
                    {theme.postCount.toLocaleString('en-US')} of{' '}
                    {year.totalPosts.toLocaleString('en-US')} posts{' '}
                    {year.year === null ? 'overall' : `in ${year.year}`}
                  </div>
                  <div className="mt-1">{theme.description}</div>
                </TooltipContent>
              </Tooltip>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
