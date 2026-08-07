import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TweetRow } from '@/components/portal/TweetRow'
import { CARD, MUTED, SERIF } from '@/components/portal/styles'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalBangers } from '@/lib/portal/data'

export const metadata = { title: 'Recent bangers · Community Archive' }
export const maxDuration = 60

export default async function BangersPage() {
  if (!(await getIsMember())) redirect('/')
  const bangers = await getPortalBangers()

  return (
    <main className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
        <Link
          href="/"
          className={`mb-2 inline-flex text-[12.5px] font-semibold ${MUTED} hover:text-brand`}
        >
          ← Dashboard
        </Link>
        <h1 className="mb-1.5 text-[26px] font-semibold" style={SERIF}>
          Recent bangers
        </h1>
        <p className={`mb-[18px] text-[13px] leading-relaxed ${MUTED}`}>
          Tweets authored in the last 48 hours, ranked by distinct quote tweets
          from archive uploaders and opted-in members. Quotes by the
          tweet&apos;s own author do not count. Refreshed from ClickHouse every
          30 minutes.
        </p>

        {bangers.length > 0 ? (
          <div className={`${CARD} overflow-hidden`}>
            {bangers.map((tweet) => (
              <TweetRow key={tweet.id} tweet={tweet} showDate />
            ))}
          </div>
        ) : (
          <div
            className={`${CARD} px-4 py-12 text-center text-[13px] ${MUTED}`}
          >
            No recent bangers are available yet.
          </div>
        )}
      </div>
    </main>
  )
}
