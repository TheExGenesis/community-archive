import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import TopMentionedUsers, {
  MentionedUser,
} from '@/components/TopMentionedMissingUsers'
import AccountTopTweets from './AccountTopTweets'
import { createServerClient } from '@/utils/supabase'
import { FormattedUser } from '@/lib/types'
import { cookies } from 'next/headers'
import { getUserData } from '@/lib/queries/fetchUsers'
import { formatNumber } from '@/lib/formatNumber'
import { DownloadArchiveButton } from './DownloadArchiveButton'
import Image from 'next/image'
import TweetList from '@/components/TweetList'
import { FilterCriteria } from '@/lib/queries/tweetQueries'
import { Archive, Radio } from 'lucide-react'

// Style constants (glows removed)
const unifiedDeepBlueBase = 'bg-white dark:bg-background'
const sectionPaddingClasses = 'py-12 md:py-16 lg:py-20'
const contentWrapperClasses =
  'w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10'

const UserProfile = ({ userData }: { userData: FormattedUser }) => {
  const account = userData
  return (
    // Profile info card - Removed shadow
    <div className="mb-8 rounded-lg bg-slate-100 p-6 dark:bg-card sm:p-8">
      <div className="flex flex-col items-center space-y-4 sm:flex-row sm:items-start sm:space-x-6 sm:space-y-0">
        <Avatar className="h-24 w-24 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800 sm:h-28 sm:w-28">
          <AvatarImage
            src={account.avatar_media_url || '/placeholder.jpg'}
            alt={`${account.account_display_name}'s avatar`}
          />
          <AvatarFallback className="text-3xl">
            {account.account_display_name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-grow text-center sm:text-left">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
            {account.account_display_name}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            @{account.username}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            {account.has_archive && (
              <Badge variant="outline" className="gap-1.5">
                <Archive aria-hidden="true" className="h-3.5 w-3.5" />
                Archive contributor
              </Badge>
            )}
            {account.is_opted_in && (
              <Badge variant="outline" className="gap-1.5">
                <Radio aria-hidden="true" className="h-3.5 w-3.5" />
                Opted in
              </Badge>
            )}
          </div>
          {account.bio && (
            <p className="mt-3 text-sm text-gray-700 dark:text-gray-300 sm:text-base">
              {account.bio}
            </p>
          )}
          <div className="mt-3 space-y-1 text-sm text-gray-500 dark:text-gray-400">
            {account.location && <p>📍 {account.location}</p>}
            {account.created_at && (
              <p>
                📅 Joined Twitter:{' '}
                {new Date(account.created_at).toLocaleDateString()}
              </p>
            )}
            {account.joined_at && (
              <p>
                🤝 Community member since:{' '}
                {new Date(account.joined_at).toLocaleDateString()}
              </p>
            )}
            {account.archive_at && (
              <p>
                🗄️ Archived: {new Date(account.archive_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-3 border-t border-gray-200 pt-6 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300 sm:justify-start">
        <p>
          <strong className="font-semibold text-gray-800 dark:text-white">
            {formatNumber(account.num_tweets)}
          </strong>{' '}
          Tweets
        </p>
        <p>
          <strong className="font-semibold text-gray-800 dark:text-white">
            {formatNumber(account.num_followers)}
          </strong>{' '}
          Followers
        </p>
        <p>
          <strong className="font-semibold text-gray-800 dark:text-white">
            {formatNumber(account.num_following)}
          </strong>{' '}
          Following
        </p>
        <p>
          <strong className="font-semibold text-gray-800 dark:text-white">
            {formatNumber(account.num_likes)}
          </strong>{' '}
          Likes
        </p>
      </div>
      {account.has_archive && (
        <div className="mt-6 text-center sm:text-left">
          <DownloadArchiveButton username={account.username} />
        </div>
      )}
    </div>
  )
}

export default async function User({
  params,
}: {
  params: { account_id: string }
}) {
  const { account_id } = params
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)

  const userData = await getUserData(supabase, account_id)

  if (!userData) {
    // Styled error message for consistency - Removed glow and shadow
    return (
      <section
        className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} flex flex-grow items-center justify-center overflow-hidden`}
      >
        <div className={`${contentWrapperClasses} text-center`}>
          {/* Error card - Removed shadow */}
          <div className="rounded-lg bg-slate-100 p-8 dark:bg-card">
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">
              Error Fetching User Data
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Could not retrieve information for this user. Please try again
              later.
            </p>
          </div>
        </div>
      </section>
    )
  }

  let summaryQuery = supabase
    .from('account_activity_summary')
    .select('mentioned_accounts')

  summaryQuery = userData.account_id
    ? summaryQuery.eq('account_id', userData.account_id)
    : summaryQuery.eq('username', userData.username)

  const { data: summaryData, error: summaryError } =
    await summaryQuery.maybeSingle()

  const showingSummaryData = !summaryError && summaryData?.mentioned_accounts

  return (
    <section
      className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} flex-grow overflow-hidden`}
    >
      <div className={`${contentWrapperClasses} space-y-8`}>
        {/* Banner Image - Removed shadow */}
        {userData?.header_media_url && (
          <div className="relative mb-8 h-48 w-full overflow-hidden rounded-xl md:h-64">
            <Image
              src={userData.header_media_url}
              alt={`${userData.account_display_name}'s cover photo`}
              layout="fill"
              objectFit="cover"
              priority
            />
          </div>
        )}

        {/* UserProfile Suspense - Removed shadow from Skeleton */}
        <Suspense
          fallback={
            <Skeleton className="h-60 w-full rounded-lg bg-slate-100 p-8 dark:bg-card" />
          }
        >
          <UserProfile userData={userData} />
        </Suspense>

        {showingSummaryData ? (
          <>
            {/* Most Mentioned Accounts card - Removed shadow */}
            <div className="rounded-lg bg-slate-100 p-6 dark:bg-card sm:p-8">
              <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">
                Most Mentioned Accounts
              </h2>
              <Suspense
                fallback={
                  <Skeleton className="h-[20vh] w-full rounded bg-slate-200 dark:bg-slate-700" />
                }
              >
                <TopMentionedUsers
                  users={summaryData.mentioned_accounts as MentionedUser[]}
                  height="h-[20vh]"
                />
              </Suspense>
            </div>

            {/* Top Tweets card - Removed shadow */}
            <div className="rounded-lg bg-slate-100 p-6 dark:bg-card sm:p-8">
              <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">
                Top Tweets
              </h2>
              <Suspense
                fallback={
                  <Skeleton className="h-96 w-full rounded bg-slate-200 dark:bg-slate-700" />
                }
              >
                <AccountTopTweets userData={userData} />
              </Suspense>
            </div>
          </>
        ) : (
          <div className="rounded-lg bg-slate-100 p-8 text-center dark:bg-card">
            {/* Activity summary placeholder card - Removed shadow */}
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
              {userData.account_id
                ? 'Activity summary not yet available.'
                : 'Activity is not linked yet.'}
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {userData.account_id
                ? 'Detailed activity data like top tweets and mentions is currently being processed or is not available for this user. Basic profile information is still shown above.'
                : 'This member has opted in, but their Twitter account ID has not been connected to archived or streamed activity yet.'}
            </p>
          </div>
        )}

        {userData.account_id && (
          <div className="rounded-lg bg-slate-100 p-6 dark:bg-card sm:p-8">
            <h2 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
              Recent Tweets
            </h2>
            <TweetList
              filterCriteria={
                { userId: userData.account_id } satisfies FilterCriteria
              }
              itemsPerPage={20}
            />
          </div>
        )}
      </div>
    </section>
  )
}
