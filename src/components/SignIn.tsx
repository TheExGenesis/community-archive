'use client'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { devLog } from '@/lib-client/devLog'
import { createBrowserClient } from '@/utils/supabase'

export default function SignIn() {
  const { userMetadata, isArchiveUploaded } = useAuthAndArchive()

  const signIn = async () => {
    const supabase = createBrowserClient()
    devLog('sign in', {
      userMetadata,
      useremote: process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB,
    })

    if (
      process.env.NODE_ENV === 'development' &&
      process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'false'
    ) {
      // Mock sign-in for local development
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'dev@gmail.com',
        password: 'dev',
      })
      devLog('sign in with password', { data, error })
      if (error) {
        console.error('Error signing in:', error)
      } else if (data.user) {
        // Change the user ID after successful sign-in
        const response = await fetch('/api/auth/changeuserid', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: data.user.id,
            providerId: process.env.NEXT_PUBLIC_USER_ID, // Replace with desired new user ID
            userName: process.env.NEXT_PUBLIC_USER_NAME,
          }),
        })

        const result = await response.json()
        if (response.ok) {
          devLog('User ID updated:', result.data)
        } else {
          console.error('Failed to update user ID:', result.error)
        }
      }
    } else {
      // Existing Twitter OAuth sign-in
      devLog('sign in with twitter', {
        userMetadata,
        origin: window.location.origin,
      })
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'twitter',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
        },
      })
      devLog({ data, error })

      if (error) {
        console.error('Error signing in with Twitter:', error)
      }
    }
  }

  const handleSignOut = async () => {
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signOut()
    devLog('sign out', { error })
    if (!error) {
      window.location.reload()
    }
  }

  return userMetadata ? (
    <div className="inline-flex items-center dark:text-gray-300">
      <span>{`You're logged in as ${
        userMetadata.full_name || userMetadata.user_name || 'Unknown User'
      } `}</span>
      <form action={handleSignOut} className="ml-2 inline-block">
        <button type="submit" className="hover:underline dark:text-blue-400">
          (Sign Out)
        </button>
      </form>
    </div>
  ) : (
    <div className="dark:text-gray-300">
      <form action={signIn} className="inline-block">
        {process.env.NODE_ENV === 'development' &&
        process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'false' ? (
          <button
            type="submit"
            className="text-blue-500 hover:underline dark:text-blue-400"
          >
            Sign in as Dev
          </button>
        ) : (
          <button
            type="submit"
            className="text-blue-500 hover:underline dark:text-blue-400"
          >
            Sign in with Twitter
          </button>
        )}
      </form>
      <span className="ml-1">to upload your archive</span>
    </div>
  )
}
