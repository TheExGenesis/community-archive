'use client'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { devLog } from '@/lib/devLog'
import { createBrowserClient } from '@/utils/supabase'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

// Seeded mock users available for staging dev-login bypass.
// Keep in sync with supabase/seed.sql.
const STAGING_USERS = [
  {
    username: 'alice_dev',
    providerId: 'mock_alice',
    displayName: 'Alice Developer',
  },
  { username: 'xiq_dev', providerId: 'mock_xiq', displayName: 'XIQ Dev' },
] as const

export default function SignIn() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  const { userMetadata } = useAuthAndArchive()
  const isDevLoginEnabled =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_ENABLE_STAGING_DEV_LOGIN === 'true'
  const isStagingLogin =
    process.env.NODE_ENV !== 'development' &&
    process.env.NEXT_PUBLIC_ENABLE_STAGING_DEV_LOGIN === 'true'

  // ?as=<username> lets you deep-link to a specific staging user, otherwise default to first.
  const asParam = searchParams.get('as')
  const initialUser =
    STAGING_USERS.find((u) => u.username === asParam) ?? STAGING_USERS[0]
  const [selectedUser, setSelectedUser] =
    useState<(typeof STAGING_USERS)[number]>(initialUser)

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
              ? {
                  username: selectedUser.username,
                  providerId: selectedUser.providerId,
                  displayName: selectedUser.displayName,
                }
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

  return userMetadata ? null : (
    <div className="inline-flex items-center gap-2">
      {isStagingLogin && (
        <select
          value={selectedUser.username}
          onChange={(e) => {
            const next = STAGING_USERS.find(
              (u) => u.username === e.target.value,
            )
            if (next) setSelectedUser(next)
          }}
          className="rounded-md border border-yellow-700 bg-card px-2 py-1.5 text-sm font-medium text-yellow-900 focus:outline-none focus:ring-2 focus:ring-yellow-500 dark:border-yellow-500 dark:bg-card dark:text-yellow-200"
          aria-label="Pick staging mock user"
        >
          {STAGING_USERS.map((u) => (
            <option key={u.username} value={u.username}>
              {u.displayName} (@{u.username})
            </option>
          ))}
        </select>
      )}
      <form action={signIn} className="inline-block">
        <button
          type="submit"
          className={`rounded-[8px] border border-transparent px-4 py-2 text-sm font-medium text-white transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-background ${
            isDevLoginEnabled
              ? 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500 dark:bg-yellow-500 dark:hover:bg-yellow-600'
              : 'bg-green-600 hover:bg-green-700 focus:ring-green-500 dark:bg-green-400 dark:text-green-950 dark:hover:bg-green-300'
          }`}
        >
          {isStagingLogin ? (
            `Sign in as ${selectedUser.displayName}`
          ) : isDevLoginEnabled ? (
            'Sign in (Dev Mode)'
          ) : (
            <>
              Sign in<span className="hidden sm:inline"> with Twitter</span>
            </>
          )}
        </button>
      </form>
    </div>
  )
}
