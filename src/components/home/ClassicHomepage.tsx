import { PreviewHeroActions } from '@/components/PreviewSession'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import { cookies } from 'next/headers'
import HexHero from './hero/HexHero'
import styles from './classicHomepage.module.css'
import ExploreArchivePill from './ExploreArchivePill'
import HomepageSearch from '@/components/HomepageSearch'
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
      <div className="flex flex-wrap justify-center gap-2 sm:gap-4">
        <div className="h-9 w-24 animate-pulse rounded-lg bg-muted sm:h-10 sm:w-36" />
        <div className="h-9 w-24 animate-pulse rounded-lg bg-muted sm:h-10 sm:w-36" />
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
      <section
        className={`${styles.intro} overflow-hidden bg-card pb-[72px] pt-12 dark:bg-background md:pb-[88px] md:pt-16`}
      >
        <div
          className={`${styles.content} relative z-10 mx-auto w-full max-w-5xl space-y-6 px-4 text-center sm:px-6 md:space-y-8 lg:px-8`}
        >
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
              Community Archive
            </h1>
            <p className="text-base leading-6 text-muted-foreground sm:text-xl sm:leading-8">
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

          <PreviewHeroActions
            actual={
              showCta ? (
                <div className={`${styles.actions} !mt-7 md:!mt-8`}>
                  <DynamicHeroCTAButtons initialIsOptedIn={isOptedIn} />
                </div>
              ) : (
                <div className="!mt-7 md:!mt-8">
                  <HomepageSearch />
                </div>
              )
            }
            signedIn={
              <div className="!mt-7 md:!mt-8">
                <HomepageSearch />
              </div>
            }
            signedOut={
              <div
                className={`${styles.actions} !mt-7 flex justify-center gap-4 md:!mt-8`}
              >
                <Link
                  className="rounded-lg bg-brand px-6 py-2 text-white"
                  href="/login?redirect=%2F%3Faction%3Doptin"
                >
                  Opt in
                </Link>
                <Link
                  className="rounded-lg border px-6 py-2"
                  href="#upload-archive"
                >
                  Upload archive
                </Link>
              </div>
            }
          />

          {/* The backers line is a footnote to the social proof above it. */}
          <div className="!mt-6 md:!mt-8">
            <div className={styles.people}>{homepagePeople}</div>

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
            <ExploreArchivePill />
          </div>
        </div>
      </section>

      <HexHero
        stats={
          <Suspense fallback={<>Preserving public conversations.</>}>
            <HomepageStats data={data.globalStats} />
          </Suspense>
        }
      />

      <section className="bg-zinc-100/80 py-4 dark:bg-transparent sm:py-7">
        <HomepagePortal data={data} isMember={isMember} />
      </section>

      <FeaturedCommunityApps />

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

      <Testimonials />
    </main>
  )
}
