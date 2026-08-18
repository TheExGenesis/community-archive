'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'

const nextSteps = [
  {
    href: '/',
    imageSrc: '/images/featured/dashboard.jpg',
    imageAlt: 'Community Archive dashboard preview',
    title: 'Dashboard',
  },
  {
    href: '/bangers',
    imageSrc: '/images/featured/bangers-current.jpg',
    imageAlt: 'Bangers tweet rankings preview',
    title: 'Bangers',
  },
  {
    href: '/trends',
    imageSrc: '/images/featured/trends.jpg',
    imageAlt: 'Community Archive trends preview',
    title: 'Trends',
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

  return !isOptedIn ? (
    <section className="rounded-lg bg-card p-6 text-center shadow-lg md:p-8">
      <div className="mb-8">
        <h1 className="mb-4 text-4xl font-bold text-foreground">
          Tweet Streaming Opt-In
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Allow your public tweets to be automatically preserved in the
          Community Archive through our browser extension for historical and
          research purposes.
        </p>
      </div>

      <p className="text-lg text-muted-foreground">
        Current Status:{' '}
        <span className="font-semibold text-muted-foreground">
          Not Opted In
        </span>
      </p>

      {error && (
        <Alert variant="destructive" className="mx-auto mt-8 max-w-md">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="py-8">
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
      </div>

      <div className="border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          By opting in, you agree to our{' '}
          <Link href="/data-policy" className="text-brand hover:underline">
            Data Policy
          </Link>
          . Your public tweets will be archived and may persist even after
          deletion from Twitter/X.
        </p>
      </div>
    </section>
  ) : (
    <section className="mx-auto max-w-4xl overflow-hidden rounded-lg border border-green-200 bg-green-50/60 p-6 text-left shadow-sm dark:border-green-900 dark:bg-green-950/20 sm:p-8">
      {mockOptIn && (
        <Alert className="mb-6 border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30">
          <AlertDescription className="text-sky-900 dark:text-sky-100">
            <strong>Staging preview:</strong> no opt-in record was changed.
            Refresh this page to test the flow again.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/70 dark:text-green-300">
          <PartyPopper className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Thanks for opting in!
          </h1>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            We&apos;ll keep your public tweets live from now on.
          </p>
        </div>
        <p className="mx-auto max-w-2xl text-xs leading-5 text-muted-foreground">
          By opting in, you agree to our{' '}
          <Link
            href="/data-policy"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Data Policy
          </Link>
          . You can opt out in your{' '}
          <Link
            href="/settings"
            className="font-medium text-foreground underline underline-offset-4"
          >
            profile
          </Link>
          .
        </p>
      </div>

      <div className="mt-8 border-y border-green-200 py-8 dark:border-green-900">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            We still need your archive to preserve your earlier tweets.
          </h2>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            Opting in lets us archive your public tweets starting now, but it
            can&apos;t reach tweets you posted before today. Uploading your
            archive makes your past tweets searchable and helps them inform
            trend mapping and historical analysis. That&apos;s really helpful to
            us and to the people building on the archive.
          </p>
        </div>

        <ol className="mx-auto mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
          <li className="flex h-full flex-col items-center rounded-lg border border-green-200 bg-background p-5 text-center dark:border-green-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-lg font-bold text-green-700 dark:bg-green-900/70 dark:text-green-300">
              1
            </div>
            <h3 className="mt-4 font-semibold">Request your X archive</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
              Ask X for a copy of your data. They&apos;ll email you in a few
              days when it&apos;s ready to download.
            </p>
            <Button asChild size="lg" className="mt-5">
              <a
                href="https://x.com/settings/download_your_data"
                target="_blank"
                rel="noopener noreferrer"
              >
                Request your archive
                <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </li>

          <li className="flex h-full flex-col items-center rounded-lg border border-green-200 bg-background p-5 text-center dark:border-green-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-lg font-bold text-green-700 dark:bg-green-900/70 dark:text-green-300">
              2
            </div>
            <h3 className="mt-4 font-semibold">Upload your archive</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
              When it arrives, upload the .zip file to add your earlier tweets
              to the Community Archive.
            </p>
            <Button asChild variant="outline" size="lg" className="mt-5">
              <Link href="/#upload-archive">Upload your archive</Link>
            </Button>
          </li>
        </ol>
      </div>

      <div className="mt-8 space-y-4">
        <p className="text-center text-sm text-muted-foreground">
          Not ready to upload? Continue to your dashboard, Bangers, or Trends.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {nextSteps.map((step) => (
            <Link
              key={step.href}
              href={step.href}
              className="group overflow-hidden rounded-lg border bg-background shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="relative aspect-video overflow-hidden border-b bg-muted">
                <Image
                  src={step.imageSrc}
                  alt={step.imageAlt}
                  fill
                  sizes="(min-width: 640px) 240px, 100vw"
                  className="object-cover object-top transition duration-300 group-hover:scale-[1.02]"
                />
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <h2 className="font-semibold">{step.title}</h2>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden="true"
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
