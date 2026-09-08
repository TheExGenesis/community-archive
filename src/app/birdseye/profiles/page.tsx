import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getBirdseyeProfiles } from '@/lib/community-apps/birdseye-access'
import { ProfilePicker } from '@/components/birdseye/ProfilePicker'
export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Choose a Birdseye profile',
  robots: { index: false, follow: false },
}
export default async function ProfilesPage() {
  const profiles = await getBirdseyeProfiles()
  if (!profiles.length) notFound()
  return (
    <main className="ph-no-capture mx-auto min-h-[75vh] max-w-4xl px-6 py-10">
      <Link href="/community" className="text-xs text-brand">
        ← Community Apps
      </Link>
      <h1 className="mb-3 mt-6 font-sans text-3xl font-bold">
        Explore a Birdseye profile
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Admin access · {profiles.length} available saved analyses. These
        profiles remain private.
      </p>
      <ProfilePicker profiles={profiles} />
    </main>
  )
}
