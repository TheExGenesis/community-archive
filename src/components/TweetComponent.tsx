'use client'

import React from 'react'
import { tweetPermalinkHref, type TweetOrigin } from '@/lib/navigation'
import { formatDistanceToNow } from 'date-fns'
import {
  FaHeart,
  FaRetweet,
  FaExternalLinkAlt,
  FaReply,
  FaTwitter,
} from 'react-icons/fa'
import { Archive } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { formatNumber } from '@/lib/formatNumber'
import TweetAvatarImage from '@/components/TweetAvatarImage'
import ImageLightbox from '@/components/ImageLightbox'

export interface TweetMedia {
  media_url: string
  media_type: string
  width?: number
  height?: number
}

export interface TweetUrl {
  expanded_url: string | null
  display_url: string
}

export interface TweetData {
  tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  retweet_count: number | null
  favorite_count: number
  reply_to_tweet_id: string | null
  quote_tweet_id: string | null
  retweeted_tweet_id: string | null
  avatar_media_url: string | null
  username: string
  account_display_name: string
  media: TweetMedia[]
  urls: TweetUrl[]
  reply_to_username?: string
  // For quote tweets
  quoted_tweet?: {
    tweet_id: string
    account_id: string
    created_at: string
    full_text: string
    retweet_count: number | null
    favorite_count: number
    avatar_media_url?: string
    username: string
    account_display_name: string
    media?: TweetMedia[]
    // True when the quoted tweet is missing from our archive AND wasn't recoverable
    // via Twitter syndication; renderer shows a tombstone.
    is_deleted?: boolean
    // True when the quoted tweet was hydrated at render time from Twitter's public
    // syndication endpoint (not from our DB); renderer marks it as not archived.
    from_external?: boolean
  }
  // Support both interface styles for compatibility
  account?: {
    profile?: {
      avatar_media_url?: string
    }
    username?: string
    account_display_name?: string
  }
  // For RT tweets with mentioned user data
  mentioned_users?: {
    mentioned_user: {
      user_id: string
      name: string
      screen_name: string
      account?: {
        username: string
        account_display_name: string
        profile?: {
          avatar_media_url: string
        }
      }
    }
  }[]
}

interface TweetComponentProps {
  tweet: TweetData
  className?: string
  collapseLongText?: boolean
  compact?: boolean
  permalinkOrigin?: TweetOrigin
  permalinkReturnTo?: string
}

export const compactTweetGridClass =
  'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-3 py-3 sm:px-4 md:grid-cols-[minmax(190px,0.95fr)_minmax(300px,2.6fr)_6.5rem_6rem_10rem] md:gap-x-4'

const compactActionClass =
  'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

// Helper function to decode HTML entities
const decodeHtmlEntities = (text: string): string => {
  if (typeof window === 'undefined') {
    // Server-side fallback
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
  }
  // Client-side: use DOM parser
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

export const TweetComponent: React.FC<TweetComponentProps> = ({
  tweet,
  className = '',
  collapseLongText = false,
  compact = false,
  permalinkOrigin,
  permalinkReturnTo,
}) => {
  const [isTextExpanded, setIsTextExpanded] = React.useState(false)
  // Support both interface formats for backwards compatibility
  const originalUsername =
    tweet.username || tweet.account?.username || 'Unknown'
  const originalDisplayName =
    tweet.account_display_name ||
    tweet.account?.account_display_name ||
    'Unknown'
  const originalProfilePicUrl =
    tweet.avatar_media_url || tweet.account?.profile?.avatar_media_url
  const replyToUsername = tweet.reply_to_username

  const isRetweet = !!tweet.retweeted_tweet_id
  const isQuoteTweet = !!tweet.quote_tweet_id
  const canCollapseText =
    collapseLongText && tweet.full_text.length > (compact ? 180 : 700)

  // Check if this is a retweet that starts with "RT @username"
  const rtMatch = tweet.full_text.match(/^RT @([A-Za-z0-9_]+):/)
  const isRtFormat = !!rtMatch

  // For RT tweets, we want to show the retweeted user's info, not the retweeter's
  let displayUsername = originalUsername
  let displayName = originalDisplayName
  let profilePicUrl = originalProfilePicUrl

  if (isRtFormat && rtMatch) {
    const rtUsername = rtMatch[1]
    // Look for the retweeted user in mentioned_users to get their data
    const mentionedUserRecord = tweet.mentioned_users?.find(
      (userRecord) =>
        userRecord.mentioned_user.screen_name.toLowerCase() ===
        rtUsername.toLowerCase(),
    )

    if (mentionedUserRecord) {
      const mentionedUser = mentionedUserRecord.mentioned_user
      displayUsername = mentionedUser.screen_name
      displayName = mentionedUser.name

      // Use the mentioned user's avatar if available, otherwise use placeholder
      if (mentionedUser.account?.profile?.avatar_media_url) {
        profilePicUrl = mentionedUser.account.profile.avatar_media_url
      } else {
        // For RT tweets, if we don't have the retweeted user's avatar, use placeholder
        profilePicUrl = undefined
      }
    } else {
      // If we can't find the mentioned user data, still use extracted username but placeholder avatar
      displayUsername = rtUsername
      displayName = rtUsername // fallback to username as display name
      profilePicUrl = undefined
    }
  }

  const formatText = (text: string) => {
    // First decode HTML entities
    let formattedText = decodeHtmlEntities(text)

    // Replace t.co URLs with their expanded versions or display URLs
    if (tweet.urls) {
      tweet.urls.forEach((url) => {
        if (url.display_url) {
          const tcoRegex = new RegExp('https://t\\.co/\\w+', 'g')
          formattedText = formattedText.replace(tcoRegex, () => {
            // For quote tweets, don't show the Twitter URL inline
            if (
              url.expanded_url &&
              url.expanded_url.includes('twitter.com/') &&
              url.expanded_url.includes('/status/')
            ) {
              return ''
            }
            return url.expanded_url || url.display_url
          })
        }
      })
    }

    // Simple URL detection and conversion to links for any remaining URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g
    return formattedText
      .split(urlRegex)
      .map((part, index) => {
        if (urlRegex.test(part)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-brand underline-offset-2 hover:underline"
            >
              {part}
            </a>
          )
        }
        return part
      })
      .filter((part) => part !== '') // Remove empty strings
  }

  const renderMedia = () => {
    // Support both tweet.media and (tweet as any).media for different query formats
    const mediaArray = tweet.media || (tweet as any).media || []
    if (!mediaArray || mediaArray.length === 0) return null

    const renderableMedia = mediaArray.filter(
      (mediaItem: any) =>
        mediaItem.media_type === 'photo' ||
        mediaItem.media_type.startsWith('image/') ||
        mediaItem.media_type === 'video',
    )
    if (renderableMedia.length === 0) return null

    if (compact) {
      return (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {renderableMedia.slice(0, 4).map((mediaItem: any, index: number) => (
            <ImageLightbox
              key={index}
              src={mediaItem.media_url}
              alt={`Tweet image ${index + 1}`}
              width={mediaItem.width || 1200}
              height={mediaItem.height || 800}
              sizes="(max-width: 640px) 7rem, 9rem"
              className="h-20 w-28 flex-none rounded-md border border-border bg-muted sm:h-24 sm:w-36"
              imageClassName="h-full w-full object-cover transition-transform hover:scale-[1.02]"
            />
          ))}
          {renderableMedia.length > 4 && (
            <div className="flex h-20 w-20 flex-none items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground sm:h-24">
              +{renderableMedia.length - 4} more
            </div>
          )}
        </div>
      )
    }

    return (
      <div
        className={`my-3 grid gap-2 ${renderableMedia.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
      >
        {renderableMedia.map((mediaItem: any, index: number) => (
          <ImageLightbox
            key={index}
            src={mediaItem.media_url}
            alt={`Tweet image ${index + 1}`}
            width={mediaItem.width || 1200}
            height={mediaItem.height || 800}
            sizes={
              renderableMedia.length > 1
                ? '(max-width: 640px) 50vw, 360px'
                : '(max-width: 640px) 100vw, 720px'
            }
            className="rounded-lg border border-border bg-muted"
            imageClassName="h-full max-h-96 min-h-40 w-full object-cover transition-transform hover:scale-[1.01]"
          />
        ))}
      </div>
    )
  }

  const renderQuotedTweet = () => {
    if (!isQuoteTweet || !tweet.quoted_tweet) return null

    const quotedTweet = tweet.quoted_tweet
    // The fetchers set is_deleted=true when the quote relationship exists but the
    // target tweet has been deleted. Render a muted tombstone instead of trying to
    // show an empty card.
    if (quotedTweet.is_deleted) {
      return (
        <div
          className={`${compact ? 'mt-2 p-2 text-xs' : 'mt-3 p-3 text-sm'} rounded-lg border border-dashed border-border bg-muted italic text-muted-foreground dark:bg-card`}
        >
          [Quoted tweet deleted]
        </div>
      )
    }
    const quotedProfilePic = quotedTweet.avatar_media_url
    // Border + marker for syndication-hydrated quotes so it's clear the data isn't
    // from this archive.
    const externalClasses = quotedTweet.from_external
      ? 'border-dashed border-amber-300 bg-background dark:border-amber-700 dark:bg-card'
      : 'border-border bg-background dark:bg-card'

    return (
      <div
        className={`relative rounded-lg border ${compact ? 'mt-2 p-2' : 'mt-3 p-3'} ${externalClasses}`}
      >
        {quotedTweet.from_external && (
          <span className="absolute right-2 top-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            from Twitter · not archived
          </span>
        )}
        <div
          className={`flex items-start ${compact ? 'space-x-2' : 'space-x-3'}`}
        >
          <Avatar
            className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} flex-shrink-0`}
          >
            <TweetAvatarImage
              src={quotedProfilePic}
              alt={`${quotedTweet.account_display_name}'s profile picture`}
              username={quotedTweet.username}
              tweetId={quotedTweet.tweet_id}
            />
            <AvatarFallback>
              {quotedTweet.account_display_name?.charAt(0) ||
                quotedTweet.username?.charAt(0) ||
                'U'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
              <span className="text-sm font-bold text-foreground">
                {quotedTweet.account_display_name}
              </span>
              <span className="text-sm text-muted-foreground">
                @{quotedTweet.username}
              </span>
              <span className="text-xs text-muted-foreground">
                •{' '}
                {formatDistanceToNow(new Date(quotedTweet.created_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
            <p
              className={`whitespace-pre-wrap break-words text-foreground ${
                compact ? 'line-clamp-3 text-xs leading-4' : 'text-sm leading-6'
              }`}
            >
              {decodeHtmlEntities(quotedTweet.full_text)}
            </p>
            {quotedTweet.media && quotedTweet.media.length > 0 && (
              <div
                className={
                  compact
                    ? 'mt-2 flex gap-1.5 overflow-x-auto'
                    : 'mt-2 flex flex-col space-y-1'
                }
              >
                {quotedTweet.media
                  .filter(
                    (m: any) =>
                      m.media_type === 'photo' ||
                      m.media_type.startsWith('image/') ||
                      m.media_type === 'video',
                  )
                  .slice(0, compact ? 3 : undefined)
                  .map((mediaItem: any, index: number) => (
                    <ImageLightbox
                      key={index}
                      src={mediaItem.media_url}
                      alt={`Quoted tweet image ${index + 1}`}
                      width={mediaItem.width || 1200}
                      height={mediaItem.height || 800}
                      sizes={
                        compact ? '6rem' : '(max-width: 640px) 100vw, 640px'
                      }
                      className={`relative overflow-hidden rounded-md border dark:border-border ${
                        compact ? 'h-16 w-24 flex-none' : ''
                      }`}
                      imageClassName={
                        compact
                          ? 'h-full w-full object-cover transition-transform hover:scale-[1.02]'
                          : 'h-auto max-h-48 w-full object-contain transition-transform hover:scale-[1.01]'
                      }
                    />
                  ))}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center space-x-4">
                <span className="flex items-center">
                  <FaHeart className="mr-1" />{' '}
                  {formatNumber(quotedTweet.favorite_count)}
                </span>
                <span className="flex items-center">
                  <FaRetweet className="mr-1" />{' '}
                  {formatNumber(quotedTweet.retweet_count ?? 0)}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <a
                  href={tweetPermalinkHref(
                    quotedTweet.tweet_id,
                    permalinkOrigin,
                    permalinkReturnTo,
                  )}
                  className="transition-colors hover:text-foreground"
                  title="Permalink to quoted tweet"
                >
                  <FaExternalLinkAlt className="h-3 w-3" />
                </a>
                <a
                  href={`https://twitter.com/${quotedTweet.username}/status/${quotedTweet.tweet_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-foreground"
                  title="View quoted tweet on Twitter"
                >
                  <FaExternalLinkAlt className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderCompactActions = () => (
    <div
      className="inline-flex items-center gap-1.5"
      role="group"
      aria-label="Tweet links"
    >
      <a
        href={tweetPermalinkHref(
          tweet.tweet_id,
          permalinkOrigin,
          permalinkReturnTo,
        )}
        className={`${compactActionClass} border-brand/30 bg-brand/10 text-brand hover:bg-brand/20`}
        aria-label="View tweet in Community Archive"
        title="View tweet in Community Archive"
      >
        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
        Archive
      </a>
      <a
        href={`https://twitter.com/${displayUsername}/status/${tweet.tweet_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${compactActionClass} border-sky-300/70 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950/70`}
        aria-label="View original tweet on Twitter"
        title="View original tweet on Twitter"
      >
        <FaTwitter className="h-3.5 w-3.5" aria-hidden="true" />
        Twitter
      </a>
    </div>
  )

  if (compact) {
    const createdAt = new Date(tweet.created_at)
    const formattedDate = createdAt.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

    return (
      <div className={`${compactTweetGridClass} ${className}`}>
        <div
          role="cell"
          className="col-span-2 flex min-w-0 items-center gap-2.5 md:col-span-1"
        >
          <Avatar className="h-8 w-8 flex-shrink-0">
            <TweetAvatarImage
              src={profilePicUrl}
              alt={`${displayName}'s profile picture`}
              username={displayUsername}
              tweetId={tweet.retweeted_tweet_id || tweet.tweet_id}
            />
            <AvatarFallback className="text-xs">
              {displayName?.charAt(0) || displayUsername?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              @{displayUsername}
            </div>
            {(isRetweet || isRtFormat) && (
              <div className="mt-1 flex items-center truncate text-[11px] text-muted-foreground">
                <FaRetweet className="mr-1 flex-shrink-0" />@{originalUsername}{' '}
                retweeted
              </div>
            )}
            {replyToUsername && (
              <div className="mt-1 flex items-center truncate text-[11px] text-muted-foreground">
                <FaReply className="mr-1 flex-shrink-0" />
                Replying to @{replyToUsername}
              </div>
            )}
          </div>
        </div>

        <div role="cell" className="col-span-2 min-w-0 md:col-span-1">
          <p
            className={`whitespace-pre-wrap break-words text-sm leading-5 text-foreground ${
              canCollapseText && !isTextExpanded ? 'line-clamp-2' : ''
            }`}
          >
            {formatText(tweet.full_text)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {canCollapseText && (
              <button
                type="button"
                onClick={() => setIsTextExpanded((expanded) => !expanded)}
                className="text-xs font-medium text-brand hover:underline"
              >
                {isTextExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
          {renderMedia()}
          {renderQuotedTweet()}
        </div>

        <div
          role="cell"
          className="col-span-2 flex items-center justify-between text-xs text-muted-foreground md:hidden"
          title={createdAt.toLocaleString()}
        >
          <span>{formatDistanceToNow(createdAt, { addSuffix: true })}</span>
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <FaHeart aria-hidden="true" />
              {formatNumber(tweet.favorite_count)}
              <span className="sr-only">likes</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <FaRetweet aria-hidden="true" />
              {formatNumber(tweet.retweet_count ?? 0)}
              <span className="sr-only">reposts</span>
            </span>
          </span>
          {renderCompactActions()}
        </div>

        <div
          role="cell"
          className="hidden self-center text-xs text-muted-foreground md:block"
          title={createdAt.toLocaleString()}
        >
          {formattedDate}
        </div>

        <div
          role="cell"
          className="hidden items-center gap-3 self-center text-xs text-muted-foreground md:flex"
        >
          <span className="inline-flex items-center gap-1">
            <FaHeart aria-hidden="true" />
            {formatNumber(tweet.favorite_count)}
            <span className="sr-only">likes</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <FaRetweet aria-hidden="true" />
            {formatNumber(tweet.retweet_count ?? 0)}
            <span className="sr-only">reposts</span>
          </span>
        </div>

        <div
          role="cell"
          className="hidden items-center justify-end self-center md:flex"
        >
          {renderCompactActions()}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      {(isRetweet || isRtFormat) && (
        <div className="mb-2 flex items-center text-sm text-muted-foreground">
          <FaRetweet className="mr-2" />
          {originalUsername} retweeted
        </div>
      )}

      <div className="mb-3 flex items-start">
        <Avatar className="mr-3 h-11 w-11 flex-shrink-0">
          <TweetAvatarImage
            src={profilePicUrl}
            alt={`${displayName}'s profile picture`}
            username={displayUsername}
            tweetId={tweet.retweeted_tweet_id || tweet.tweet_id}
          />
          <AvatarFallback>
            {displayName?.charAt(0) || displayUsername?.charAt(0) || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-bold text-foreground">{displayName}</span>
            <span className="text-muted-foreground">@{displayUsername}</span>
            <span className="text-sm text-muted-foreground">
              •{' '}
              {formatDistanceToNow(new Date(tweet.created_at), {
                addSuffix: true,
              })}
            </span>
          </div>
          {replyToUsername && (
            <div className="flex items-center text-sm text-muted-foreground">
              <FaReply className="mr-1" />
              Replying to @{replyToUsername}
            </div>
          )}
        </div>
      </div>

      <p
        className={`mb-2 whitespace-pre-wrap break-words text-[15px] leading-6 text-foreground ${
          canCollapseText && !isTextExpanded ? 'line-clamp-[10]' : ''
        }`}
      >
        {formatText(tweet.full_text)}
      </p>

      {canCollapseText && (
        <button
          type="button"
          onClick={() => setIsTextExpanded((expanded) => !expanded)}
          className="mb-2 text-sm font-medium text-brand hover:underline"
        >
          {isTextExpanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {renderMedia()}
      {renderQuotedTweet()}

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-4">
          <span className="flex items-center">
            <FaHeart className="mr-1" /> {formatNumber(tweet.favorite_count)}
          </span>
          <span className="flex items-center">
            <FaRetweet className="mr-1" />{' '}
            {formatNumber(tweet.retweet_count ?? 0)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{new Date(tweet.created_at).toLocaleDateString()}</span>
          <a
            href={tweetPermalinkHref(
              tweet.tweet_id,
              permalinkOrigin,
              permalinkReturnTo,
            )}
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            title="Permalink"
          >
            <FaExternalLinkAlt className="h-3 w-3" />
            Archive
          </a>
          <a
            href={`https://twitter.com/${displayUsername}/status/${tweet.tweet_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            title="View on Twitter"
          >
            <FaExternalLinkAlt className="h-3 w-3" />
            Twitter
          </a>
        </div>
      </div>
    </div>
  )
}

export default TweetComponent
