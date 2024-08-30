'use client'
import UploadTwitterArchive from '@/components/UploadTwitterArchive'
import { getSchemaName, getTableName } from '@/lib-client/getTableName'
import { use, useEffect, useState } from 'react'
import { createBrowserClient } from '@/utils/supabase'
import SignInComponent from '@/components/SignIn'
import SearchTweets from '@/components/SearchTweets'
import CommunityStats from '@/components/CommunityStats'
import PersonalStats from '@/components/PersonalStats'

const updateProfile = async (
  supabase: any,
  accountId: string,
  avatarUrl: string,
) => {
  // Check if the account exists
  const { data: existingAccount } = await supabase
    .schema(getSchemaName())
    .from(getTableName('profile'))
    .select('account_id')
    .eq('account_id', accountId)
    .maybeSingle()

  // Only upsert if the account exists
  if (existingAccount) {
    const { error } = await supabase
      .schema(getSchemaName())
      .from(getTableName('profile'))
      .upsert(
        { account_id: accountId, avatar_media_url: avatarUrl },
        { onConflict: 'account_id', ignoreDuplicates: false },
      )

    if (error) console.error('Error updating profile:', error)
  } else {
    console.log('Account does not exist, skipping update')
  }
}

export default function UploadArchivePage() {
  const [userMetadata, setUserMetadata] = useState<any>(null)
  const [isArchiveUploaded, setIsArchiveUploaded] = useState(false)

  useEffect(() => {
    const supabase = createBrowserClient()

    // Set up auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        if (!session.user.user_metadata) return
        setUserMetadata(session.user.user_metadata)
        console.log('session.user.user_metadata', session.user.user_metadata)
        // updateProfile(
        //   supabase,
        //   session.user.user_metadata.provider_id,
        //   session.user.user_metadata.picture,
        // )
      } else {
        setUserMetadata(null)
      }
    })

    // Initial check for session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserMetadata(session.user.user_metadata)
      }
    })

    // Cleanup subscription on component unmount
    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const checkArchiveUpload = async () => {
      if (!userMetadata?.provider_id) return

      const supabase = createBrowserClient()
      const { data, error } = await supabase
        .schema(getSchemaName())
        .from(getTableName('archive_upload') as 'archive_upload')
        .select('id')
        .eq('account_id', userMetadata.provider_id)
        .limit(1)

      if (error) {
        console.error('Error checking archive upload:', error)
        return
      }

      setIsArchiveUploaded(data.length > 0)
    }

    checkArchiveUpload()
  }, [userMetadata])

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
        </div>

        <br />
        <br />
        <div>
          <h2 className="mb-4 text-2xl font-bold">Our Data Policy</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              We do not see direct messages or email addresses or deleted or
              community tweets.
            </li>
            <li>
              The only things that leave your machine are 1. profile information
              2. tweets, 3. likes, 4. followers/following
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
            {"If you want to make absolutely sure we don't see your DMs:"}
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>{`Unzip your archive,`}</li>
            <li>{`Go into the "data" folder,`}</li>
            <li>{`Delete "direct-messages.js",`}</li>
            <li>{`and zip the main folder again.`}</li>
          </ul>
          <br />
          {`This way we won't be able to see your DMs but you'll still be able to use the archive to query your tweets, likes, etc.`}
        </div>
      </div>

      {/* Personal content */}
      <div className="w-full overflow-y-auto p-4 md:w-1/2">
        <div className="mb-8">
          <SignInComponent userMetadata={userMetadata} />
        </div>

        {userMetadata && (
          <>
            <div className="mb-8">
              <h2 className="mb-4 text-2xl font-bold">Upload Your Archive</h2>
              <UploadTwitterArchive userMetadata={userMetadata} />
            </div>

            {isArchiveUploaded && (
              <div>
                <h2 className="mb-4 text-2xl font-bold">Your Stats</h2>
                <PersonalStats userMetadata={userMetadata} />
              </div>
            )}
          </>
        )}

        <br />
        <div className="flex flex-grow flex-col">
          <h2 className="mb-4 text-2xl font-bold">Search the Archive</h2>
          <div
            className=" flex-grow overflow-hidden"
            style={{ height: '48rem' }}
          >
            <CommunityStats />
            <SearchTweets />
          </div>
        </div>
      </div>
    </div>
  )
}
