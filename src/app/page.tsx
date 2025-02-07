export const revalidate = 0

import CommunityStats from '@/components/CommunityStats'
import SearchTweets from '@/components/SearchTweets'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import AvatarList from '@/components/AvatarList'
import { SupabaseClient } from '@supabase/supabase-js'
import { FaGithub, FaDiscord } from 'react-icons/fa'
import UploadHomepageSection from '@/components/UploadHomepageSection'
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
      <div className="mt-8 bg-white pb-16 dark:bg-gray-800">
        <h1 className="mt-0 text-4xl font-bold text-black dark:text-white md:text-4xl">
          Community Archive
        </h1>
        <h2 className="mb-4 text-xl text-zinc-600 dark:text-zinc-300">
          {`An open database and API anyone can build on`}
        </h2>
        <CommunityStats />
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
        <h2 className="mb-4 text-xl">📤 Upload your data</h2>

        <p>
          Export your data from twitter:{' '}
          <a
            href="https://x.com/settings/download_your_data"
            className="text-blue-500 hover:underline"
          >
            https://x.com/settings/download_your_data
          </a>
        </p>
        <br />
        <DynamicSignIn />
        <UploadHomepageSection supabase={null} />
        <br />

        <h2 className="my-10 mb-4 text-xl">💻 Data & source code</h2>

        <p>
          You can download any individual user&apos;s data (includes all tweets,
          followers, following, etc) as one big JSON file, or query our API,{' '}
          <a
            href="https://github.com/TheExGenesis/community-archive/tree/main/docs#docs"
            className="text-blue-500 hover:underline"
          >
            see documentation here
          </a>
          .
        </p>

        <br />
        <ul className="list-disc pl-4">
          <li>
            <a
              href="https://github.com/TheExGenesis/community-archive"
              className="mr-2 inline-flex items-center text-blue-500 hover:underline"
            >
              <FaGithub className="mr-1" /> GitHub repo
            </a>
          </li>
          <li>
            <a
              href="https://discord.gg/5mbWEfVrqw"
              className="inline-flex items-center text-blue-500 hover:underline"
            >
              <FaDiscord className="mr-1" /> Discord
            </a>
          </li>
          <li>
            <a
              href="https://github.com/TheExGenesis/community-archive/tree/main/docs"
              className="inline-flex items-center text-blue-500 hover:underline"
            >
              Docs & code examples
            </a>
          </li>
        </ul>

        <h2 className="my-10 mb-4 text-xl">📖 About this project</h2>

        <p>
          We believe there is immense cultural, historical, and economic value
          in our data. We&apos;re building open source public infrastructure to
          collect, host, and serve this data for whatever purpose communities
          choose to use it for.
        </p>

        <br />
        <ul className="list-disc pl-4">
          <li>
            <a
              href="https://opencollective.com/community-archive/donate"
              className="text-blue-500 hover:underline"
              target="_blank"
            >
              Donate to our Open Collective
            </a>
          </li>
        </ul>

        <br />
        <p>
          Maintained & developed by{' '}
          <a href="@https://x.com/exgenesis" className="hover:underline">
            Xiq (@exgeneis)
          </a>{' '}
          & contributors.
        </p>
      </div>

      {/* Add Footer component */}
      <Footer />
    </div>
  )
}
