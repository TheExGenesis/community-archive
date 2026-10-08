import type { TweetData } from '@/components/TweetComponent'
import type { PortalMedia, PortalQuotedTweet, PortalTweet } from './types'

function portalMedia(media: TweetData['media']): PortalMedia[] {
  return (media ?? []).map((item) => ({
    url: item.media_url,
    type: item.media_type,
    width: item.width,
    height: item.height,
  }))
}

/** Adapt a reverse quote-post result to the canonical portal tweet renderer. */
export function quoteTweetToPortalTweet(
  tweet: TweetData,
  target: PortalTweet,
): PortalTweet {
  return {
    id: tweet.tweet_id,
    accountId: tweet.account_id,
    username: tweet.username,
    name: tweet.account_display_name,
    avatar: tweet.avatar_media_url,
    text: tweet.full_text,
    observedAt: tweet.created_at,
    createdAt: tweet.created_at,
    likes: tweet.favorite_count,
    rts: tweet.retweet_count ?? 0,
    media: portalMedia(tweet.media),
    quotedTweet: {
      ...portalQuotedTweetFromPortalTweet(target),
    },
  }
}

function portalQuotedTweetFromPortalTweet(
  tweet: PortalTweet,
): PortalQuotedTweet {
  return {
    id: tweet.id,
    accountId: tweet.accountId,
    username: tweet.username,
    name: tweet.name,
    avatar: tweet.avatar,
    text: tweet.text,
    createdAt: tweet.createdAt,
    likes: tweet.likes,
    rts: tweet.rts,
    media: tweet.media ?? [],
  }
}
