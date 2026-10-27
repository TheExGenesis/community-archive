import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import TweetPermalink from '@/components/tweetPage/TweetPermalink'
import { loadTweetPage } from '@/lib/tweetSummary/loadTweetPage'
import { tweetPageMetadata } from '@/lib/tweetSummary/metadata'

// Consent-dependent responses must never enter the shared page cache. Only
// visitors carrying a session cookie reach this route; the middleware sends
// everyone else to the cached /guest/tweets view, which is what a visitor
// without consent would see here anyway.
export const dynamic = 'force-dynamic'
// The first opted-in visit keeps streaming while its summary generates.
export const maxDuration = 30

type PageProps = {
  params: Promise<{ tweet_id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const loadFromProps = async ({ params, searchParams }: PageProps) => {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ])
  return loadTweetPage(
    resolvedParams.tweet_id,
    resolvedSearchParams?.from === 'opportunities',
  )
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  return tweetPageMetadata(await loadFromProps(props))
}

export default async function TweetPage(props: PageProps) {
  const page = await loadFromProps(props)
  if (!page) notFound()
  return <TweetPermalink page={page} />
}
