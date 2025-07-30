'use client'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { devLog } from '@/lib/devLog'
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
    <div className="inline-flex items-center text-sm dark:text-gray-300">
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
    <div className="inline-block">
      <form action={signIn} className="inline-block">
        <button
          type="submit"
          className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 dark:focus:ring-offset-gray-800 transition-colors duration-300"
        >
          Sign in with Twitter
        </button>
      </form>
      {process.env.NODE_ENV === 'development' &&
        process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'false' && (
        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
         <br></br>
          (Dev Mode)
        </span>
      )}
    </div>
  )
}
