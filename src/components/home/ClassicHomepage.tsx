import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import HomepageSearch from '@/components/HomepageSearch'
import FeaturedCommunityApps from './FeaturedCommunityApps'
import Testimonials from '@/components/home/Testimonials'
import type { HomepageData } from '@/lib/portal/data'
import HomepageUpload from './HomepageUpload'
import { createServerClient } from '@/utils/supabase'
import ExtensionInstallPrompt from '@/components/ExtensionInstallPrompt'
import HexMap from './hero/HexMap'
import StoryColumn from './hero/StoryColumn'
import {
  HomepagePortal,
  HomepageStats,
} from '@/components/home/HomepageDataSections'

const DynamicHeroCTAButtons = dynamic(
  () => import('@/components/HeroCTAButtons'),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col justify-center gap-4">
        <div className="h-14 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-14 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-14 w-48 animate-pulse rounded-lg bg-muted" />
      </div>
    ),
  },
)

interface ClassicHomepageProps {
  data: HomepageData
  isMember: boolean
  showCta: boolean
}

export default async function ClassicHomepage({
  data,
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
      <section className="overflow-hidden bg-card pb-8 pt-10 dark:bg-background md:pb-10 md:pt-14">
        <div className="relative z-10 mx-auto w-full max-w-[1664px] space-y-8 px-4 text-center sm:px-6 md:space-y-10 lg:px-8">
          <div className="space-y-4">
            <h1 className="text-5xl font-bold tracking-tight text-foreground md:text-6xl">
              Community Archive
            </h1>
            <p className="text-xl leading-8 text-muted-foreground">
              <Suspense
                fallback={
                  <>
                    We preserve public conversations as open source
                    infrastructure.
                  </>
                }
              >
                <HomepageStats data={data.globalStats} />
              </Suspense>
            </p>
          </div>

          <HomepageSearch />

          <HexMap
            stories={
              <Suspense
                fallback={
                  <div className="p-6 text-sm text-muted-foreground">
                    Loading community stories…
                  </div>
                }
              >
                <StoryColumn />
              </Suspense>
            }
            actions={
              showCta ? (
                <DynamicHeroCTAButtons initialIsOptedIn={isOptedIn} compact />
              ) : (
                <Link
                  href="#upload-archive"
                  className="inline-flex rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
                >
                  Add your archive ↗
                </Link>
              )
            }
          />

          <div className="!mt-5">
            <p className="mt-1 text-xs text-muted-foreground/80">
              Backed by{' '}
              <Link
                href="https://survivalandflourishing.fund/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium transition-colors hover:text-brand"
              >
                Survival and Flourishing Fund
              </Link>{' '}
              and{' '}
              <Link
                href="https://x.com/VitalikButerin"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium transition-colors hover:text-brand"
              >
                Vitalik Buterin
              </Link>
            </p>
            <Link
              href="#daily-digest"
              className="mt-5 inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-medium text-brand-deep transition-colors hover:bg-brand/20"
            >
              Read the daily digest ↓
            </Link>
          </div>
        </div>
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
