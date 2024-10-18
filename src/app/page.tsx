export const revalidate = 0

import CommunityStats from '@/components/CommunityStats'
import SearchTweets from '@/components/SearchTweets'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import AvatarList from '@/components/AvatarList'
import { SupabaseClient } from '@supabase/supabase-js'
import { FaGithub, FaDiscord } from 'react-icons/fa'
import UploadTwitterArchive from '@/components/UploadTwitterArchive'
import dynamic from 'next/dynamic'
// Dynamically import SignIn component with ssr disabled
const DynamicSignIn = dynamic(() => import('@/components/SignIn'), {
  ssr: false,
})

// Add this import
import Footer from '@/components/Footer'

declare global {
  interface Window {
    supabase: any
  }
}

const getMostFollowedAccounts = async (supabase: SupabaseClient) => {
  let { data, error } = await supabase
    .from('global_activity_summary')
    .select('top_accounts_with_followers')
    .single()

  if (error) {
    console.error('Failed to fetch top accounts:', error)
    return []
  }

  return data?.top_accounts_with_followers || []
}

export default async function Homepage() {
  const supabase = createServerClient(cookies())
  const mostFollowed = (await getMostFollowedAccounts(supabase)).slice(0, 7)
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
          <div className="mb-4 space-y-2 pl-4">
            <p>🔎 Search that really knows what you mean</p>
            <p>✨ AI apps with context on you and your friends</p>
            <p>📚 Make artifacts like books based on your tweets</p>
            <p>And more!</p>
          </div>
          <br />
        </div>
        <p className="mb-4 text-sm font-bold">{`How can I contribute?`}</p>
        <ul className="mb-4 list-disc space-y-2 pl-6 text-sm">
          <li>
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
          </li>
          <li className="dark:text-gray-300">{`If you do have an archive... `}</li>
        </ul>
        {isDev ? <UploadTwitterArchive supabase={null} /> : <DynamicSignIn />}
        {!isDev && <UploadTwitterArchive supabase={null} />}
        <br />
        <div className="mb-4 text-sm">
          Useful links:
          <ul className="mb-4 list-disc pl-6">
            <li>
              <a
                href="https://github.com/TheExGenesis/community-archive/blob/main/docs/archive_data.md"
                className="text-blue-500 hover:underline"
              >
                {`What data from the archive do we use, and why?`}
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
            <li>
              {`Want to know more? `}
              <a
                href="https://substack.com/@xiqo/p-148517224"
                className="text-blue-500 hover:underline"
              >
                {`Here's our FAQ`}
              </a>
            </li>
          </ul>
          <br />
          <br />
        </div>
        <div className="mb-4"></div>
        <br />
      </div>

      {/* Add Footer component */}
      <Footer />
    </div>
  )
}
