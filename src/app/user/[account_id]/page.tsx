import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import TopMentionedUsers from '@/components/TopMentionedMissingUsers'
import AccountTopTweets from './AccountTopTweets'
import { createServerClient } from '@/utils/supabase'
import { FormattedUser } from '@/lib-client/user-utils'
import { devLog } from '@/lib-client/devLog'
import { cookies } from 'next/headers'
import { getUserData } from '@/lib-server/user'

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
          <p>{new Intl.NumberFormat().format(account.num_tweets)} Tweets</p>
          <p>
            {new Intl.NumberFormat().format(account.num_followers)} Followers
          </p>
          <p>
            {new Intl.NumberFormat().format(account.num_following)} Following
          </p>
          <p>{new Intl.NumberFormat().format(account.num_likes)} Likes</p>
        </div>
      </div>
    </div>
  )
}

export default async function User({ params }: any) {
  const { account_id } = params
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)

  const userData = await getUserData(account_id)

  const { data: summaryData, error: summaryError } = await supabase
    .from('account_activity_summary')
    .select('mentioned_accounts')
    .eq('account_id', account_id)
    .single()

  if (
    !userData ||
    summaryError ||
    !summaryData ||
    !summaryData.mentioned_accounts
  ) {
    return <div>Error fetching user data</div>
  }

  devLog('userData', userData)
  devLog('summary data', summaryData)

  return (
    <div
      id="user-page"
      className="relative mx-auto w-full max-w-3xl bg-white p-8 dark:bg-gray-800"
    >
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <UserProfile userData={userData} />
      </Suspense>

      <h2 className="text-xl font-semibold">{'Most Mentioned Accounts'}</h2>
      <Suspense fallback={<Skeleton className="h-[20vh] w-full" />}>
        <TopMentionedUsers
          users={summaryData.mentioned_accounts as MentionedUser[]}
          height="h-[20vh]" // Add this line
        />
      </Suspense>

      <div className="my-16">
        <h2 className="text-xl font-semibold">{'Top Tweets'}</h2>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <AccountTopTweets userData={userData} />
        </Suspense>
      </div>
    </div>
  )
}
