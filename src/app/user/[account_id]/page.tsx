import './user.css'
import { getUserData, getFirstTweets, getTopTweets } from '@/lib-server/user'
import Tweet from '@/components/Tweet'
import SearchTweets from '@/components/SearchTweets'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import TopMentionedUsers from '@/components/TopMentionedMissingUsers'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { devLog } from '@/lib-client/devLog'

export default async function User({ params, searchParams }: any) {
  const { account_id } = params
  const userData = await getUserData(account_id)
  if (!userData) {
    return <h1>Not found</h1>
  }

  const account = userData
  const firstTweets = await getFirstTweets(account.account_id)
  const topTweets = await getTopTweets(account.account_id)

  const mostMentionedAccounts = await getAccountMostMentionedAccounts(
    account.username,
  )

  return (
    <div
      id="user-page"
      className="relative mx-auto w-full max-w-3xl bg-white p-24 dark:bg-gray-800"
    >
      {/* User Profile Section */}
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
      <h2 className="mb-4 text-xl font-semibold">
        {'Most Mentioned Accounts'}
      </h2>
      <p>{`Top accounts mentioned by @${account.username}`}</p>
      <div className="h-[25vh] overflow-y-auto">
        <TopMentionedUsers users={mostMentionedAccounts} />
      </div>
      <div className="h-screen overflow-y-auto">
        <SearchTweets
          supabase={null}
          displayText={`Search ${account.username}'s archive`}
          account_id={account.account_id}
        />
      </div>
      <hr style={{ marginBottom: '50px' }} />
    </div>
  )
}

type MentionedUser = {
  mentioned_user_id: string
  mentioned_username: string
  mention_count: number
}
async function getAccountMostMentionedAccounts(
  username: string,
): Promise<MentionedUser[]> {
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)

  const { data: users, error } = await supabase.rpc(
    'get_account_most_mentioned_accounts',
    { username_: username, limit_: 10 },
  )

  if (error) {
    console.error('Error fetching most mentioned accounts:', error)
    return []
  }

  const mentionedUsers = await Promise.all(
    users
      .filter((user: any) => user.screen_name !== username)
      .map(async (user: any) => {
        const { data: profile } = await supabase
          .from('profile')
          .select('*')
          .eq('account_id', user.user_id)
          .order('archive_upload_id', { ascending: false })
          .limit(1)
          .single()

        const { data: account } = await supabase
          .from('account')
          .select('*')
          .eq('account_id', user.user_id)
          .single()

        return {
          mentioned_user_id: user.user_id,
          screen_name: user.screen_name,
          mention_count: user.mention_count,
          account_display_name: user.name,
          avatar_media_url: profile?.avatar_media_url,
          uploaded: !!account,
        }
      }),
  )
  devLog('mentionedUsers', mentionedUsers)
  return mentionedUsers
}
