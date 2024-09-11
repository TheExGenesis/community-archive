'use client'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { getSchemaName } from '@/lib-client/getTableName'
import { createBrowserClient } from '@/utils/supabase'
import { useEffect, useState } from 'react'

export default function SignIn() {
  const { userMetadata, isArchiveUploaded } = useAuthAndArchive()

  const signInWithTwitter = async () => {
    const supabase = createBrowserClient()

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'twitter',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })
    console.log({ data, error })

    if (error) {
      console.error('Error signing in with Twitter:', error)
    }
  }

  const handleSignOut = async () => {
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signOut()
    console.log('sign out', { error })
    if (!error) {
      window.location.reload()
    }
  }

  return userMetadata ? (
    <p className="inline flex items-center dark:text-gray-300">
      {`You're logged in as 
      ${userMetadata.full_name || userMetadata.user_name} `}
      <form action={handleSignOut} className="inline">
        <button
          type="submit"
          className="ml-2 hover:underline dark:text-blue-400"
        >
          {'(Sign Out)'}
        </button>
      </form>
    </p>
  ) : (
    <>
      <p className="inline  dark:text-gray-300">
        <form action={signInWithTwitter} className="inline">
          <button
            type="submit"
            className="text-blue-500 hover:underline dark:text-blue-400"
          >
            {'Sign in with Twitter '}
          </button>
        </form>
        {' to upload your archive'}
      </p>
    </>
  )
}
