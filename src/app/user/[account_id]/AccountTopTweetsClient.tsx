'use client'

import React, { useState, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PopularTweet } from '@/lib-client/types'
import Tweet from '@/components/Tweet'
import { CopyButton } from '@/components/copy-button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'

type TabData = {
  [key: string]: {
    title: string
  }
}

const tabData: TabData = {
  // liked: { title: 'Top Liked by CA Users' },
  // replied: { title: 'Top Replied to by CA Users' },
  favorited: { title: 'Top Favorited' },
  retweeted: { title: 'Top Retweeted' },
}

type Props = {
  tweetData: { [key: string]: PopularTweet[] }
  username: string
  displayName: string
  profilePicUrl: string
}

const AccountTopTweetsClient: React.FC<Props> = ({
  tweetData,
  username,
  displayName,
  profilePicUrl,
}) => {
  const [activeTab, setActiveTab] = useState('favorited')
  const [includedTabs, setIncludedTabs] = useState<{ [key: string]: boolean }>({
    // liked: true,
    // replied: true,
    favorited: true,
    retweeted: true,
  })

  const getTweetsAsText = useCallback(() => {
    const allTweets = Object.entries(tweetData)
      .filter(([key]) => includedTabs[key])
      .flatMap(([_, tweets]) => tweets)

    const uniqueTweets = Array.from(
      new Map(allTweets.map((tweet) => [tweet.tweet_id, tweet])).values(),
    )

    const sortedTweets = uniqueTweets.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )

    const tweetTexts = sortedTweets
      .map((tweet) => {
        const date = new Date(tweet.created_at).toLocaleString()
        const replyTo = tweet.reply_to_username
          ? `Replying to @${tweet.reply_to_username}\n`
          : ''
        return `${date}\n${replyTo}${tweet.full_text}\n\n`
      })
      .join('')

    const prefix = `Top tweets from @${username} as of ${new Date().toDateString()}\n\n`

    return prefix + tweetTexts
  }, [tweetData, username, includedTabs])

  const toggleTabInclusion = (tab: string) => {
    setIncludedTabs((prev) => ({ ...prev, [tab]: !prev[tab] }))
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        {/* <div className="flex items-center space-x-4">
          {Object.keys(tabData).map((key) => (
            <label key={key} className="flex items-center space-x-2">
              <Checkbox
                checked={includedTabs[key]}
                onCheckedChange={() => toggleTabInclusion(key)}
              />
              <span className="text-sm">{tabData[key].title}</span>
            </label>
          ))}
        </div> */}
        <div>
          <span className="mr-4 text-sm text-gray-600">
            Copy all tweets as text
          </span>
          <CopyButton textToCopy={getTweetsAsText()} />
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {Object.entries(tabData).map(([key, { title }]) => (
            <TabsTrigger key={key} value={key}>
              {title}
            </TabsTrigger>
          ))}
        </TabsList>
        {Object.entries(tabData).map(([key, { title }]) => (
          <TabsContent key={key} value={key}>
            <ScrollArea className="h-[33vh]">
              <ul>
                {tweetData[key]?.map((tweet) => (
                  <Tweet
                    key={tweet.tweet_id}
                    username={username}
                    displayName={displayName}
                    profilePicUrl={profilePicUrl}
                    text={tweet.full_text}
                    favoriteCount={tweet.favorite_count}
                    retweetCount={tweet.retweet_count}
                    date={tweet.created_at}
                    tweetUrl={`https://twitter.com/${username}/status/${tweet.tweet_id}`}
                    tweetId={tweet.tweet_id}
                    replyToUsername={tweet.reply_to_username || undefined}
                  />
                ))}
              </ul>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

export default AccountTopTweetsClient
