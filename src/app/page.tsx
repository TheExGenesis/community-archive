export const revalidate = 0

import CommunityStats from '@/components/CommunityStats'
import SearchTweets from '@/components/SearchTweets'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import AvatarList from '@/components/AvatarList'
import { SupabaseClient } from '@supabase/supabase-js'
import { FaGithub, FaDiscord } from 'react-icons/fa'
import { getTweetsCount } from '@/lib-server/db_queries'
import UploadTwitterArchive from '@/components/UploadTwitterArchive'
import dynamic from 'next/dynamic'
import Link from 'next/link'

import ThemeToggle from '@/components/ThemeToggle'
import { devLog } from '@/lib-client/devLog'
// Dynamically import SignIn component with ssr disabled
const DynamicSignIn = dynamic(() => import('@/components/SignIn'), {
  ssr: false,
})

declare global {
  interface Window {
    supabase: any
  }
}

const getMostFollowedAccounts = async (supabase: SupabaseClient) => {
  let data, error
  const maxRetries = 3
  let retries = 0

  while (retries < maxRetries) {
    ;({ data, error } = await supabase
      .schema('public')
      .rpc('get_top_accounts_with_followers', {
        limit_count: 8,
      }))

    if (!error) break

    console.error(`Attempt ${retries + 1} failed:`, error)
    retries++

    if (retries < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * retries)) // Exponential backoff
    }
  }

  if (error) {
    console.error('All attempts failed:', error)
    // Handle the error appropriately, maybe set data to a default value
    data = []
  }
  return data
}

export default async function Homepage() {
  const supabase = createServerClient(cookies())
  const mostFollowed = await getMostFollowedAccounts(supabase)
  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col bg-white px-4 dark:bg-gray-800 sm:px-6 lg:px-24">
      {/* Main content */}
      <div className="mt-8 bg-white dark:bg-gray-800">
        {' '}
        <h1 className="mb-0 text-4xl font-bold text-zinc-400 dark:text-zinc-500 md:text-4xl">
          Upload to the
        </h1>
        <h1 className="mt-0 text-4xl font-bold text-black dark:text-white md:text-4xl">
          Community Archive!
        </h1>
        <br />
        <h2 className="mb-4 text-xl text-zinc-600 dark:text-zinc-300">
          {`An open database and API anyone can build on.`}
        </h2>
        <br />
        <h3 className="mb-4 text-sm">Featuring archives uploaded by:</h3>
        {mostFollowed ? (
          <AvatarList
            initialAvatars={mostFollowed}
            title="Uploaded people you may know:"
          />
        ) : (
          <p className="text-xs text-red-500">
            Failed to load most followed accounts.
          </p>
        )}
        <br />
        <CommunityStats />
        <br />
        <div className="text-sm">
          <p className="mb-4 leading-relaxed">
            {`Powered by your tweet history, the community archive lets anyone build things like:`}
          </p>
          <ul className="mb-4 list-disc space-y-2 pl-16 ">
            <li>🔎 Search that really knows what you mean;</li>
            <li>✨ AI apps with context on you and your friends;</li>
            <li>📚 Make artifacts like books based on your tweets;</li>
            <li>And more!</li>
          </ul>
          <br />

          <p className="text-sm">
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
        <p className="text-sm dark:text-gray-300">{`If you do... `}</p>
        {isDev ? <UploadTwitterArchive supabase={null} /> : <DynamicSignIn />}
        {!isDev && <UploadTwitterArchive supabase={null} />}
        <br />
        <div className="mb-4 text-sm">
          Useful links:
          <ul className="mb-4 list-disc pl-6">
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
            <h2 className="mb-4 text-xl font-bold">Search the Archive</h2>
            <SearchTweets supabase={null} />
          </div>
        </div>
      </div>
    </div>
  )
}
