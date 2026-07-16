'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { createBrowserClient } from '@/utils/supabase'
import { Users, Puzzle, Upload } from 'lucide-react'
import { devLog } from '@/lib/devLog'

const CHROME_EXTENSION_URL =
  'https://chromewebstore.google.com/detail/community-archive-stream/igclpobjpjlphgllncjcgaookmncegbk'

interface HeroCTAButtonsProps {
  initialIsOptedIn?: boolean
}

export default function HeroCTAButtons({
  initialIsOptedIn = false,
}: HeroCTAButtonsProps) {
  const router = useRouter()
  const { userMetadata } = useAuthAndArchive()
  const supabase = createBrowserClient()

  const [user, setUser] = useState<any>(null)
  const [isOptedIn, setIsOptedIn] = useState(initialIsOptedIn)
  const [isOptInLoading, setIsOptInLoading] = useState(false)

  const twitterUsername = userMetadata?.user_name
  const twitterUserId = userMetadata?.provider_id

  // Get current user session
  useEffect(() => {
    const getCurrentUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setUser(session?.user || null)
    }

    getCurrentUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
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
            password: 'devpassword123',
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
          termsVersion: 'v1.0',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to opt in')
      }

      setIsOptedIn(true)
      router.replace('/')
      router.refresh()
    } catch (err: any) {
      console.error('Opt-in error:', err.message)
    } finally {
      setIsOptInLoading(false)
    }
  }

  const getOptInButtonText = () => {
    if (isOptInLoading) return 'Processing...'
    if (!user) return 'Opt in'
    return 'Opt in'
  }

  const getOptInButtonStyle = () => {
    return 'bg-green-600 hover:bg-green-700 text-white dark:bg-green-400 dark:hover:bg-green-300 dark:text-green-950'
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:gap-4">
          {/* Opt In Button */}
          {isOptedIn !== true ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleOptIn}
                  disabled={isOptInLoading}
                  className={`h-14 w-full px-8 text-lg font-semibold ${getOptInButtonStyle()}`}
                  size="lg"
                >
                  <Users className="mr-2 h-5 w-5" />
                  {getOptInButtonText()}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Archive your public tweets</TooltipContent>
            </Tooltip>
          ) : null}

          {/* Upload Archive Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                className="h-14 w-full bg-green-600 px-8 text-lg font-semibold text-white hover:bg-green-700 dark:bg-green-400 dark:text-green-950 dark:hover:bg-green-300"
                size="lg"
              >
                <a href="#upload-archive">
                  <Upload className="mr-2 h-5 w-5" />
                  Upload archive
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Backfill older tweets by importing your full X archive
            </TooltipContent>
          </Tooltip>

          {/* Install Extension Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="outline"
                className="h-14 w-full border-2 px-8 text-lg font-semibold"
                size="lg"
              >
                <a
                  href={CHROME_EXTENSION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Puzzle className="mr-2 h-5 w-5" />
                  Get extension
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Contribute tweets in real time while you browse
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
