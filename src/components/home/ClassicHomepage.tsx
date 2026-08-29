import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import { cookies } from 'next/headers'
import HomepageSearch from '@/components/HomepageSearch'
import Testimonials from '@/components/home/Testimonials'
import type { PortalData } from '@/lib/portal/types'
import { createServerClient } from '@/utils/supabase'
import ExtensionInstallPrompt from '@/components/ExtensionInstallPrompt'
import {
  HomepagePortal,
  HomepagePortalFallback,
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

const DynamicUploadArchiveSection = dynamic(
  () => import('@/components/UploadArchiveSection'),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 w-full animate-pulse rounded-lg bg-muted dark:bg-card" />
    ),
  },
)

interface ClassicHomepageProps {
  data: Promise<PortalData>
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
      <section className="overflow-hidden bg-card pb-16 pt-24 dark:bg-background md:pb-24 md:pt-36">
        <div className="relative z-10 mx-auto w-full max-w-5xl space-y-12 px-4 text-center sm:px-6 md:space-y-16 lg:px-8">
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
                <HomepageStats data={data} />
              </Suspense>
            </p>
          </div>

          {showCta ? (
            <div className="!mt-11 md:!mt-[50px]">
              <DynamicHeroCTAButtons initialIsOptedIn={isOptedIn} />
            </div>
          ) : isMember ? (
            <div className="!mt-11 md:!mt-[50px]">
              <HomepageSearch />
            </div>
          ) : null}

          {/* The backers line is a footnote to the social proof above it. */}
          <div className="!mt-6 md:!mt-[50px]">
            {homepagePeople}

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
          </div>
        </div>
      </section>

      <section className="bg-zinc-100/80 py-4 dark:bg-transparent sm:py-7">
        <Suspense fallback={<HomepagePortalFallback />}>
          <HomepagePortal data={data} isMember={isMember} />
        </Suspense>
      </section>

      <section
        id="upload-archive"
        className="scroll-mt-16 overflow-hidden bg-muted py-12 dark:bg-card md:py-16 lg:py-20"
      >
        <div className="relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          <DynamicUploadArchiveSection />
          <ExtensionInstallPrompt
            surface="home"
            className="mx-auto mt-8 max-w-3xl"
          />
        </div>
      </section>

      <Testimonials />
    </main>
  )
}
