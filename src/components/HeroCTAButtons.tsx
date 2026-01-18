'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { createBrowserClient } from '@/utils/supabase'
import { Users, Puzzle } from 'lucide-react'
import { devLog } from '@/lib/devLog'

const CHROME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/community-archive-stream/igclpobjpjlphgllncjcgaookmncegbk'

export default function HeroCTAButtons() {
  const router = useRouter()
  const { userMetadata } = useAuthAndArchive()
  const supabase = createBrowserClient()

  const [user, setUser] = useState<any>(null)
  const [isOptedIn, setIsOptedIn] = useState<boolean | null>(null)
  const [isOptInLoading, setIsOptInLoading] = useState(false)

  const twitterUsername = userMetadata?.user_name
  const twitterUserId = userMetadata?.provider_id

  // Get current user session
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user || null)
    }

    getCurrentUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  // Check opt-in status
  useEffect(() => {
    const checkOptInStatus = async () => {
      if (!user?.id) return

      try {
        const { data, error } = await supabase
          .from('optin')
          .select('opted_in')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Error checking opt-in status:', error)
        }

        setIsOptedIn(data?.opted_in || false)
      } catch (err) {
        console.error('Error checking opt-in status:', err)
        setIsOptedIn(false)
      }
    }

    checkOptInStatus()
  }, [user?.id, supabase])

  const signIn = async (redirectAction?: string) => {
    devLog('sign in for action:', redirectAction)

    if (process.env.NODE_ENV === 'development') {
      try {
        const response = await fetch('/api/auth/dev-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'dev@example.com',
            password: 'devpassword123'
          }),
        })

        const result = await response.json()
        if (!response.ok) {
          console.error('Dev login failed:', result.error)
          return
        }

        devLog('Dev login successful:', result)
        window.location.reload()
      } catch (error) {
        console.error('Error during dev sign in:', error)
      }
    } else {
      const callbackUrl = redirectAction
        ? `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(`/?action=${redirectAction}`)}`
        : `${window.location.origin}/api/auth/callback`

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'twitter',
        options: { redirectTo: callbackUrl },
      })

      if (error) {
        console.error('Error signing in with Twitter:', error)
      }
    }
  }

  const handleOptIn = async () => {
    if (!user) {
      await signIn('optin')
      return
    }

    if (!twitterUsername) {
      console.error('No Twitter username found')
      return
    }

    if (isOptedIn) {
      return
    }

    setIsOptInLoading(true)

    try {
      const response = await fetch('/api/opt-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          username: twitterUsername.toLowerCase(),
          twitterUserId: twitterUserId || null,
          optedIn: true,
          termsVersion: 'v1.0'
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to opt in')
      }

      setIsOptedIn(true)
      router.refresh()
    } catch (err: any) {
      console.error('Opt-in error:', err.message)
    } finally {
      setIsOptInLoading(false)
    }
  }

  const getOptInButtonText = () => {
    if (isOptInLoading) return 'Processing...'
    if (isOptedIn) return 'Opted In'
    if (!user) return 'Opt In'
    return 'Opt In'
  }

  const getOptInButtonStyle = () => {
    if (isOptedIn) {
      return 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700 cursor-default'
    }
    return 'bg-green-600 hover:bg-green-700 text-white dark:bg-green-600 dark:hover:bg-green-700'
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full sm:w-auto">
        {/* Install Extension Button - Left */}
        <div className="flex flex-col items-center">
          <Button
            asChild
            variant="outline"
            className="h-14 px-8 text-lg font-semibold rounded-xl border-2"
            size="lg"
          >
            <a href={CHROME_EXTENSION_URL} target="_blank" rel="noopener noreferrer">
              <Puzzle className="w-5 h-5 mr-2" />
              Install Extension
            </a>
          </Button>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center max-w-[180px]">
            Archive tweets as you browse
          </p>
        </div>

        {/* Opt In Button - Right */}
        <div className="flex flex-col items-center">
          <Button
            onClick={handleOptIn}
            disabled={isOptInLoading || isOptedIn === true}
            className={`h-14 px-8 text-lg font-semibold rounded-xl ${getOptInButtonStyle()}`}
            size="lg"
          >
            <Users className="w-5 h-5 mr-2" />
            {getOptInButtonText()}
          </Button>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center max-w-[180px]">
            {isOptedIn ? 'Your tweets are being archived' : 'Allow archiving your public tweets'}
          </p>
        </div>
      </div>
    </div>
  )
}
