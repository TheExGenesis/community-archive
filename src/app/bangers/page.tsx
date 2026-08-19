import Link from 'next/link'
import { BangersExplorer } from '@/components/portal/BangersExplorer'
import { MUTED, SERIF } from '@/components/portal/styles'
import { getInitialPortalBangersPage } from '@/lib/portal/data'
import type {
  PortalBangersPeriod,
  PortalBangersScope,
} from '@/lib/portal/types'
import { getIsMember } from '@/lib/portal/auth'
import { PUBLIC_PORTAL_PREVIEW_LIMIT } from '@/lib/portal/access'

export const metadata = { title: 'Bangers · Community Archive' }
export const maxDuration = 60

type BangersSearchParams = Record<string, string | string[] | undefined>

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

export default async function BangersPage({
  searchParams,
}: {
  searchParams: BangersSearchParams
}) {
  const sort = 'quotes' as const
  const scope: PortalBangersScope =
    paramValue(searchParams.scope) === 'members' ? 'members' : 'all'
  const periodValue = paramValue(searchParams.period)
  const requestedYear = Number(paramValue(searchParams.year))
  const currentYear = new Date().getUTCFullYear()
  const year =
    Number.isInteger(requestedYear) &&
    requestedYear >= 2006 &&
    requestedYear <= currentYear + 1
      ? requestedYear
      : undefined
  const period: PortalBangersPeriod | undefined =
    periodValue === 'today' ||
    periodValue === 'week' ||
    periodValue === 'three-months'
      ? periodValue
      : undefined
  const allTime =
    periodValue === 'all' || (period === undefined && year === undefined)
  const query = paramValue(searchParams.q).trim().slice(0, 120)
  const [isMember, initialPage] = await Promise.all([
    getIsMember(),
    getInitialPortalBangersPage({
      limit: PUBLIC_PORTAL_PREVIEW_LIMIT,
      scope,
      sort,
      ...(period ? { period } : { year }),
      query,
    }),
  ])

  return (
    <main className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <Link
          href="/"
          className={`mb-5 inline-flex text-[12.5px] font-semibold ${MUTED} hover:text-brand`}
        >
          ← Dashboard
        </Link>
        <header className="mb-7 max-w-[760px]">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
            <span aria-hidden="true">✦</span>
            The archive&apos;s standout posts
          </p>
          <h1
            className="mb-2 text-[34px] font-semibold leading-tight sm:text-[38px]"
            style={SERIF}
          >
            Bangers
          </h1>
          <p className={`text-[13.5px] leading-relaxed ${MUTED}`}>
            The archive&apos;s best tweets, ranked by distinct archived quotes
            from archive uploaders and opted-in members. Quotes by the original
            author do not count. Best of all time is selected by default, with
            recent ranges available below.
          </p>
        </header>
        <BangersExplorer
          key={`${scope}:${sort}:${period ?? year ?? 'all'}:${query}`}
          initialPage={initialPage}
          scope={scope}
          sort={sort}
          currentYear={currentYear}
          year={period ? undefined : year}
          period={period}
          allTime={allTime}
          initialQuery={query}
          isMember={isMember}
        />
      </div>
    </main>
  )
}
