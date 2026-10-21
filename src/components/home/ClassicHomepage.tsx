import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import { cookies } from 'next/headers'
import HexHero from './hero/HexHero'
import HeroTrends from './hero/HeroTrends'
import FeaturedCommunityApps from './FeaturedCommunityApps'
import Testimonials from '@/components/home/Testimonials'
import type { HomepageData } from '@/lib/portal/data'
import HomepageUpload from './HomepageUpload'
import { createServerClient } from '@/utils/supabase'
import ExtensionInstallPrompt from '@/components/ExtensionInstallPrompt'
import {
  HomepagePortal,
  HomepageStats,
} from '@/components/home/HomepageDataSections'

const DynamicHeroCTAButtons = dynamic(
  () => import('@/components/HeroCTAButtons'),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col justify-center gap-4 sm:flex-row sm:gap-6">
        <div className="h-14 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-14 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-14 w-48 animate-pulse rounded-lg bg-muted" />
      </div>
    ),
  },
)

interface ClassicHomepageProps {
  data: HomepageData
  homepagePeople: ReactNode
  isMember: boolean
  showCta: boolean
}

export default async function ClassicHomepage({
  data,
  homepagePeople,
  isMember,
  showCta,
}: ClassicHomepageProps) {
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)

  let isOptedIn = false
  if (showCta && isMember) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { data: optInData, error } = await supabase
        .from('optin')
        .select('opted_in')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) console.error('Failed to fetch homepage opt-in status:', error)
      isOptedIn = optInData?.opted_in ?? false
    }
  }

  return (
    <main>
      <HexHero
        stats={
          <Suspense fallback={<>Preserving public conversations.</>}>
            <HomepageStats data={data.globalStats} />
          </Suspense>
        }
        trends={
          <Suspense fallback={null}>
            <HeroTrends data={data.trends} />
          </Suspense>
        }
      />
      <section
        className="mx-auto max-w-5xl space-y-5 px-4 py-6 text-center"
        aria-label="Join the archive"
      >
        {showCta && <DynamicHeroCTAButtons initialIsOptedIn={isOptedIn} />}
        {homepagePeople}
        <p className="text-xs text-muted-foreground">
          Backed by{' '}
          <Link
            href="https://survivalandflourishing.fund/"
            className="hover:underline"
          >
            Survival and Flourishing Fund
          </Link>{' '}
          and{' '}
          <Link href="https://x.com/VitalikButerin" className="hover:underline">
            Vitalik Buterin
          </Link>
          .
        </p>
      </section>

      <section className="bg-zinc-100/80 py-4 dark:bg-transparent sm:py-7">
        <HomepagePortal data={data} isMember={isMember} />
      </section>

      <section
        id="upload-archive"
        className="scroll-mt-16 overflow-hidden bg-muted py-12 dark:bg-card md:py-16 lg:py-20"
      >
        <div className="relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          <HomepageUpload />
          <ExtensionInstallPrompt
            surface="home"
            className="mx-auto mt-8 max-w-3xl"
          />
        </div>
      </section>

      <FeaturedCommunityApps />
      <Testimonials />
    </main>
  )
}
