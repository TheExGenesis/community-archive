'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { createBrowserClient } from '@/utils/supabase'
import { Users, CheckCircle } from 'lucide-react'

export default function HomeOptInWidget() {
  const router = useRouter()
  const { userMetadata } = useAuthAndArchive()
  const [user, setUser] = useState<any>(null)
  const [isOptedIn, setIsOptedIn] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [checkingStatus, setCheckingStatus] = useState(true)
  const supabase = createBrowserClient()

  // Get Twitter info from authenticated user metadata
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

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  // Check opt-in status when user is available
  useEffect(() => {
    const checkOptInStatus = async () => {
      if (!user?.id) {
        setCheckingStatus(false)
        return
      }

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
      } finally {
        setCheckingStatus(false)
      }
    }

    checkOptInStatus()
  }, [user?.id, supabase])

  const handleOptIn = async () => {
    if (!user?.id || !twitterUsername) {
      setError('Please sign in with Twitter to opt in.')
      return
    }

    setError('')
    setSuccess('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/opt-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      setSuccess('Successfully opted in to tweet streaming!')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // If checking status, show loading
  if (checkingStatus) {
    return (
      <Card className="border-green-200 dark:border-green-700">
        <CardContent className="pt-6 text-center">
          <div className="animate-pulse">
            <div className="mx-auto h-4 w-32 rounded bg-muted"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // If not authenticated, show sign-in prompt
  if (!user) {
    return (
      <Card className="border-green-200 dark:border-green-700">
        <CardContent className="space-y-4 pt-6 text-center">
          <div className="text-4xl">🙋‍♂️</div>
          <h3 className="text-xl font-semibold text-foreground">
            Step 1: Opt In
          </h3>
          <p className="text-muted-foreground">
            Sign in and give permission to include your public tweets in the
            community archive.
          </p>
          <p className="text-sm text-muted-foreground">
            Please sign in above to get started
          </p>
        </CardContent>
      </Card>
    )
  }

  // If no Twitter username, show error
  if (!twitterUsername) {
    return (
      <Card className="border-red-200 dark:border-red-700">
        <CardContent className="space-y-4 pt-6 text-center">
          <div className="text-4xl">⚠️</div>
          <h3 className="text-xl font-semibold text-foreground">
            Twitter Account Required
          </h3>
          <p className="text-red-600 dark:text-red-400">
            No Twitter account found. Please sign in with Twitter to use the
            opt-in feature.
          </p>
        </CardContent>
      </Card>
    )
  }

  // If already opted in, show success state
  if (isOptedIn) {
    return (
      <Card className="border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20">
        <CardContent className="space-y-4 pt-6 text-center">
          <div className="text-4xl">✅</div>
          <h3 className="text-xl font-semibold text-green-900 dark:text-green-100">
            You&apos;re Opted In!
          </h3>
          <p className="text-green-800 dark:text-green-200">
            Your public tweets are now being preserved in the community archive.
          </p>
          <div className="flex items-center justify-center text-sm text-green-700 dark:text-green-300">
            <CheckCircle className="mr-2 h-4 w-4" />@{twitterUsername} is
            contributing to the archive
          </div>
          <Link href="/profile">
            <Button
              variant="outline"
              size="sm"
              className="border-green-300 text-green-700 hover:bg-green-100 dark:border-green-600 dark:text-green-300"
            >
              Manage Settings
            </Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  // Show opt-in form
  return (
    <Card className="border-green-200 dark:border-green-700">
      <CardContent className="space-y-4 pt-6 text-center">
        <div className="text-4xl">🙋‍♂️</div>
        <h3 className="text-xl font-semibold text-foreground">
          Step 1: Opt In
        </h3>
        <p className="text-muted-foreground">
          Give permission to include your public tweets in the community
          archive.
        </p>

        {/* Current status */}
        <p className="text-sm text-muted-foreground">
          Signed in as{' '}
          <span className="font-medium text-brand">@{twitterUsername}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Current Status:{' '}
          <span className="font-semibold text-muted-foreground">
            Not Opted In
          </span>
        </p>

        {/* Error and success messages */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-900/20">
            <AlertDescription className="text-green-800 dark:text-green-200">
              {success}
            </AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleOptIn}
          disabled={isLoading}
          className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-400 dark:text-green-950 dark:hover:bg-green-300"
        >
          <Users className="mr-2 h-4 w-4" />
          {isLoading ? 'Processing...' : 'Opt In to Tweet Streaming'}
        </Button>
      </CardContent>
    </Card>
  )
}
