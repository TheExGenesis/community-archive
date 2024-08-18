'use client'
import UploadTwitterArchive from '@/components/UploadTwitterArchive'
import { getTableName } from '@/lib-client/getTableName'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/utils/supabase'
import SignInComponent from '@/components/SignIn'
import SearchTweets from '@/components/SearchTweets'
import CommunityStats from '@/components/CommunityStats'

export default function UploadArchivePage() {
  const [usernames, setUsernames] = useState<string[]>([])
  const [userMetadata, setUserMetadata] = useState<any>(null)

  useEffect(() => {
    const supabase = createBrowserClient()

    // Set up auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setUserMetadata(session.user.user_metadata)
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

  return (
    <div className="flex h-full w-full">
      {/* Left column - Global content */}
      <div className="flex h-full w-1/2 flex-col p-4">
        <div>
          <h2 className="mb-4 text-4xl font-bold">Community Archive</h2>
          <p className="text-center text-sm">
            {`Welcome to the community archive! We think a lot of value was
          produced in twitter conversations over the years and it would be
          amazing to preserve the "canon" somehow.`}
          </p>
          <br />
          <p className="text-center text-sm">
            {`Since twitter is stingy with data, but tweets are technically public,
          we're hosting a public database with an API that anyone can query and
          build on top of.`}
          </p>
          <br />
          <p className="text-center text-sm">
            {"If you haven't yet, we strongly encourage you to "}
            <a
              href="https://x.com/settings/download_your_data"
              target="_blank"
              rel="noopener noreferrer"
            >
              {'request your twitter archive'}
            </a>
            {`! They'll ask you to login and then email you a code. Then they'll
          wait a day or two and email you a download link. ty for your
          persistence :)`}
          </p>
        </div>
        <div>
          <h2 className="mb-4 text-2xl font-bold">Community Stats</h2>
          <CommunityStats />
        </div>
        <div className="flex flex-grow flex-col">
          <h2 className="mb-4 text-2xl font-bold">Search Tweets</h2>
          <div
            className=" flex-grow overflow-hidden rounded-lg border border-gray-300"
            style={{ height: '48rem' }}
          >
            <SearchTweets />
          </div>
        </div>
      </div>

      {/* Right column - Personal content */}
      <div className="w-1/2 overflow-y-auto p-4">
        <div className="mb-8">
          <SignInComponent userMetadata={userMetadata} />
        </div>

        <div className="mb-8">
          <h2 className="mb-4 text-2xl font-bold">Upload Your Archive</h2>
          <p className="mb-4 text-sm">
            Please upload your Twitter archive (folder or .zip).
          </p>
          <UploadTwitterArchive />
        </div>

        <div>
          <h2 className="mb-4 text-2xl font-bold">Your Stats</h2>
          <p className="text-sm">
            This space is reserved for displaying your personal statistics.
          </p>
        </div>
      </div>
    </div>
  )
}
