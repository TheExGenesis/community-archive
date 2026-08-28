'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import TweetCard from '@/components/TweetCard'
import { profilePortalTweet } from '@/lib/metaTwitter/bangerPortalTweet'
import type { ProfileTweet } from '@/lib/metaTwitter/types'

function TweetCards({
  avatarUrl,
  returnTo,
  tweets,
}: {
  avatarUrl: string | null
  returnTo: string
  tweets: ProfileTweet[]
}) {
  if (tweets.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
        No tweets are available in this view yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {tweets.map((tweet) => (
        <div key={tweet.tweet_id}>
          <TweetCard
            tweet={profilePortalTweet(tweet, avatarUrl)}
            clickable={false}
            showDate
            showExternalLink
            origin="profile"
            returnTo={returnTo}
          />
        </div>
      ))}
    </div>
  )
}

export function ProfileTweetFallback({
  avatarUrl,
  displayName,
  engagedTweets,
  recentTweets,
  returnTo,
}: {
  avatarUrl: string | null
  displayName: string
  engagedTweets: ProfileTweet[]
  recentTweets: ProfileTweet[]
  returnTo: string
}) {
  if (engagedTweets.length === 0 && recentTweets.length === 0) return null

  return (
    <section
      aria-labelledby="profile-more-tweets-heading"
      className="mx-4 mb-8 mt-12 border-t border-border pt-8 sm:mx-6"
    >
      <div className="mx-auto max-w-3xl">
        <h2 id="profile-more-tweets-heading" className="text-xl font-extrabold">
          More from {displayName}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          See their tweets with the most likes and reposts, or switch to what
          they posted recently.
        </p>

        <Tabs
          defaultValue={engagedTweets.length > 0 ? 'engagement' : 'recent'}
          className="mt-4"
        >
          <TabsList aria-label="Profile tweet view">
            <TabsTrigger value="engagement">Most engaged</TabsTrigger>
            <TabsTrigger value="recent">Recent tweets</TabsTrigger>
          </TabsList>
          <TabsContent value="engagement" className="mt-4">
            <TweetCards
              avatarUrl={avatarUrl}
              returnTo={returnTo}
              tweets={engagedTweets}
            />
          </TabsContent>
          <TabsContent value="recent" className="mt-4">
            <TweetCards
              avatarUrl={avatarUrl}
              returnTo={returnTo}
              tweets={recentTweets}
            />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}
