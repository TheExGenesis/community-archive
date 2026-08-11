'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'

const recommendations = [
  {
    href: '/bangers',
    imageSrc: '/images/featured/bangers.png',
    imageAlt: 'Bangers community tweet rankings preview',
    title: 'Bangers',
    description:
      'Browse the community’s standout tweets—the posts that archive members quote most.',
  },
  {
    href: '/trends',
    imageSrc: '/images/featured/trends.png',
    imageAlt: 'Community Archive keyword trends explorer preview',
    title: 'Keyword trends',
    description:
      'See how words, phrases, and ideas rise and fall across the archive over time.',
  },
]

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
          <div className="mx-auto max-w-3xl space-y-10 text-left">
            {mockOptIn && (
              <Alert className="border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30">
                <AlertDescription className="text-sky-900 dark:text-sky-100">
                  <strong>Staging preview:</strong> no opt-in record was
                  changed. Refresh this page to test the flow again.
                </AlertDescription>
              </Alert>
            )}

            <section className="overflow-hidden rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 via-background to-sky-50 p-6 shadow-sm dark:border-green-900 dark:from-green-950/40 dark:via-background dark:to-sky-950/30 sm:p-8">
              <div className="space-y-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/70 dark:text-green-300">
                  <PartyPopper className="h-7 w-7" aria-hidden="true" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Yay—thank you so much for opting in!
                  </h2>
                  <p className="mx-auto max-w-2xl text-muted-foreground">
                    That&apos;s already a big help. We&apos;ll archive your
                    public tweets going forward.
                  </p>
                </div>
              </div>

              <div className="mt-8 rounded-xl border bg-background/80 p-5 text-left shadow-sm sm:p-6">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">
                    Bring your past tweets with you
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground sm:text-base">
                    We&apos;re still missing your past tweets. Upload your X
                    archive once to backfill them, and after that you&apos;ll
                    never need to upload again.
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground sm:text-base">
                    First, request your archive from X. They&apos;ll let you
                    know when it&apos;s ready; then you can{' '}
                    <Link
                      href="/#upload-archive"
                      className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                    >
                      upload it here
                    </Link>
                    .
                  </p>
                </div>

                <div className="mt-5">
                  <Button asChild size="lg">
                    <a
                      href="https://x.com/settings/download_your_data"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Request your X archive
                      <ArrowUpRight
                        className="ml-2 h-4 w-4"
                        aria-hidden="true"
                      />
                    </a>
                  </Button>
                </div>

                <p className="mt-5 text-sm text-muted-foreground">
                  Don&apos;t want to do that right now? That&apos;s completely
                  fine. Your opt-in still helps.
                </p>
              </div>
            </section>

            <section
              aria-labelledby="explore-next-heading"
              className="space-y-5"
            >
              <div className="space-y-1 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  In the meantime, here are two fun places to start.
                </p>
                <h2 id="explore-next-heading" className="text-2xl font-bold">
                  Explore the community archive
                </h2>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                {recommendations.map((recommendation) => (
                  <Link
                    key={recommendation.href}
                    href={recommendation.href}
                    className="group overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <div className="relative aspect-[3/1] overflow-hidden border-b bg-muted">
                      <Image
                        src={recommendation.imageSrc}
                        alt={recommendation.imageAlt}
                        fill
                        sizes="(min-width: 640px) 360px, 100vw"
                        className="object-cover object-top transition duration-300 group-hover:scale-[1.02]"
                      />
                    </div>
                    <div className="space-y-1.5 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold">
                          {recommendation.title}
                        </h3>
                        <ArrowUpRight
                          className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {recommendation.description}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <div className="text-center">
              <Button asChild variant="outline" size="lg">
                <Link href="/profile">Manage privacy settings</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
