import type { PortalMedia, PortalTweet } from '@/lib/portal/types'
import type { DigestStory } from './types'

function firstTweetMedia(tweet: PortalTweet): PortalMedia | undefined {
  return tweet.media?.[0] ?? tweet.quotedTweet?.media?.[0]
}

export function firstStoryMedia(story: DigestStory): PortalMedia | undefined {
  for (const tweet of [...story.bangers, ...story.commentary]) {
    const media = firstTweetMedia(tweet)
    if (media) return media
  }
  return undefined
}
