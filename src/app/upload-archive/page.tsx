'use client'
import UploadTwitterArchive from '@/components/UploadTwitterArchive'
import { getTableName } from '@/lib-client/getTableName'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/utils/supabase'

const getUsernames = async (supabase: any) => {
  const { data: accounts, error } = await supabase
    .from(getTableName('account'))
    .select(`*`)
    .order('archive_at', { ascending: false })
  console.log({ accounts })
  if (error) {
    console.error('Error fetching tweets:', error)
    throw error
  }

  return accounts.map((account: any) => account.username)
}

export default function UploadArchivePage() {
  const [usernames, setUsernames] = useState<string[]>([])

  useEffect(() => {
    const supabase = createBrowserClient()
    getUsernames(supabase).then((usernames) => setUsernames(usernames))
  }, [])

  return (
    <div className="flex w-full flex-1 flex-col items-center gap-20">
      <div className="flex flex-col items-center gap-1">
        <h2 className="mb-4 text-4xl font-bold">Community Archive</h2>
        <p className="text-center text-sm">
          Welcome to the community archive! We think a lot of value was produced
          in twitter conversations over the years and it would be amazing to
          preserve the "canon" somehow.
        </p>
        <br />
        <p className="text-center text-sm">
          Since twitter is stingy with data, but tweets are technically public,
          we're hosting a public database with an API that anyone can query and
          build on top of.{' '}
        </p>
        <br />
        <p className="text-center text-sm">
          If you haven't yet, we ask you to{' '}
          <a
            href="https://x.com/settings/download_your_data"
            target="_blank"
            rel="noopener noreferrer"
          >
            request your twitter archive
          </a>
          . THey'll ask you to login and then email you a code. Then they'll
          wait a day or two and email you a download link. Thank you for you
          persistence :)
        </p>
      </div>

      <div className="flex flex-col items-center gap-1">
        <h2 className="mb-4 text-4xl font-bold">Upload your archive</h2>
        <p className="text-center text-sm">
          Please upload your Twitter archive (folder or .zip).
        </p>
        <UploadTwitterArchive />
      </div>
      <div className="flex flex-col items-center gap-1">
        <h2 className="mb-4 text-4xl font-bold">Community Archive</h2>
        <p className="text-center text-sm">
          These wonderful people have already uploaded their archives:
        </p>
        <div className="flex flex-col gap-4">
          {usernames.map((username: string) => (
            <div key={username} className="flex gap-2">
              <div className="flex-grow">{username}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-1">
        <h2 className="mb-4 text-4xl font-bold">Search the Archive</h2>
        <p className="text-center text-sm">
          Ready to explore the community archive? Visit our search page to
          discover insights and conversations.
        </p>
        <a
          href="/search"
          className="mt-4 rounded-md bg-blue-500 px-6 py-2 text-white transition-colors hover:bg-blue-600"
        >
          Go to Search Page
        </a>
      </div>
    </div>
  )
}
