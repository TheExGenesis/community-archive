import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BangersExplorer } from '@/components/portal/BangersExplorer'
import { MUTED, SERIF } from '@/components/portal/styles'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalBangers } from '@/lib/portal/data'

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
  if (!(await getIsMember())) redirect('/')
  const bangers = await getPortalBangers()
  const requestedSort = paramValue(searchParams.sort)
  const initialSort = ['quotes', 'likes', 'reposts', 'recent'].includes(
    requestedSort,
  )
    ? requestedSort
    : 'quotes'

  return (
    <main className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/"
          className={`mb-2 inline-flex text-[12.5px] font-semibold ${MUTED} hover:text-brand`}
        >
          ← Dashboard
        </Link>
        <h1 className="mb-1.5 text-[26px] font-semibold" style={SERIF}>
          Bangers
        </h1>
        <p className={`mb-5 max-w-3xl text-[13px] leading-relaxed ${MUTED}`}>
          The archive&apos;s most quoted tweets, ranked by distinct quote tweets
          from archive uploaders and opted-in members. Quotes by the original
          author do not count. Refreshed daily.
        </p>
        <BangersExplorer
          tweets={bangers}
          initialQuery={paramValue(searchParams.q)}
          initialSort={initialSort}
          initialYear={paramValue(searchParams.year)}
          initialView={
            paramValue(searchParams.view) === 'years' ? 'years' : 'list'
          }
        />
      </div>
    </main>
  )
}
