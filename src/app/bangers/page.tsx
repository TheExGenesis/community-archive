import { Suspense } from 'react'
import { SectionReady } from '@/components/PagePerformance'
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

export default function BangersPage({
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
      : periodValue === 'all' || year !== undefined
        ? undefined
        : 'week'
  const allTime = periodValue === 'all'
  const query = paramValue(searchParams.q).trim().slice(0, 120)
  const initialPage = getInitialPortalBangersPage({
    scope,
    sort,
    ...(period ? { period } : { year: allTime ? undefined : year }),
    query,
  })

  return (
    <main className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <Link
          href="/"
          className={`mb-2 inline-flex text-[12.5px] font-semibold ${MUTED} hover:text-brand`}
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
        <Suspense
          key={`${scope}:${sort}:${period ?? year ?? 'all'}:${query}`}
          fallback={
            <p role="status" className="min-h-96 py-8 text-muted-foreground">
              Loading bangers…
            </p>
          }
        >
          <LoadedBangers
            key={`${scope}:${sort}:${period ?? year ?? 'all'}:${query}`}
            initialPage={initialPage}
            scope={scope}
            sort={sort}
            currentYear={currentYear}
            year={period || allTime ? undefined : year}
            period={period}
            allTime={allTime}
            initialQuery={query}
          />
        </Suspense>
      </div>
    </main>
  )
}

async function LoadedBangers({
  initialPage,
  ...props
}: Omit<React.ComponentProps<typeof BangersExplorer>, 'initialPage'> & {
  initialPage: ReturnType<typeof getInitialPortalBangersPage>
}) {
  const page = await initialPage
  return (
    <>
      <SectionReady section="bangers_results" />
      <BangersExplorer {...props} initialPage={page} />
    </>
  )
}
