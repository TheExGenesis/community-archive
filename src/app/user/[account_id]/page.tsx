import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
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
import { createBrowserClient } from '@/utils/supabase'

// Style constants (glows removed)
const unifiedDeepBlueBase = "bg-white dark:bg-background"
const sectionPaddingClasses = "py-12 md:py-16 lg:py-20"
const contentWrapperClasses = "w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"

const UserProfile = ({ userData }: { userData: FormattedUser }) => {
  const account = userData
  return (
    // Profile info card - Removed shadow
    <div className="bg-slate-100 dark:bg-card p-6 sm:p-8 rounded-lg mb-8">
      <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
        <Avatar className="h-24 w-24 sm:h-28 sm:w-28 ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-slate-800">
          <AvatarImage
            src={account.avatar_media_url || '/placeholder.jpg'}
            alt={`${account.account_display_name}'s avatar`}
          />
          <AvatarFallback className="text-3xl">
            {account.account_display_name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="text-center sm:text-left flex-grow">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">{account.account_display_name}</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">@{account.username}</p>
          {account.bio && <p className="mt-3 text-gray-700 dark:text-gray-300 text-sm sm:text-base">{account.bio}</p>}
          <div className="mt-3 space-y-1 text-sm text-gray-500 dark:text-gray-400">
            {account.location && (
              <p>📍 {account.location}</p>
            )}
            <p>📅 Joined: {new Date(account.created_at).toLocaleDateString()}</p>
            {account.archive_at && (
              <p>🗄️ Archived: {new Date(account.archive_at).toLocaleDateString()}</p>
            )}
          </div>
        </div>
      </div>
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 flex flex-wrap justify-center sm:justify-start gap-x-6 gap-y-3 text-sm text-gray-700 dark:text-gray-300">
        <p><strong className="font-semibold text-gray-800 dark:text-white">{formatNumber(account.num_tweets)}</strong> Tweets</p>
        <p><strong className="font-semibold text-gray-800 dark:text-white">{formatNumber(account.num_followers)}</strong> Followers</p>
        <p><strong className="font-semibold text-gray-800 dark:text-white">{formatNumber(account.num_following)}</strong> Following</p>
        <p><strong className="font-semibold text-gray-800 dark:text-white">{formatNumber(account.num_likes)}</strong> Likes</p>
      </div>
      <div className="mt-6 text-center sm:text-left">
        <DownloadArchiveButton username={account.username} />
      </div>
    </div>
  )
}

export default async function User({ params }: any) {
  const { account_id } = params;
  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);

  const userData = await getUserData(supabase, account_id);

  if (!userData) {
    // Styled error message for consistency - Removed glow and shadow
    return (
      <section 
        className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} flex-grow flex items-center justify-center overflow-hidden`}
      >
        <div className={`${contentWrapperClasses} text-center`}>
            {/* Error card - Removed shadow */}
            <div className="bg-slate-100 dark:bg-card p-8 rounded-lg">
                <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">Error Fetching User Data</h1>
                <p className="mt-2 text-gray-600 dark:text-gray-300">Could not retrieve information for this user. Please try again later.</p>
            </div>
        </div>
      </section>
    );
  }

  const { data: summaryData, error: summaryError } = await supabase
    .from('account_activity_summary')
    .select('mentioned_accounts')
    .or(`account_id.eq.${account_id},username.ilike.${account_id}`)
    .single();

  const showingSummaryData = !summaryError && summaryData?.mentioned_accounts;

  return (
    <section 
      className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} flex-grow overflow-hidden`}
    >
      <div className={`${contentWrapperClasses} space-y-8`}>
        {/* Banner Image - Removed shadow */}
        {userData?.header_media_url && (
          <div className="relative w-full h-48 md:h-64 rounded-xl overflow-hidden mb-8">
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
        <Suspense fallback={<Skeleton className="bg-slate-100 dark:bg-card p-8 rounded-lg h-60 w-full" />}>
          <UserProfile userData={userData} />
        </Suspense>

        {showingSummaryData ? (
          <>
            {/* Most Mentioned Accounts card - Removed shadow */}
            <div className="bg-slate-100 dark:bg-card p-6 sm:p-8 rounded-lg">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Most Mentioned Accounts</h2>
              <Suspense fallback={<Skeleton className="h-[20vh] w-full bg-slate-200 dark:bg-slate-700 rounded" />}>
                <TopMentionedUsers
                  users={summaryData.mentioned_accounts as MentionedUser[]}
                  height="h-[20vh]"
                />
              </Suspense>
            </div>

            {/* Top Tweets card - Removed shadow */}
            <div className="bg-slate-100 dark:bg-card p-6 sm:p-8 rounded-lg">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Top Tweets</h2>
              <Suspense fallback={<Skeleton className="h-96 w-full bg-slate-200 dark:bg-slate-700 rounded" />}>
                <AccountTopTweets userData={userData} />
              </Suspense>
            </div>
          </>
        ) : (
          <div className="bg-slate-100 dark:bg-card p-8 rounded-lg text-center">
            {/* Activity summary placeholder card - Removed shadow */}
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
              Activity summary not yet available.
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Detailed activity data like top tweets and mentions is currently
              being processed or is not available for this user. Basic profile
              information is still shown above.
            </p>
          </div>
        )}

        {/* New Section for User's Recent Tweets - MOVED BELOW ACTIVITY SUMMARY */}
        <div className="bg-slate-100 dark:bg-card p-6 sm:p-8 rounded-lg">
          <h2 className="text-2xl font-semibold mb-6 text-gray-900 dark:text-white">Recent Tweets</h2>
          <TweetList 
            filterCriteria={{ userId: account_id } satisfies FilterCriteria}
            itemsPerPage={20} // Example: can be adjusted or made a prop
          />
        </div>

      </div>
    </section>
  )
}
