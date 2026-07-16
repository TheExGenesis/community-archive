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
import { formatNumber } from '@/lib/formatNumber'

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
}) => {
  const isExternal = href.startsWith('http')

  return (
    <Link
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="flex-shrink-0 text-2xl text-brand">{icon}</div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </Link>
  )
}

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

  const socialProof = (
    <div className="mx-auto w-full max-w-3xl">
      {mostFollowed.length > 0 ? (
        <AvatarList initialAvatars={mostFollowed} compact />
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Featured archives are currently unavailable.
        </p>
      )}
    </div>
  )

  return (
    <main>
      {/* Section 1: Audience-specific hero */}
      <section
        className={`overflow-hidden bg-card pb-12 pt-14 dark:bg-background md:pb-16 md:pt-20 ${
          isOptedIn ? 'md:flex md:min-h-[66vh] md:items-center' : ''
        }`}
      >
        <div className={`${contentWrapperClasses} space-y-7 text-center`}>
          <div className="space-y-3">
            <h1 className="text-5xl font-bold tracking-tight text-foreground md:text-6xl">
              Community Archive
            </h1>
            <p className="text-xl leading-8 text-muted-foreground">
              {stats.tweetCount !== null && stats.userCount !== null ? (
                <>
                  We preserve{' '}
                  <strong className="font-semibold text-foreground">
                    {formatNumber(stats.tweetCount)} public tweets
                  </strong>{' '}
                  from{' '}
                  <strong className="font-semibold text-foreground">
                    {formatNumber(stats.userCount)} community members
                  </strong>
                  .
                </>
              ) : (
                <>
                  We preserve public conversations as open source public
                  infrastructure.
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground/80">
              Backed by{' '}
              <Link
                href="https://survivalandflourishing.fund/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-muted-foreground transition-colors hover:text-brand hover:underline"
              >
                Survival and Flourishing Fund
              </Link>{' '}
              and{' '}
              <Link
                href="https://x.com/VitalikButerin"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-muted-foreground transition-colors hover:text-brand hover:underline"
              >
                Vitalik Buterin
              </Link>
            </p>
          </div>

          {isOptedIn ? (
            <HomepageSearch />
          ) : (
            <>
              <DynamicHeroCTAButtons initialIsOptedIn={false} />
              <div className="pt-8 md:pt-10">{socialProof}</div>
            </>
          )}
        </div>
      </section>

      {/* Section 2: Explore the archive - Featured Apps */}
      <section
        id="products"
        className={`bg-muted dark:bg-card ${sectionPaddingClasses} scroll-mt-16 overflow-hidden`}
      >
        <div className={contentWrapperClasses}>
          <FeaturedAppsSection />
          <AppGallery />
        </div>
      </section>

      {isOptedIn ? (
        <section className="overflow-hidden bg-card py-12 dark:bg-background md:py-16">
          <div className={`${contentWrapperClasses} text-center`}>
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">
              Fill the gaps in the public record
            </h2>
            <p className="mx-auto mb-8 mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              We refresh recent tweets every day. Upload your X archive to
              backfill older posts, then use the extension to contribute new
              tweets in real time while you browse.
            </p>
            <DynamicHeroCTAButtons initialIsOptedIn />
            <div className="mt-10 md:mt-12">{socialProof}</div>
          </div>
        </section>
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
              href="/docs"
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
