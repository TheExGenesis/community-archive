import Link from 'next/link'
import { BangersExplorer } from '@/components/portal/BangersExplorer'
import { MUTED, SERIF } from '@/components/portal/styles'
import { getInitialPortalBangersPage } from '@/lib/portal/data'
import type {
  PortalBangersPeriod,
  PortalBangersScope,
} from '@/lib/portal/types'

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
  const initialPage = await getInitialPortalBangersPage({
    scope,
    sort,
    ...(period ? { period } : { year }),
    query,
  })

  return (
    <main className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <Link
          href="/"
          className={`mb-3 inline-flex text-[12.5px] font-semibold ${MUTED} hover:text-brand`}
        >
          ← Dashboard
        </Link>
        <header className="mb-5 max-w-[760px]">
          <h1
            className="text-[34px] font-semibold leading-tight sm:text-[38px]"
            style={SERIF}
          >
            Bangers
          </h1>
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
        />
      </div>
    </main>
  )
}
