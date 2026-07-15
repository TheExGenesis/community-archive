import CommunityStats from '@/components/CommunityStats'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import AvatarList from '@/components/AvatarList'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  FaGithub,
  FaDiscord,
  FaBook,
  FaHeart,
  FaDatabase,
} from 'react-icons/fa'
import Link from 'next/link'
import { getStats } from '@/lib/stats'
import TieredSupportersDisplay, {
  Contributor,
} from '@/components/TieredSupportersDisplay'
import dynamic from 'next/dynamic'
import FeaturedAppsSection from '@/components/FeaturedAppsSection'
import AppGallery from '@/components/AppGallery'
import HomepageSearch from '@/components/HomepageSearch'
import { canShowHomepageSearch } from '@/lib/homepageAccess'

export const revalidate = 60 // Cache for 60s to reduce server load from scrapers

// Dynamically import client components with ssr disabled
const DynamicHeroCTAButtons = dynamic(
  () => import('@/components/HeroCTAButtons'),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col justify-center gap-4 sm:flex-row sm:gap-6">
        <div className="h-14 w-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-14 w-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-14 w-48 animate-pulse rounded-xl bg-muted" />
      </div>
    ),
  },
)

const DynamicUploadArchiveSection = dynamic(
  () => import('@/components/UploadArchiveSection'),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 w-full animate-pulse rounded-xl bg-muted dark:bg-card" />
    ),
  },
)

const getMostFollowedAccounts = async (supabase: SupabaseClient) => {
  let { data, error } = await supabase
    .from('global_activity_summary')
    .select('top_accounts_with_followers')
    .single()

  if (error) {
    console.error('Failed to fetch top accounts:', error)
    return []
  }
  return data?.top_accounts_with_followers || []
}

async function getOpenCollectiveContributors(): Promise<Contributor[]> {
  try {
    const res = await fetch(
      'https://opencollective.com/community-archive/members/all.json',
      { next: { revalidate: 3600 } },
    )
    if (!res.ok) {
      console.error(`Failed to fetch Open Collective data: ${res.status}`)
      return []
    }
    const members: any[] = await res.json()

    members.sort((a, b) => {
      const amountA =
        typeof a.totalAmountDonated === 'number' ? a.totalAmountDonated : 0
      const amountB =
        typeof b.totalAmountDonated === 'number' ? b.totalAmountDonated : 0
      if (amountB !== amountA) {
        return amountB - amountA
      }
      return a.name.localeCompare(b.name)
    })

    return members
      .filter(
        (m) =>
          m.isActive &&
          m.role !== 'ADMIN' &&
          (m.role === 'BACKER' ||
            (m.role === 'MEMBER' &&
              typeof m.totalAmountDonated === 'number' &&
              m.totalAmountDonated > 0)),
      )
      .map((m) => ({
        name: m.name,
        role: m.role,
        type: m.type,
        isActive: m.isActive,
        profile: m.profile,
        image: m.image || null,
        slug: m.slug,
        totalAmountDonated:
          typeof m.totalAmountDonated === 'number' ? m.totalAmountDonated : 0,
      }))
  } catch (error) {
    console.error('Error fetching Open Collective contributors:', error)
    return []
  }
}

interface InfoPanelProps {
  icon: React.ReactElement
  title: string
  description: string
  href: string
}

const InfoPanel: React.FC<InfoPanelProps> = ({
  icon,
  title,
  description,
  href,
}) => (
  <Link
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
  >
    <div className="flex-shrink-0 text-2xl text-brand">{icon}</div>
    <div className="min-w-0 flex-1">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  </Link>
)

export default async function Homepage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let optedInStatus: boolean | null = null
  if (user) {
    const { data: optInData, error: optInError } = await supabase
      .from('optin')
      .select('opted_in')
      .eq('user_id', user.id)
      .maybeSingle()

    if (optInError) {
      console.error('Failed to fetch homepage opt-in status:', optInError)
    }

    optedInStatus = optInData?.opted_in ?? false
  }

  const isOptedIn = canShowHomepageSearch(user?.id, optedInStatus)

  const mostFollowed = (await getMostFollowedAccounts(supabase)).slice(0, 7)
  const financialContributors = await getOpenCollectiveContributors()

  const totalAmountRaised = financialContributors.reduce(
    (sum, contributor) => sum + contributor.totalAmountDonated,
    0,
  )
  const totalSupportersCount = financialContributors.length

  const contributorsWithImages = financialContributors.filter((c) => c.image)
  const highestDonorWithImage =
    contributorsWithImages.length > 0 ? contributorsWithImages[0] : null
  const otherDonorsForStack = contributorsWithImages.slice(1, 10)

  const topTenFinancialContributors = financialContributors.slice(0, 10)
  const topTenNames = topTenFinancialContributors.map((c) => c.name)
  const additionalSupportersCount = Math.max(
    0,
    financialContributors.length - topTenNames.length,
  )

  const stats = await getStats(supabase).catch((error) => {
    console.error('Failed to fetch stats for homepage:', error)
    return {
      userCount: null,
      tweetCount: null,
      userMentionsCount: null,
    }
  })

  const sectionPaddingClasses = 'py-12 md:py-16 lg:py-20'
  const contentWrapperClasses =
    'w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10'

  const socialProofSection = (
    <section
      className={`overflow-hidden bg-card dark:bg-background ${
        isOptedIn ? 'py-12 md:py-16' : ''
      }`}
    >
      <div className="mx-auto max-w-5xl space-y-4 rounded-none bg-muted p-6 text-center dark:bg-card sm:rounded-xl md:p-8">
        <CommunityStats
          userCount={stats.userCount}
          tweetCount={stats.tweetCount}
          showGoal={false}
        />
        {mostFollowed.length > 0 ? (
          <AvatarList initialAvatars={mostFollowed} />
        ) : (
          <p className="mt-4 text-center text-muted-foreground">
            Featured archives are currently unavailable.
          </p>
        )}
      </div>
    </section>
  )

  return (
    <main>
      {/* Section 1: Audience-specific hero */}
      <section
        className={`overflow-hidden bg-card dark:bg-background ${
          isOptedIn
            ? 'pb-20 pt-20 md:pb-28 md:pt-28'
            : 'pb-12 pt-16 md:pb-16 md:pt-24'
        }`}
      >
        <div className={`${contentWrapperClasses} space-y-10 text-center`}>
          <div className="space-y-4">
            <h1 className="text-5xl font-bold tracking-tight text-foreground md:text-6xl">
              {isOptedIn ? 'Search the archive' : 'Community Archive'}
            </h1>
            <p className="text-xl leading-8 text-muted-foreground">
              {isOptedIn ? (
                <>
                  Find public conversations, people, and ideas across millions
                  of archived tweets.
                </>
              ) : (
                <>
                  Join the archive to preserve public conversations for open
                  research and help build open source public infrastructure.
                </>
              )}
            </p>
          </div>

          {isOptedIn ? (
            <HomepageSearch />
          ) : (
            <div className="space-y-4 pt-2">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Help grow the archive
              </p>
              <DynamicHeroCTAButtons initialIsOptedIn={false} />
              <p className="text-sm text-muted-foreground">
                Backed by Survival and Flourishing Fund and Vitalik Buterin
              </p>
            </div>
          )}
        </div>
      </section>

      {!isOptedIn ? socialProofSection : null}

      {/* Section 2: Explore the archive - Featured Apps */}
      <section
        id="products"
        className={`bg-card dark:bg-background ${sectionPaddingClasses} scroll-mt-16 overflow-hidden`}
      >
        <div className={contentWrapperClasses}>
          <FeaturedAppsSection />
          <AppGallery />
        </div>
      </section>

      {isOptedIn ? (
        <>
          {socialProofSection}
          <section className="overflow-hidden bg-card pb-12 dark:bg-background md:pb-16">
            <div className={`${contentWrapperClasses} space-y-4 text-center`}>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Keep the archive growing
              </p>
              <DynamicHeroCTAButtons initialIsOptedIn />
              <p className="text-sm text-muted-foreground">
                Backed by Survival and Flourishing Fund and Vitalik Buterin
              </p>
            </div>
          </section>
        </>
      ) : null}

      {/* Section 3: Upload Your Archive */}
      <section
        id="upload-archive"
        className={`bg-muted dark:bg-card ${sectionPaddingClasses} scroll-mt-16 overflow-hidden`}
      >
        <div className={contentWrapperClasses}>
          <DynamicUploadArchiveSection />
        </div>
      </section>

      {/* Section 4: Data & Source Code */}
      <section
        className={`bg-card dark:bg-background ${sectionPaddingClasses} overflow-hidden`}
      >
        <div className={`${contentWrapperClasses} space-y-8`}>
          <div className="text-center">
            <h2 className="text-3xl font-bold text-foreground">
              Data & Source Code
            </h2>
            <p className="mx-auto mt-3 max-w-xl px-4 text-base text-muted-foreground md:px-0">
              Access the data, explore the code, and see how everything works.
            </p>
          </div>
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoPanel
              icon={<FaGithub />}
              title="GitHub"
              description="Source code and contributions"
              href="https://github.com/TheExGenesis/community-archive"
            />
            <InfoPanel
              icon={<FaDiscord />}
              title="Discord"
              description="Join the community"
              href="https://discord.gg/RArTGrUawX"
            />
            <InfoPanel
              icon={<FaBook />}
              title="Documentation"
              description="API docs and examples"
              href="https://github.com/TheExGenesis/community-archive/tree/main/docs"
            />
            <InfoPanel
              icon={<FaDatabase />}
              title="Data Dump"
              description="Download the full dataset"
              href="https://github.com/TheExGenesis/community-archive/releases/tag/data_export"
            />
          </div>
        </div>
      </section>

      {/* Section 5: Our Supporters */}
      <section
        className={`bg-muted dark:bg-card ${sectionPaddingClasses} overflow-hidden`}
      >
        <div className={`${contentWrapperClasses} space-y-8`}>
          <div className="text-center">
            <h2 className="text-3xl font-bold text-foreground">
              Our Supporters
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Thanks to everyone who makes this possible
            </p>
          </div>

          {/* Main supporters card */}
          <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-card p-6 md:p-8">
            {/* Major Backers */}
            <div className="mb-6 text-center">
              <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Major Backers
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
                <Link
                  href="https://survivalandflourishing.fund/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base font-medium text-muted-foreground transition-colors hover:text-brand"
                >
                  Survival and Flourishing Fund
                </Link>
                <span className="text-muted-foreground">•</span>
                <span className="text-base font-medium text-muted-foreground">
                  <Link
                    href="https://x.com/VitalikButerin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-brand"
                  >
                    Vitalik Buterin
                  </Link>{' '}
                  via{' '}
                  <Link
                    href="https://kanro.fi/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-brand"
                  >
                    Kanro
                  </Link>
                </span>
                <span className="text-muted-foreground">•</span>
                <Link
                  href="https://x.com/pwang"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base font-medium text-muted-foreground transition-colors hover:text-brand"
                >
                  Peter Wang
                </Link>
              </div>
            </div>

            {/* Divider */}
            <div className="my-6 border-t border-border"></div>

            {/* Community Supporters */}
            <div className="mb-4 text-center">
              <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Community Backers
              </p>
            </div>
            <TieredSupportersDisplay
              highestDonorWithImage={highestDonorWithImage}
              otherDonorsForStack={otherDonorsForStack}
              topTenNames={topTenNames}
              additionalSupportersCount={additionalSupportersCount}
              totalAmountRaised={totalAmountRaised}
              totalSupportersCount={totalSupportersCount}
            />
          </div>

          {/* Donate button */}
          <div className="text-center">
            <Link
              href="https://opencollective.com/community-archive/donate"
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="inline-flex items-center justify-center rounded-xl bg-green-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-green-700 dark:bg-green-400 dark:text-green-950 dark:hover:bg-green-300">
                <FaHeart className="mr-2" /> Support the Project
              </button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
