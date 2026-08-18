'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { updateOptIn } from '@/lib/optInApi'
import { useBrowserExtensionStatus } from '@/hooks/useBrowserExtensionStatus'
import { CHROME_EXTENSION_URL } from '@/lib/browserExtension'

interface HeroCTAButtonsProps {
  initialIsOptedIn?: boolean
}

export default function HeroCTAButtons({
  initialIsOptedIn = false,
}: HeroCTAButtonsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userMetadata } = useAuthAndArchive()
  const supabase = useMemo(() => createBrowserClient(), [])
  const autoOptInStarted = useRef(false)
  const optInInFlight = useRef(false)
  const extensionStatus = useBrowserExtensionStatus()

  const [user, setUser] = useState<any>(null)
  const [isOptedIn, setIsOptedIn] = useState(initialIsOptedIn)
  const [isOptInLoading, setIsOptInLoading] = useState(false)
  const [optInError, setOptInError] = useState<string | null>(null)

  const twitterUsername = userMetadata?.user_name
  const shouldAutoOptIn = searchParams.get('action') === 'optin'

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

  const completeOptIn = useCallback(async () => {
    if (!user?.id || !twitterUsername || isOptedIn || optInInFlight.current) {
      return false
    }

    optInInFlight.current = true
    setIsOptInLoading(true)
    setOptInError(null)

    try {
      await updateOptIn({
        username: twitterUsername.toLowerCase(),
        optedIn: true,
        termsVersion: 'v1.0',
      })

      setIsOptedIn(true)
      router.replace('/')
      router.refresh()
      return true
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to opt in. Please try again.'
      console.error('Opt-in error:', message)
      setOptInError(message)
      return false
    } finally {
      optInInFlight.current = false
      setIsOptInLoading(false)
    }
  }, [isOptedIn, router, twitterUsername, user?.id])

  // Clicking Opt in before authentication records the intent in the OAuth
  // callback URL. Complete that intent as soon as the returning session and
  // Twitter metadata are available, so the user does not have to click twice.
  useEffect(() => {
    if (!shouldAutoOptIn || autoOptInStarted.current) {
      return
    }

    if (isOptedIn) {
      autoOptInStarted.current = true
      router.replace('/')
      return
    }

    if (!user?.id || !twitterUsername) return

    autoOptInStarted.current = true
    void completeOptIn()
  }, [
    completeOptIn,
    isOptedIn,
    router,
    shouldAutoOptIn,
    twitterUsername,
    user?.id,
  ])

  const handleOptIn = async () => {
    if (!user) {
      await signIn('optin')
      return
    }

    if (!twitterUsername) {
      console.error('No Twitter username found')
      return
    }

    await completeOptIn()
  }

  const getOptInButtonText = () => {
    if (isOptInLoading) return 'Processing...'
    if (optInError) return 'Retry opt in'
    if (!user) return 'Opt in'
    return 'Opt in'
  }

  const getOptInButtonStyle = () => {
    return 'bg-brand text-brand-foreground hover:bg-brand/90'
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
                variant={isOptedIn ? 'default' : 'outline'}
                className={`h-14 w-full px-8 text-lg font-semibold ${
                  isOptedIn
                    ? 'bg-brand text-brand-foreground hover:bg-brand/90'
                    : 'border-2'
                }`}
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
          {extensionStatus === 'not-installed' ? (
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
          ) : null}
        </div>
        {optInError ? (
          <Alert variant="destructive" className="max-w-xl" aria-live="polite">
            <AlertDescription>{optInError}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </TooltipProvider>
  )
}
