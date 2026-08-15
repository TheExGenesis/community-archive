import 'server-only'

import { createServerServiceRoleClient } from '@/utils/supabase'
import { devLog } from '@/lib/devLog'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import type { TweetData } from '@/components/TweetComponent'
import {
  applyProfileCuration,
  type ProfileCurationRow,
  type ProfileCurationSection,
} from './profileCurationState'
import { getProfileBangers, getProfileBangersPage } from './metaTwitter/bangers'
import type { ProfileBangersPageOptions } from './metaTwitter/bangers'
import type {
  ArchivePerson,
  ArchiveTweet,
  BangerTweet,
} from './metaTwitter/types'

const accountPattern = /^\d{1,20}$/

function archiveTweet(tweet: NonNullable<TweetData['quoted_tweet']>) {
  const converted: ArchiveTweet = {
    tweet_id: tweet.tweet_id,
    account_id: tweet.account_id,
    created_at: tweet.created_at,
    full_text: tweet.full_text,
    favorite_count: tweet.favorite_count,
    retweet_count: tweet.retweet_count,
    reply_to_username: null,
    username: tweet.username,
    account_display_name: tweet.account_display_name,
    avatar_media_url: tweet.avatar_media_url ?? null,
    media: (tweet.media ?? []).map((item) => ({
      media_url: item.media_url,
      media_type: item.media_type,
      width: item.width ?? 0,
      height: item.height ?? 0,
    })),
  }
  return converted
}

export function manuallyCuratedBanger(tweet: TweetData): BangerTweet {
  return {
    tweet_id: tweet.tweet_id,
    account_id: tweet.account_id,
    created_at: tweet.created_at,
    full_text: tweet.full_text,
    favorite_count: tweet.favorite_count,
    retweet_count: tweet.retweet_count,
    reply_to_username: tweet.reply_to_username ?? null,
    username: tweet.username,
    account_display_name: tweet.account_display_name,
    avatar_media_url: tweet.avatar_media_url,
    media: tweet.media.map((item) => ({
      media_url: item.media_url,
      media_type: item.media_type,
      width: item.width ?? 0,
      height: item.height ?? 0,
    })),
    quote_count: 0,
    quoting_accounts: 0,
    quote_tweet_id: tweet.quote_tweet_id,
    quoted_tweet:
      tweet.quoted_tweet && !tweet.quoted_tweet.is_deleted
        ? archiveTweet(tweet.quoted_tweet)
        : null,
  }
}

async function getManuallyCuratedBangers(
  accountId: string,
  rows: ProfileCurationRow[],
  generated: BangerTweet[],
) {
  const generatedIds = new Set(generated.map((tweet) => tweet.tweet_id))
  const itemIds = rows
    .filter((row) => !row.is_hidden && !generatedIds.has(row.item_id))
    .map((row) => row.item_id)

  const tweets = await Promise.all(
    itemIds.map(async (itemId) => {
      try {
        return await fetchClickHouseTweetPageData(itemId)
      } catch (error) {
        devLog('manually curated profile tweet unavailable', {
          accountId,
          itemId,
          error,
        })
        return null
      }
    }),
  )

  return tweets
    .filter(
      (tweet): tweet is TweetData =>
        tweet !== null && tweet.account_id === accountId,
    )
    .map(manuallyCuratedBanger)
}

export async function getPublicProfileSettings(accountId: string) {
  if (!accountPattern.test(accountId)) {
    return { downloadArchiveVisible: true }
  }

  try {
    const supabase = createServerServiceRoleClient()
    const { data, error } = await supabase
      .from('profile_settings')
      .select('download_archive_visible')
      .eq('account_id', accountId)
      .maybeSingle()

    if (error) throw error
    return {
      downloadArchiveVisible: data?.download_archive_visible !== false,
    }
  } catch (error) {
    devLog('profile settings unavailable', { accountId, error })
    return { downloadArchiveVisible: true }
  }
}

export async function getProfileCurationRows(
  accountId: string,
  section: ProfileCurationSection,
): Promise<ProfileCurationRow[]> {
  if (!accountPattern.test(accountId)) return []

  try {
    const supabase = createServerServiceRoleClient()
    const { data, error } = await supabase
      .from('profile_curation')
      .select('item_id, is_hidden, is_featured, position')
      .eq('account_id', accountId)
      .eq('section', section)

    if (error) throw error
    return data ?? []
  } catch (error) {
    devLog('profile curation unavailable', { accountId, section, error })
    return []
  }
}

export async function getCuratedProfileBangersPage(
  accountId: string,
  options: ProfileBangersPageOptions,
) {
  if (options.year !== undefined) {
    return getProfileBangersPage(accountId, options)
  }
  const [page, rows] = await Promise.all([
    getProfileBangersPage(accountId, options),
    getProfileCurationRows(accountId, 'bangers'),
  ])
  if (!page.available || rows.length === 0) return page

  // A featured or manually positioned item may originate beyond the requested
  // ClickHouse page. Use the cached generated collection whenever overrides
  // exist so persistent edits remain globally stable across pagination.
  const collection = await getProfileBangers(accountId)
  if (!collection.available) {
    return {
      ...page,
      tweets: applyProfileCuration(
        page.tweets,
        rows,
        (tweet) => tweet.tweet_id,
      ),
    }
  }

  const manual = await getManuallyCuratedBangers(
    accountId,
    rows,
    collection.tweets,
  )
  const sort = options.sort ?? 'quotes'
  const generated = [...collection.tweets, ...manual].sort((left, right) => {
    if (sort === 'likes') {
      return (
        right.favorite_count - left.favorite_count ||
        right.quote_count - left.quote_count ||
        right.tweet_id.localeCompare(left.tweet_id)
      )
    }
    if (sort === 'newest') {
      return (
        new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime() ||
        right.tweet_id.localeCompare(left.tweet_id)
      )
    }
    return (
      right.quote_count - left.quote_count ||
      right.quoting_accounts - left.quoting_accounts ||
      right.favorite_count - left.favorite_count ||
      right.tweet_id.localeCompare(left.tweet_id)
    )
  })
  const curated = applyProfileCuration(
    generated,
    rows,
    (tweet) => tweet.tweet_id,
  )
  const offset = options.offset ?? 0
  const tweets = curated.slice(offset, offset + options.limit)
  const nextOffset =
    offset + tweets.length < curated.length ? offset + tweets.length : null
  return {
    ...page,
    tweets,
    yearCounts: collection.yearCounts,
    total: curated.length,
    nextOffset,
  }
}

export async function applyPeopleCuration(
  accountId: string,
  year: number | undefined,
  people: ArchivePerson[],
) {
  if (year !== undefined) return people
  const rows = await getProfileCurationRows(accountId, 'people')
  return applyProfileCuration(people, rows, (person) => person.user_id)
}
