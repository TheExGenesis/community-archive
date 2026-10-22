import 'server-only'
import { unstable_cache } from 'next/cache'
import {
  curatedSectionIds,
  supplementalSectionIds,
} from './metaTwitter/sectionConfig'

import { createServerServiceRoleClient } from '@/utils/supabase'
import { devLog } from '@/lib/devLog'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import type { TweetData } from '@/lib/tweets/types'
import {
  applyProfileCuration,
  type ProfileCurationRow,
  type ProfileCurationSection,
} from './profileCurationState'
import { getProfileBangers, getProfileBangersPage } from './metaTwitter/bangers'
import { measureServerRead } from '@/lib/performance/server'
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

const getSectionTweets = unstable_cache(
  async (accountId: string, year: number, ids: string[]) => {
    const result: BangerTweet[] = []
    // Keep gateway fan-out bounded. Do not turn gateway errors into cached empties.
    for (let index = 0; index < ids.length; index += 4) {
      const batch = await Promise.all(
        ids
          .slice(index, index + 4)
          .map((id) => fetchClickHouseTweetPageData(id)),
      )
      for (const tweet of batch) {
        if (
          tweet &&
          tweet.account_id === accountId &&
          new Date(tweet.created_at).getUTCFullYear() === year
        )
          result.push(manuallyCuratedBanger(tweet))
      }
    }
    return result
  },
  ['profile-section-tweets-v1'],
  { revalidate: 300 },
)

const getMeasuredProfileBangers = (accountId: string) =>
  measureServerRead('profile.bangers-collection', () =>
    getProfileBangers(accountId),
  )

/** Include configured representatives even when they are outside the banger set. */
async function getSectionedProfilePage(
  accountId: string,
  options: ProfileBangersPageOptions,
) {
  const supplemental = supplementalSectionIds(accountId)
  const curated = curatedSectionIds(accountId)
  // Curated IDs aren't counted until their year is hydrated: most are
  // bangers already, so adding them below would inflate the chapter counts.
  const wanted = new Set(
    options.year === undefined
      ? []
      : [
          ...(supplemental[options.year] ?? []),
          ...(curated[options.year] ?? []),
        ],
  )
  // A combined chapter needs the full collection below; both reads are
  // independent gateway queries, so the collection starts alongside the page.
  const year = options.year
  const collectionRead =
    year !== undefined && wanted.size
      ? getMeasuredProfileBangers(accountId)
      : null
  // An early return below leaves it unawaited; its failure must not surface
  // as an unhandled rejection.
  collectionRead?.catch(() => undefined)
  // A combined chapter pages itself below. Its later offsets run past the
  // banger pool, which the gateway reports as an invalid page, so only the
  // first page is asked for its counts.
  const page = await measureServerRead('profile.bangers-page', () =>
    getProfileBangersPage(
      accountId,
      wanted.size ? { ...options, offset: 0 } : options,
    ),
  )
  if (
    !page.available ||
    (!Object.keys(supplemental).length && !Object.keys(curated).length)
  )
    return page
  const counts = new Map(page.yearCounts.map((row) => [row.year, row.count]))
  for (const [year, ids] of Object.entries(supplemental))
    counts.set(Number(year), (counts.get(Number(year)) ?? 0) + ids.length)
  const yearCounts = Array.from(counts, ([year, count]) => ({
    year,
    count,
  })).sort((a, b) => b.year - a.year)
  if (year === undefined || !collectionRead) return { ...page, yearCounts }
  const collection = await collectionRead
  if (!collection.available) return { ...page, available: false }
  const known = new Set(collection.tweets.map((tweet) => tweet.tweet_id))
  try {
    const ids = Array.from(wanted).filter((id) => !known.has(id))
    const extra = await measureServerRead('profile.section-tweets', () =>
      getSectionTweets(accountId, year, ids),
    )
    const tweets = [
      ...collection.tweets.filter(
        (tweet) => new Date(tweet.created_at).getUTCFullYear() === year,
      ),
      ...extra,
    ]
    tweets.sort(
      (a, b) =>
        (options.sort === 'likes'
          ? b.favorite_count - a.favorite_count
          : options.sort === 'newest'
            ? Date.parse(b.created_at) - Date.parse(a.created_at)
            : b.quote_count - a.quote_count) ||
        b.tweet_id.localeCompare(a.tweet_id),
    )
    const offset = options.offset ?? 0
    const accurateYearCounts = yearCounts.map((row) =>
      row.year === options.year ? { ...row, count: tweets.length } : row,
    )
    return {
      ...page,
      yearCounts: accurateYearCounts,
      tweets: tweets.slice(offset, offset + options.limit),
      total: tweets.length,
      nextOffset:
        offset + options.limit < tweets.length ? offset + options.limit : null,
    }
  } catch (error) {
    devLog('profile section tweets unavailable', { accountId, error })
    return { ...page, available: false, tweets: [], nextOffset: null }
  }
}

export async function getCuratedProfileBangersPage(
  accountId: string,
  options: ProfileBangersPageOptions,
) {
  if (options.year !== undefined) {
    return getSectionedProfilePage(accountId, options)
  }
  const rowsRead = measureServerRead('profile.curation-rows', () =>
    getProfileCurationRows(accountId, 'bangers'),
  )
  // A featured or manually positioned item may originate beyond the requested
  // ClickHouse page. Use the cached generated collection whenever overrides
  // exist so persistent edits remain globally stable across pagination. The
  // rows answer long before the page, so the collection overlaps it.
  const collectionRead = rowsRead.then((rows) =>
    rows.length ? getMeasuredProfileBangers(accountId) : null,
  )
  collectionRead.catch(() => undefined)
  const [page, rows] = await Promise.all([
    getSectionedProfilePage(accountId, options),
    rowsRead,
  ])
  if (!page.available || rows.length === 0) return page

  const collection = await collectionRead
  if (!collection?.available) {
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
    yearCounts: page.yearCounts,
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
