import CommunityStats from '@/components/CommunityStats'
import { BsFill1CircleFill, BsFill2CircleFill, BsFill3CircleFill } from "react-icons/bs";
import { FaExternalLinkAlt, FaFileDownload, FaFileUpload, FaSignInAlt } from "react-icons/fa";
import SearchTweets from '@/components/SearchTweets'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import AvatarList from '@/components/AvatarList'
import { SupabaseClient } from '@supabase/supabase-js'
import { FaGithub, FaDiscord } from 'react-icons/fa'
import { getTweetsCount } from '@/lib-server/db_queries'
import UploadTwitterArchive from '@/components/UploadTwitterArchive'
import SignIn from '@/components/SignIn'
import ThemeToggle from '@/components/ThemeToggle'
import { Section } from '@/components/ui/section'
import IconList from '@/components/IconList'
import { Button } from '@/components/ui/button';
import Link from 'next/link';

declare global {
  interface Window {
    supabase: any
  }
}

const getMostFollowedAccounts = async (supabase: SupabaseClient) => {
  let { data, error } = await supabase.rpc('get_top_accounts_with_followers', {
    limit_count: 8,
  })
  if (error) console.error(error)

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
const exampleApps = [
  { icon: '🔎', text: ' Search that really knows what you mean' },
  { icon: '✨', text: 'AI apps with context on you and your friends' },
  { icon: '📚', text: 'Artifacts like books based on your tweets' },
  { icon: '🥵', text: 'And more!' }
];

const howToContribute = [
  {
    icon: <BsFill1CircleFill />,
    text: (
      <>
        <a
          href="https://x.com/settings/download_your_data"
          className="text-blue-500 underline dark:text-blue-400"
        >
          Request your archive
        </a>
        {" This takes ~24 hours."}
      </>
    ),
  },
  {
    icon: <BsFill2CircleFill />,
    text: <SignIn variant='text' />,
  },
  {
    icon: <BsFill3CircleFill />,
    text: <>
      <a
        href="/upload-archive"
        className="text-blue-500 underline dark:text-blue-400">
        Upload your archive
      </a> for the greater good!</>
  },
]

export default async function Homepage() {
  const supabase = createServerClient(cookies())
  const mostFollowed = await getMostFollowedAccounts(supabase)


  return (
    <div className="flex min-h-screen justify-center bg-gray-100 dark:bg-gray-900">
      {/* Main content */}
      <div className="relative w-full max-w-3xl bg-white dark:bg-gray-800">
        <Section size="compact">
          <div className="flex items-center justify-between mb-2 mt-4 text-gray-500 dark:text-gray-400 space-x-2">
            <CommunityStats showGoal={true} />
          </div>
        </Section>
        <div className="fixed left-4 bottom-4">
          <ThemeToggle side="bottom" />
        </div>
        <Section className="pb-4">

          <h1 className="mb-0 text-4xl font-bold text-zinc-400 dark:text-zinc-500 md:text-4xl">
            Upload to the
          </h1>
          <h1 className="mt-0 text-4xl font-bold text-black dark:text-white md:text-4xl">
            Community Archive!
          </h1>
          <br />
          <h2 className="mb-8 text-xl text-zinc-600 dark:text-zinc-300">
            An open database of tweets anyone can build on.
          </h2>
          <div className="flex items-center space-x-2">

            <SignIn variant="button" />
            <Link href="https://community-archive.org/api/reference">
              <Button variant="ghost" >See the API docs</Button>
            </Link>
          </div>
        </Section>
        <Section size="small">
          <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-md">

            <h3 className="mb-4 text-lg">Featuring archives from:</h3>
            <div className="">

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
            </div>
          </div>
        </Section>
        <Section className="text-lg">
          <div className="mb-4 leading-relaxed text-2xl">
            {"With your tweets, the Community Archive enables apps like..."}
          </div>
          <IconList items={exampleApps} variant="card" />
        </Section>

        <Section>
          <div className="mt-0 text-2xl mb-4">
            {"This is great! How do I add my tweets to the Archive?"}
          </div>
          <p className="text-scm text-lg mb-4 italic">
            {"Thanks for offering! Just follow these steps:"}
          </p>
          <div className="text-lg">

            <IconList
              items={howToContribute}
              variant="text"
            />
          </div>
          <UploadTwitterArchive />
        </Section>

        <Section>
          <div className="text-2xl mb-4">
            More information
          </div>
          <ul className="mb-4 list-disc pl-6 text-lg">
            <li>
              {"We're an open database and API anyone can build on."}
            </li>
            <li>
              Here is{' '}
              <a href="/data-policy" className="text-blue-500 hover:underline">
                our data policy
              </a>{' '}
              and{' '}
              <a href="/remove-dms" className="text-blue-500 hover:underline">
                how to remove sensitive data before uploading
              </a>
            </li>
            <li>
              Want to build on the project? Check out our{' '}
              <a
                href="https://github.com/TheExGenesis/community-archive"
                className="mr-2 inline-flex items-center text-blue-500 hover:underline"
              >
                <FaGithub className="mr-1 leading-3 text-sm" /> GitHub repo
              </a>{' '}
              and{' '}
              <a
                href="https://discord.gg/AStSQj6ugq"
                className="inline-flex items-center text-blue-500 hover:underline"
              >
                <FaDiscord className="mr-1 leading-3 text-sm" /> Discord
              </a>
            </li>
            <li>
              {"Want to know more?"}
              <a
                href="https://substack.com/@xiqo/p-148517224"
                className="text-blue-500 hover:underline"
              >
                {`Here's our FAQ`}
              </a>
            </li>
          </ul>
        </Section>
        <Section >
          <div
            className="flex-grow overflow-hidden flex flex-col"
            style={{ height: '48rem' }}
          >
            <h2 className="mb-4 text-2xl">Try searching the Archive</h2>
            <div
              className="bg-gray-300 dark:bg-gray-700 p-2 overflow-hidden flex-grow"
            >
              <SearchTweets displayText="" />
            </div>
          </div>
        </Section>
      </div>
    </div >
  )
}
