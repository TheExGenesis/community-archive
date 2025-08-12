'use client'

import React, { useState, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PopularTweet } from '@/lib/types'
import TweetComponent from '@/components/TweetComponent'
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
                {tweetData[key]?.map((popularTweet) => {
                  // Construct the tweet object expected by the TweetComponent
                  const tweetForTweetComponent = {
                    tweet_id: popularTweet.tweet_id,
                    account_id: '',
                    created_at: popularTweet.created_at,
                    full_text: popularTweet.full_text,
                    retweet_count: popularTweet.retweet_count,
                    favorite_count: popularTweet.favorite_count,
                    reply_to_tweet_id: null,
                    quote_tweet_id: null,
                    retweeted_tweet_id: null,
                    avatar_media_url: profilePicUrl,
                    username: username,
                    account_display_name: displayName,
                    media: [],
                    urls: [],
                    reply_to_username: popularTweet.reply_to_username || undefined,
                    mentioned_users: [],
                  }

                  return (
                    <div className="bg-background dark:bg-secondary p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-4">
                      <TweetComponent
                        key={popularTweet.tweet_id}
                        tweet={tweetForTweetComponent} // Pass the constructed object
                      />
                    </div>
                  )
                })}
              </ul>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

export default AccountTopTweetsClient
