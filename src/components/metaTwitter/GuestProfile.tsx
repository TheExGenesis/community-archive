import Image from 'next/image'
import { Suspense } from 'react'
import BrowsingSignInPrompt from '@/components/BrowsingSignInPrompt'
import GuestProfileSignIn from '@/components/metaTwitter/GuestProfileSignIn'

export default function GuestProfile({
  displayName,
  username,
  bio,
  avatarUrl,
  basePath,
}: {
  displayName: string
  username: string
  bio: string | null
  avatarUrl: string | null
  /** Canonical profile path; the sign-in prompt appends any chapter query. */
  basePath: string
}) {
  const description = `See @${username}’s archived posts and conversations on Community Archive. Log in to view the full profile.`
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-8 pt-4 sm:px-6">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="h-28 bg-brand/10 sm:h-40" />
        <div className="px-6 pb-6 sm:px-8">
          <div className="relative -mt-12 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-card bg-muted text-3xl font-semibold sm:-mt-14 sm:h-28 sm:w-28">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                fill
                unoptimized
                className="object-cover"
                sizes="112px"
              />
            ) : (
              <span aria-hidden="true">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <h1 className="mt-3 break-words text-2xl font-bold text-foreground">
            {displayName}
          </h1>
          <p className="break-words text-muted-foreground">@{username}</p>
          {bio && (
            <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-foreground">
              {bio}
            </p>
          )}
        </div>
        <div className="border-t border-border bg-background/50 p-4 sm:p-6">
          <Suspense
            fallback={
              <BrowsingSignInPrompt
                title="Log in to explore this profile"
                description={description}
                returnTo={basePath}
              />
            }
          >
            <GuestProfileSignIn basePath={basePath} username={username} />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
