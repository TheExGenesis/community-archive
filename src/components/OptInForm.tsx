'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowUpRight, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'

interface OptInFormProps {
  userId: string
  initialOptInStatus: any
  mockOptIn?: boolean
}

export default function OptInForm({
  userId,
  initialOptInStatus,
  mockOptIn = false,
}: OptInFormProps) {
  const router = useRouter()
  const { userMetadata } = useAuthAndArchive()
  const [isOptedIn, setIsOptedIn] = useState(
    initialOptInStatus?.opted_in || false,
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Get Twitter info from authenticated user metadata
  const twitterUsername = userMetadata?.user_name
  const twitterUserId = userMetadata?.provider_id

  const handleSubmit = async () => {
    setError('')

    if (!twitterUsername) {
      setError(
        'Twitter username not found. Please make sure you signed in with Twitter.',
      )
      return
    }

    if (mockOptIn) {
      setIsOptedIn(true)
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/opt-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          username: twitterUsername.toLowerCase(),
          twitterUserId: twitterUserId || null,
          optedIn: !isOptedIn,
          termsVersion: 'v1.0',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update opt-in status')
      }

      setIsOptedIn(!isOptedIn)

      router.refresh()
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!twitterUsername) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <p className="text-red-800 dark:text-red-200">
          No Twitter account found. Please sign in with Twitter to use the
          opt-in feature.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 text-center">
      {/* Current status as simple text */}
      {!isOptedIn && (
        <div className="text-center">
          <p className="text-lg text-muted-foreground">
            Current Status:{' '}
            <span className="font-semibold text-muted-foreground">
              Not Opted In
            </span>
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <Alert variant="destructive" className="mx-auto max-w-md">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main action area */}
      <div className={isOptedIn ? '' : 'py-8'}>
        {!isOptedIn ? (
          <div>
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              size="lg"
              className="min-w-[280px] px-12 py-6 text-xl font-semibold"
            >
              {isLoading ? 'Processing...' : 'Opt In to Tweet Streaming'}
            </Button>
            {mockOptIn && (
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
                Staging preview: this button only changes this page. It will not
                create or update an opt-in record.
              </p>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6 text-left">
            {mockOptIn && (
              <Alert className="border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30">
                <AlertDescription className="text-sky-900 dark:text-sky-100">
                  <strong>Staging preview:</strong> no opt-in record was
                  changed. Refresh this page to test the flow again.
                </AlertDescription>
              </Alert>
            )}

            <section className="rounded-2xl border border-green-200 bg-green-50/60 p-6 shadow-sm dark:border-green-900 dark:bg-green-950/20 sm:p-8">
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/70 dark:text-green-300">
                  <PartyPopper className="h-7 w-7" aria-hidden="true" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Thanks for opting in!
                  </h2>
                  <p className="mx-auto max-w-2xl text-muted-foreground">
                    We&apos;ll keep your public tweets live over time. We still
                    need your archive to backfill older tweets.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Button asChild size="lg">
                  <a
                    href="https://x.com/settings/download_your_data"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Request your X archive
                    <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/#upload-archive">Upload your archive</Link>
                </Button>
              </div>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Not ready to backfill? Continue to your{' '}
                <Link
                  href="/"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  dashboard
                </Link>
                ,{' '}
                <Link
                  href="/bangers"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Bangers
                </Link>{' '}
                or{' '}
                <Link
                  href="/trends"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Trends
                </Link>
                .
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
