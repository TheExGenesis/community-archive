import type { Metadata } from 'next'
import Link from 'next/link'
import {
  getBirdseyeProfiles,
  loadAccessibleBirdseye,
} from '@/lib/community-apps/birdseye-access'
import { BirdseyeView } from '@/components/birdseye/BirdseyeView'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const metadata: Metadata = {
  title: 'Birdseye · Community Archive',
  description: 'A private view of your archive by topic.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
export default async function BirdseyePage({
  searchParams,
}: {
  searchParams: { username?: string; cluster_id?: string }
}) {
  const username =
    typeof searchParams.username === 'string'
      ? searchParams.username
      : undefined
  const profiles = await getBirdseyeProfiles()
  const access = await loadAccessibleBirdseye(username || profiles[0])
  if (!access)
    return (
      <main className="mx-auto min-h-[70vh] max-w-xl px-6 py-16">
        <Link href="/community" className="text-sm text-brand">
          ← Community Apps
        </Link>
        <p className="mb-3 mt-10 text-xs font-semibold uppercase tracking-widest text-brand">
          Birdseye · Experimental
        </p>
        <h1 className="text-4xl font-bold">Your archive, in perspective.</h1>
        <p className="mt-5 leading-7 text-muted-foreground">
          Birdseye is private by default. Sign in to view your own saved
          analysis, or use a share link from its owner.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Analyses are currently available for a limited set of archives.
        </p>
        <div className="mt-7 flex gap-4">
          <Link
            href="/login?redirect=%2Fbirdseye"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
          >
            Sign in
          </Link>
          <Link href="/birdseye" className="px-3 py-2 text-sm text-brand">
            My Birdseye
          </Link>
        </div>
      </main>
    )
  return (
    <BirdseyeView
      {...access}
      profiles={profiles}
      selectedId={
        typeof searchParams.cluster_id === 'string'
          ? searchParams.cluster_id
          : undefined
      }
    />
  )
}
