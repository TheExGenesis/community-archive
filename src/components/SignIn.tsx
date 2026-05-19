'use client'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { devLog } from '@/lib/devLog'
import { createBrowserClient } from '@/utils/supabase'
import { useSearchParams } from 'next/navigation'

export default function SignIn() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  const { userMetadata, isArchiveUploaded } = useAuthAndArchive()
  const isDevLoginEnabled =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_ENABLE_STAGING_DEV_LOGIN === 'true'
  const isStagingLogin =
    process.env.NODE_ENV !== 'development' &&
    process.env.NEXT_PUBLIC_ENABLE_STAGING_DEV_LOGIN === 'true'

  const signIn = async () => {
    const supabase = createBrowserClient()
    devLog('sign in', {
      userMetadata,
      useremote: process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB,
      isDev: process.env.NODE_ENV === 'development',
      isDevLoginEnabled,
    })

    if (isDevLoginEnabled) {
      try {
        const response = await fetch('/api/auth/dev-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            isStagingLogin
              ? {}
              : {
                  email: 'dev@example.com',
                  password: 'devpassword123',
                },
          ),
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

  return userMetadata ? (
    <form action={handleSignOut} className="inline-block">
      <button
        type="submit"
        className="whitespace-nowrap rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        Sign Out
      </button>
    </form>
  ) : (
    <div className="inline-block">
      <form action={signIn} className="inline-block">
        <button
          type="submit"
          className={`rounded-md border border-transparent px-4 py-2 text-sm font-medium text-white transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
            isDevLoginEnabled
              ? 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500 dark:bg-yellow-500 dark:hover:bg-yellow-600'
              : 'bg-green-600 hover:bg-green-700 focus:ring-green-500 dark:bg-green-500 dark:hover:bg-green-600'
          }`}
        >
          {isStagingLogin
            ? 'Sign in as Alice Staging'
            : isDevLoginEnabled
              ? 'Sign in (Dev Mode)'
              : 'Sign in with Twitter'}
        </button>
      </form>
    </div>
  )
}
