import CommunityStats from '@/components/CommunityStats'
import SearchTweets from '@/components/SearchTweets'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import AvatarList from '@/components/AvatarList'
import { SupabaseClient } from '@supabase/supabase-js'
import { FaGithub, FaDiscord } from 'react-icons/fa' // Add this import
import { getTweetsCount } from '@/lib-server/db_queries'
import UploadTwitterArchive from '@/components/UploadTwitterArchive'
import SignIn from '@/components/SignIn'

declare global {
  interface Window {
    supabase: any
  }
}
// personal content

const getMostFollowedAccounts = async (supabase: SupabaseClient) => {
  let { data, error } = await supabase.rpc('get_top_accounts_with_followers', {
    limit_count: 7,
  })
  if (error) console.error(error)
  // else console.log(data)

  const account_ids = data.map((account: any) => account.account_id)
  const tweetsCounts = await Promise.all(
    account_ids.map(async (account_id: string) => {
      const result = await getTweetsCount(supabase, account_id)
      return {
        account_id,
        count: result.count,
      }
    }),
  )
  data.forEach((account: any, index: number) => {
    account.num_tweets = tweetsCounts[index].count
  })
  console.log(data)
  return data
}

export default async function UploadArchivePage() {
  const supabase = createServerClient(cookies())
  const mostFollowed = await getMostFollowedAccounts(supabase)

  return (
    <div className="flex min-h-screen justify-center bg-gray-100">
      {/* Main content */}
      <div className="relative w-full max-w-4xl bg-white p-24">
        <div className="absolute right-4 top-4  text-gray-500">
          <SignIn />
        </div>
        <h1 className="mb-0 text-5xl font-bold text-zinc-400 md:text-5xl">
          Upload to the
        </h1>
        <h1 className="mt-0 text-5xl font-bold md:text-5xl">
          Community Archive!
        </h1>
        <br />
        <h2 className="mb-4 text-2xl text-zinc-600">
          {`An open database and API anyone can build on.`}
        </h2>
        <br />
        <h3 className="mb-4 text-xl">Featuring archives uploaded by:</h3>
        {mostFollowed ? (
          <AvatarList
            initialAvatars={mostFollowed}
            title="Uploaded people you may know:"
          />
        ) : (
          <p className="text-sm text-red-500">
            Failed to load most followed accounts.
          </p>
        )}
        <br />
        <CommunityStats />
        <br />
        <div>
          <p className="mb-4 text-xl leading-relaxed">
            {`Powered by your tweet history, the community archive lets anyone build things like:`}
          </p>
          <ul className="mb-4 list-disc space-y-2 pl-16 text-xl">
            <li>🔎 Search that really knows what you mean;</li>
            <li>✨ AI apps with context on you and your friends;</li>
            <li>📚 Make artifacts like books based on your tweets;</li>
            <li>And more!</li>
          </ul>
          <br />

          <p className="text-xl">
            {`If you don't have an archive yet, `}
            <strong>
              <a
                href="https://x.com/settings/download_your_data"
                className="text-blue-500 hover:underline"
              >
                request it here
              </a>
            </strong>
            {` now!`}
          </p>
        </div>
        <br />
        <p className="text-xl">
          {`If you do...`} <SignIn />
        </p>
        <UploadTwitterArchive />
        <br />

        <div className="mb-4">
          Useful links:
          <ul className="mb-4 list-disc pl-6 text-xl">
            <li>
              {`We're an open database and API anyone can build on. Want to know more? `}
              <a
                href="https://substack.com/@xiqo/p-148517224"
                className="text-blue-500 hover:underline"
              >
                {`Here's our FAQ`}
              </a>
            </li>
            <li>
              Worried about privacy? Here is{' '}
              <a href="/data-policy" className="text-blue-500 hover:underline">
                our data policy
              </a>{' '}
              and{' '}
              <a href="/remove-dms" className="text-blue-500 hover:underline">
                how to remove DMs from the archive
              </a>
            </li>
            <li>
              Want to build on the project? Check out our{' '}
              <a
                href="https://github.com/TheExGenesis/community-archive"
                className="mr-2 inline-flex items-center text-blue-500 hover:underline"
              >
                <FaGithub className="mr-1" /> GitHub repo
              </a>{' '}
              and{' '}
              <a
                href="https://discord.gg/AStSQj6ugq"
                className="inline-flex items-center text-blue-500 hover:underline"
              >
                <FaDiscord className="mr-1" /> Discord
              </a>
            </li>
            {/* TODO: donate links */}
          </ul>
          <br />
          <br />
        </div>
        <div className="mb-4"></div>
        <br />
        <div className="flex flex-grow flex-col">
          <div
            className="flex-grow overflow-hidden"
            style={{ height: '48rem' }}
          >
            <h2 className="mb-4 text-2xl font-bold">Search the Archive</h2>
            <SearchTweets />
          </div>
        </div>
      </div>
    </div>
  )
}
