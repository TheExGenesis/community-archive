'use client'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { devLog } from '@/lib/devLog'
import { createBrowserClient } from '@/utils/supabase'
import { useSearchParams } from 'next/navigation'

export default function SignIn() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  const { userMetadata, isArchiveUploaded } = useAuthAndArchive()

  const signIn = async () => {
    const supabase = createBrowserClient()
    devLog('sign in', {
      userMetadata,
      useremote: process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB,
      isDev: process.env.NODE_ENV === 'development',
    })

    // Always use dev login in development mode
    if (process.env.NODE_ENV === 'development') {
      try {
        // Use the dev-login API endpoint for consistent behavior
        const response = await fetch('/api/auth/dev-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'dev@example.com',
            password: 'devpassword123'
          }),
        })

        const result = await response.json()

        if (!response.ok) {
          console.error('Dev login failed:', result.error)
          // Fallback to showing an error message
          alert(`Dev login failed: ${result.error || 'Unknown error'}`)
          return
        }

        devLog('Dev login successful:', result)
        
        // Redirect to intended page after dev login
        if (redirectTo) {
          window.location.href = redirectTo
        } else {
          window.location.href = '/profile'
        }
      } catch (error) {
        console.error('Error during dev sign in:', error)
        alert('Failed to sign in. Check the console for details.')
      }
    } else {
      // Production: Use Twitter OAuth sign-in
      devLog('sign in with twitter', {
        userMetadata,
        origin: window.location.origin,
      })
      const callbackUrl = redirectTo 
        ? `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(redirectTo)}`
        : `${window.location.origin}/api/auth/callback`
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'twitter',
        options: {
          redirectTo: callbackUrl,
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

  const isDev = process.env.NODE_ENV === 'development'
  
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
          className={`px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors duration-300 ${
            isDev 
              ? 'bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-600 focus:ring-yellow-500' 
              : 'bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 focus:ring-green-500'
          }`}
        >
          {isDev ? 'Sign in (Dev Mode)' : 'Sign in with Twitter'}
        </button>
      </form>
    </div>
  )
}
