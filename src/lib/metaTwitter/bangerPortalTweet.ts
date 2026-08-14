import type { ArchiveTweet, BangerTweet } from './types'
import type {
  PortalMedia,
  PortalQuotedTweet,
  PortalTweet,
} from '@/lib/portal/types'

function portalMedia(tweet: ArchiveTweet): PortalMedia[] {
  return tweet.media.flatMap((item): PortalMedia[] => {
    if (!item.media_url || !item.media_type) return []

    return [
      {
        url: item.media_url,
        type: item.media_type,
        ...(item.width > 0 ? { width: item.width } : {}),
        ...(item.height > 0 ? { height: item.height } : {}),
      },
    ]
  })
}

function portalQuotedTweet(tweet: BangerTweet): PortalQuotedTweet | undefined {
  if (tweet.quoted_tweet) {
    const quoted = tweet.quoted_tweet
    return {
      id: quoted.tweet_id,
      accountId: quoted.account_id,
      username: quoted.username,
      name: quoted.account_display_name,
      avatar: quoted.avatar_media_url,
      text: quoted.full_text,
      createdAt: quoted.created_at,
      likes: quoted.favorite_count,
      rts: quoted.retweet_count ?? 0,
      media: portalMedia(quoted),
    }
  }
  if (!tweet.quote_tweet_id) return undefined
  return {
    id: tweet.quote_tweet_id,
    username: '',
    name: '',
    avatar: null,
    text: '',
    createdAt: tweet.created_at,
    likes: 0,
    rts: 0,
    media: [],
    isDeleted: true,
  }
}

/**
 * Adapts the profile bangers payload to the canonical tweet-card contract.
 * Keep this adapter client-safe: Workspace sorts and progressively reveals the
 * cards in the browser.
 */
export function bangerPortalTweet(
  tweet: BangerTweet,
  fallbackAvatarUrl?: string | null,
): PortalTweet {
  return {
    id: tweet.tweet_id,
    accountId: tweet.account_id,
    username: tweet.username,
    name: tweet.account_display_name,
    avatar: tweet.avatar_media_url ?? fallbackAvatarUrl ?? null,
    text: tweet.full_text,
    observedAt: tweet.created_at,
    createdAt: tweet.created_at,
    likes: tweet.favorite_count,
    rts: tweet.retweet_count ?? 0,
    media: portalMedia(tweet),
    quotedTweet: portalQuotedTweet(tweet),
    quoteCount: tweet.quote_count,
  }
}
