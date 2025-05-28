import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import TopMentionedUsers, {
  MentionedUser,
} from '@/components/TopMentionedMissingUsers'
import AccountTopTweets from './AccountTopTweets'
import { createServerClient } from '@/utils/supabase'
import { FormattedUser } from '@/lib/types'
import { devLog } from '@/lib/devLog'
import { cookies } from 'next/headers'
import { getUserData } from '@/lib/queries/fetchUsers'
import { formatNumber } from '@/lib/formatNumber'
import { DownloadArchiveButton } from './DownloadArchiveButton'

const UserProfile = ({ userData }: { userData: FormattedUser }) => {
  const account = userData
  return (
    <div className="mb-8 flex items-center space-x-4">
      <Avatar className="h-24 w-24">
        <AvatarImage
          src={account.avatar_media_url || '/placeholder.jpg'}
          alt={`${account.account_display_name}'s avatar`}
        />
        <AvatarFallback>
          {account.account_display_name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div>
        <h1 className="text-2xl font-bold">{account.account_display_name}</h1>
        <p className="text-gray-600">@{account.username}</p>
        {account.bio && <p className="mt-2">{account.bio}</p>}
        {account.location && (
          <p className="text-gray-600">{account.location}</p>
        )}
        <p className="text-sm text-gray-500">
          Joined: {new Date(account.created_at).toLocaleDateString()}
        </p>
        {account.archive_at && (
          <p className="text-sm text-gray-500">
            Archived: {new Date(account.archive_at).toLocaleDateString()}
          </p>
        )}
        <div className="mt-4 flex space-x-4 text-sm text-gray-600">
          <p>{formatNumber(account.num_tweets)} Tweets</p>
          <p>{formatNumber(account.num_followers)} Followers</p>
          <p>{formatNumber(account.num_following)} Following</p>
          <p>{formatNumber(account.num_likes)} Likes</p>
        </div>
        <DownloadArchiveButton username={account.username} />
      </div>
    </div>
  )
}

export default async function User({ params }: any) {
  const { account_id } = params
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)

  const userData = await getUserData(supabase, account_id)

  if (!userData) {
    return <div>Error fetching user data</div>
  }

  const { data: summaryData, error: summaryError } = await supabase
    .from('account_activity_summary')
    .select('mentioned_accounts')
    .or(`account_id.eq.${account_id},username.ilike.${account_id}`)
    .single()

  const showingSummaryData = !summaryError && summaryData?.mentioned_accounts

  return (
    <div
      id="user-page"
      className="relative mx-auto w-full max-w-3xl bg-white p-8 dark:bg-gray-800"
    >
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <UserProfile userData={userData} />
      </Suspense>

      {showingSummaryData ? (
        <>
          <h2 className="text-xl font-semibold">{'Most Mentioned Accounts'}</h2>
          <Suspense fallback={<Skeleton className="h-[20vh] w-full" />}>
            <TopMentionedUsers
              users={summaryData.mentioned_accounts as MentionedUser[]}
              height="h-[20vh]"
            />
          </Suspense>

          <div className="my-16">
            <h2 className="text-xl font-semibold">{'Top Tweets'}</h2>
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <AccountTopTweets userData={userData} />
            </Suspense>
          </div>
        </>
      ) : (
        <div className="my-16 rounded-md border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-700/30">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            Activity summary not yet available.
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Detailed activity data like top tweets and mentions is currently
            being processed or is not available for this user. Basic profile
            information is still shown above.
          </p>
        </div>
      )}
    </div>
  )
}
