import CommunityStats from '@/components/CommunityStats'
import SearchTweets from '@/components/SearchTweets'
import FrontPagePersonalContent from '@/components/FrontPagePersonalContent'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import AvatarList from '@/components/AvatarList'
import { SupabaseClient } from '@supabase/supabase-js'

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
  else console.log(data)
  return data
}

export default async function UploadArchivePage() {
  const supabase = createServerClient(cookies())

  const mostFollowed = await getMostFollowedAccounts(supabase)
  return (
    <div className="flex h-full w-full flex-col md:flex-row">
      {/* Global content */}
      <div className="w-full p-4 md:w-1/2">
        <div>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Welcome to the community archive!
          </h2>
          <p className="md:text-md text-md text-justify">
            {`This is a place to upload your archive and share it with the
          community. We're hosting a public database with an API that anyone can
          query and build on top of.`}
          </p>
          <br />
          <p className="md:text-md text-md text-justify">
            {`We think a lot of value was
          produced in twitter conversations over the years and that is worth preserving. Since twitter is stingy with data and tweets are public, we're asking people to upload their archives and serving them back to the public.`}
          </p>
          <br />
          <p className="md:text-md text-md text-justify">
            {"If you haven't yet, we strongly encourage you to "}
            <a
              href="https://x.com/settings/download_your_data"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              {'request your twitter archive'}
            </a>
            {`! They'll ask you to login and then email you a code. Then they'll
          wait a day or two and email you a download link. ty for your
          persistence :)`}
          </p>
          <br />
          <p className="md:text-md text-md text-justify">
            This archive is open source, see{` `}
            <a
              href="https://github.com/open-birdsite-db/open-birdsite-db"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              GitHub repo
            </a>
            , contributions welcome! We also have a {` `}
            <a
              href="https://discord.gg/AStSQj6ugq"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              Discord
            </a>{' '}
            for questions/suggestions/developers chat etc.
          </p>
        </div>

        <br />
        <h2 className="mb-4 text-2xl font-bold">
          Uploaded people you may know:
        </h2>
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
        <div>
          <h2 className="mb-4 text-2xl font-bold">Our Data Policy</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              The only things that leave your machine are 1. profile information
              2. tweets, 3. likes, 4. followers/following
            </li>
            <li>
              The code never touches direct messages or email addresses or
              deleted tweets.
            </li>
            <li>
              We plan to make a full dump of the db accessible for easier data
              science use.
            </li>
          </ul>
        </div>
        <br />
        <br />
        <div>
          <h2 className="mb-4 text-2xl font-bold">
            {
              "We promise your DMs won't leave your computer, we never see them. But if you want to be 100% sure:"
            }
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>{`Unzip your archive,`}</li>
            <li>{`Go into the "data" folder,`}</li>
            <li>{`Delete "direct-messages.js",`}</li>
            <li>{`and zip the main folder again.`}</li>
          </ul>
          <br />
          {`If you trust us, you can skip this step.`}
        </div>
      </div>

      {/* Personal content */}
      <div className="w-full overflow-y-auto p-4 md:w-1/2">
        <FrontPagePersonalContent />

        <br />
        <div className="flex flex-grow flex-col">
          <div
            className="flex-grow overflow-hidden"
            style={{ height: '48rem' }}
          >
            <h2 className="mb-4 text-2xl font-bold">Community Stats</h2>
            <CommunityStats />
            <br />
            <h2 className="mb-4 text-2xl font-bold">Search the Archive</h2>
            <SearchTweets />
          </div>
        </div>
      </div>
    </div>
  )
}
