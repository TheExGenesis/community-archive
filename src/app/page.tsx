import CommunityStats from '@/components/CommunityStats'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import AvatarList from '@/components/AvatarList'
import { SupabaseClient } from '@supabase/supabase-js'
import { FaGithub, FaDiscord, FaBook, FaHeart } from 'react-icons/fa'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { getStats } from '@/lib/stats'
import TieredSupportersDisplay, { Contributor } from '@/components/TieredSupportersDisplay'
import dynamic from 'next/dynamic'
import FeaturedAppsSection from '@/components/FeaturedAppsSection'
import AppGallery from '@/components/AppGallery'

export const revalidate = 0

// Dynamically import client components with ssr disabled
const DynamicHeroCTAButtons = dynamic(() => import('@/components/HeroCTAButtons'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center">
      <div className="h-14 w-48 bg-gray-200 dark:bg-slate-700 rounded-xl animate-pulse" />
      <div className="h-14 w-48 bg-gray-200 dark:bg-slate-700 rounded-xl animate-pulse" />
    </div>
  ),
})

const DynamicUploadArchiveSection = dynamic(() => import('@/components/UploadArchiveSection'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-48 bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse" />
  ),
})

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
    const res = await fetch('https://opencollective.com/community-archive/members/all.json', { next: { revalidate: 3600 } })
    if (!res.ok) {
      console.error(`Failed to fetch Open Collective data: ${res.status}`)
      return []
    }
    const members: any[] = await res.json()

    members.sort((a, b) => {
      const amountA = typeof a.totalAmountDonated === 'number' ? a.totalAmountDonated : 0
      const amountB = typeof b.totalAmountDonated === 'number' ? b.totalAmountDonated : 0
      if (amountB !== amountA) {
        return amountB - amountA
      }
      return a.name.localeCompare(b.name)
    })

    return members
      .filter(m =>
        m.isActive &&
        m.role !== 'ADMIN' &&
        (m.role === 'BACKER' || (m.role === 'MEMBER' && typeof m.totalAmountDonated === 'number' && m.totalAmountDonated > 0))
      )
      .map(m => ({
        name: m.name,
        role: m.role,
        type: m.type,
        isActive: m.isActive,
        profile: m.profile,
        image: m.image || null,
        slug: m.slug,
        totalAmountDonated: typeof m.totalAmountDonated === 'number' ? m.totalAmountDonated : 0
      }))
  } catch (error) {
    console.error("Error fetching Open Collective contributors:", error)
    return []
  }
}

interface InfoPanelProps {
  icon: React.ReactElement
  title: string
  description: string
  href: string
}

const InfoPanel: React.FC<InfoPanelProps> = ({ icon, title, description, href }) => (
  <Link
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="group flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700"
  >
    <div className="text-2xl text-blue-500 dark:text-blue-400 flex-shrink-0">
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  </Link>
)

export default async function Homepage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const mostFollowed = (await getMostFollowedAccounts(supabase)).slice(0, 7)
  const financialContributors = await getOpenCollectiveContributors()

  const totalAmountRaised = financialContributors.reduce((sum, contributor) => sum + contributor.totalAmountDonated, 0)
  const totalSupportersCount = financialContributors.length

  const contributorsWithImages = financialContributors.filter(c => c.image)
  const highestDonorWithImage = contributorsWithImages.length > 0 ? contributorsWithImages[0] : null
  const otherDonorsForStack = contributorsWithImages.slice(1, 10)

  const topTenFinancialContributors = financialContributors.slice(0, 10)
  const topTenNames = topTenFinancialContributors.map(c => c.name)
  const additionalSupportersCount = Math.max(0, financialContributors.length - topTenNames.length)

  const stats = await getStats(supabase).catch((error) => {
    console.error('Failed to fetch stats for homepage:', error)
    return {
      accountCount: null,
      tweetCount: null,
      likedTweetCount: null,
      userMentionsCount: null,
    }
  })

  const sectionPaddingClasses = "py-12 md:py-16 lg:py-20"
  const contentWrapperClasses = "w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"

  return (
    <main>
      {/* Section 1: Hero with CTAs */}
      <section className="bg-white dark:bg-slate-900 pt-12 md:pt-16 pb-8 overflow-hidden">
        <div className={`${contentWrapperClasses} text-center space-y-8`}>
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 dark:text-white">
              Community Archive
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300">
              An open Twitter database.
            </p>
          </div>

          <DynamicHeroCTAButtons />
        </div>
      </section>

      {/* Section 2: Social Proof */}
      <section className="bg-white dark:bg-slate-900 pb-8 md:pb-12 overflow-hidden">
        <div
          className="max-w-5xl mx-auto rounded-xl p-6 md:p-8 space-y-4 text-center bg-slate-100 dark:bg-slate-700/60"
        >
          <CommunityStats
            accountCount={stats.accountCount}
            tweetCount={stats.tweetCount}
            likedTweetCount={stats.likedTweetCount}
            showGoal={false}
          />
          {mostFollowed.length > 0 ? (
            <AvatarList initialAvatars={mostFollowed} />
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400 mt-4">
              Featured archives are currently unavailable.
            </p>
          )}
        </div>
      </section>

      {/* Section 3: Upload Your Archive */}
      <section className={`bg-white dark:bg-slate-900 ${sectionPaddingClasses} overflow-hidden`}>
        <div className={contentWrapperClasses}>
          <DynamicUploadArchiveSection />
        </div>
      </section>

      {/* Section 4: Get Started - Featured Apps */}
      <section className={`bg-sky-100 dark:bg-slate-800 ${sectionPaddingClasses} overflow-hidden`}>
        <div className={contentWrapperClasses}>
          <FeaturedAppsSection />
          <AppGallery />
        </div>
      </section>

      {/* Section 4: Data & Source Code */}
      <section className={`bg-white dark:bg-slate-900 ${sectionPaddingClasses} overflow-hidden`}>
        <div className={`${contentWrapperClasses} space-y-8`}>
          <div className="text-center">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">Data & Source Code</h2>
            <p className="mt-3 text-lg text-gray-600 dark:text-gray-300 max-w-xl mx-auto px-4 md:px-0">
              Access the data, explore the code, and see how everything works.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            <InfoPanel icon={<FaGithub />} title="GitHub" description="Source code and contributions" href="https://github.com/TheExGenesis/community-archive" />
            <InfoPanel icon={<FaDiscord />} title="Discord" description="Join the community" href="https://discord.gg/RArTGrUawX" />
            <InfoPanel icon={<FaBook />} title="Documentation" description="API docs and examples" href="https://github.com/TheExGenesis/community-archive/tree/main/docs" />
          </div>
        </div>
      </section>

      {/* Section 5: Our Supporters */}
      <section className={`bg-sky-100 dark:bg-slate-800 ${sectionPaddingClasses} overflow-hidden`}>
        <div className={`${contentWrapperClasses} space-y-8`}>
          <div className="text-center">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">Our Supporters</h2>
            <p className="mt-3 text-lg text-gray-600 dark:text-gray-300">
              Thanks to everyone who makes this possible
            </p>
          </div>

          {/* Main supporters card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 md:p-8 border border-gray-200 dark:border-slate-700 max-w-4xl mx-auto">
            {/* Major Backers */}
            <div className="text-center mb-6">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Major Backers</p>
              <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-3">
                <Link href="https://survivalandflourishing.fund/" target="_blank" rel="noopener noreferrer" className="text-base font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Survival and Flourishing Fund
                </Link>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <span className="text-base font-medium text-gray-700 dark:text-gray-300">
                  <Link href="https://x.com/VitalikButerin" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    Vitalik Buterin
                  </Link>
                  {' '}via{' '}
                  <Link href="https://kanro.fi/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    Kanro
                  </Link>
                </span>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <Link href="https://x.com/pwang" target="_blank" rel="noopener noreferrer" className="text-base font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Peter Wang
                </Link>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 dark:border-gray-700 my-6"></div>

            {/* Community Supporters */}
            <div className="text-center mb-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Community Backers</p>
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
            <Link href="https://opencollective.com/community-archive/donate" target="_blank" rel="noopener noreferrer">
              <button className="inline-flex items-center justify-center px-6 py-3 text-base font-medium rounded-xl text-white bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 transition-colors">
                <FaHeart className="mr-2" /> Support the Project
              </button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
