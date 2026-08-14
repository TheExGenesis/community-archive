import type { BangerTweet } from './types'
import type { PortalMedia, PortalTweet } from '@/lib/portal/types'

function portalMedia(tweet: BangerTweet): PortalMedia[] {
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
    quoteCount: tweet.quote_count,
  }
}
