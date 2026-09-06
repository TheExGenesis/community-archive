import { Suspense } from 'react'
import Link from 'next/link'
import { StreamFeed } from '@/components/portal/StreamFeed'
import { startStreamData } from '@/lib/portal/data'
import { MUTED, SERIF } from '@/components/portal/styles'
import ExtensionInstallPrompt from '@/components/ExtensionInstallPrompt'
import { CHROME_EXTENSION_URL } from '@/lib/browserExtension'

export const metadata = { title: 'Stream · Community Archive' }
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function Total({
  result,
}: {
  result: ReturnType<typeof startStreamData>['stats']
}) {
  const { data, failed } = await result
  if (failed) return null
  return (
    <span
      className={`inline-flex items-center gap-[7px] text-[12px] ${MUTED}`}
      title="Archived tweet total from the latest corpus snapshot"
    >
      <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#2acf80]" />
      <span className="tabular-nums">
        {data.totalTweets.toLocaleString('en-US')} tweets
      </span>
    </span>
  )
}
async function Feed({
  result,
}: {
  result: ReturnType<typeof startStreamData>['tweets']
}) {
  const { data, failed } = await result
  return <StreamFeed tweets={data} failed={failed} />
}
export default function StreamPage() {
  const data = startStreamData()
  return (
    <main className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
        <Link
          href="/"
          className={`mb-2 inline-flex items-center text-[12.5px] font-semibold ${MUTED} hover:text-brand`}
        >
          ← Dashboard
        </Link>
        <div className="mb-1.5 flex items-baseline gap-3">
          <h1 className="text-[26px] font-semibold" style={SERIF}>
            Live stream
          </h1>
          <Suspense fallback={null}>
            <Total result={data.stats} />
          </Suspense>
        </div>
        <div className={`mb-3.5 text-[13px] ${MUTED}`}>
          Tweets arriving from the{' '}
          <a
            href={CHROME_EXTENSION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand"
          >
            browser extension
          </a>{' '}
          firehose, as contributors read their timelines.
        </div>
        <ExtensionInstallPrompt surface="stream" className="mb-3.5" />
        <Suspense
          fallback={
            <p role="status" className="min-h-96 py-8 text-muted-foreground">
              Loading live tweets…
            </p>
          }
        >
          <Feed result={data.tweets} />
        </Suspense>
      </div>
    </main>
  )
}
