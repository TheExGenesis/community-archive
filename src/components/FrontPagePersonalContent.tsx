'use client'
import UploadTwitterArchive from '@/components/UploadTwitterArchive'
import { getSchemaName, getTableName } from '@/lib-client/getTableName'
import { use, useEffect, useState } from 'react'
import { createBrowserClient } from '@/utils/supabase'
import SignInComponent from '@/components/SignIn'
import PersonalStats from '@/components/PersonalStats'

export default function FrontPagePersonalContent() {
  const [userMetadata, setUserMetadata] = useState<any>(null)
  const [isArchiveUploaded, setIsArchiveUploaded] = useState(false)

  useEffect(() => {
    const supabase = createBrowserClient()
    if (
      process.env.NODE_ENV !== 'production' &&
      typeof window !== 'undefined'
    ) {
      window.supabase = supabase
    }

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
    <div>
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
    </div>
  )
}
