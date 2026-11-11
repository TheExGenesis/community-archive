import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import TweetPermalink from '@/components/tweetPage/TweetPermalink'
import { loadGuestTweetPage } from '@/lib/tweetSummary/loadTweetPage'
import { tweetPageMetadata } from '@/lib/tweetSummary/metadata'

/**
 * The signed-out view of /tweets/[tweet_id]: the main tweet with conversation
 * previews that invite the visitor to opt in. The middleware rewrites
 * cookie-less document requests here so it is rendered once per tweet and
 * served from the cache; it never reads the request, and force-static keeps
 * the fresh archive reads from marking the route dynamic.
 */
export const dynamic = 'force-static'
export const revalidate = 3600

type PageProps = {
  params: Promise<{ tweet_id: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { tweet_id } = await params
  return tweetPageMetadata(await loadGuestTweetPage(tweet_id))
}

export default async function GuestTweetPage({ params }: PageProps) {
  const { tweet_id } = await params
  const page = await loadGuestTweetPage(tweet_id)
  if (!page) notFound()
  return <TweetPermalink page={page} />
}
