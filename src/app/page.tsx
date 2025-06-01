import CommunityStats from '@/components/CommunityStats'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import AvatarList from '@/components/AvatarList'
import { SupabaseClient } from '@supabase/supabase-js'
import { FaGithub, FaDiscord, FaBook, FaHeart } from 'react-icons/fa'
import UploadHomepageSection from '@/components/UploadHomepageSection'
import ShowcasedApps from '@/components/ShowcasedApps'
import dynamic from 'next/dynamic'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { getStats } from '@/lib/stats'
import TieredSupportersDisplay, { Contributor } from '@/components/TieredSupportersDisplay'

export const revalidate = 0

// Dynamically import SignIn component with ssr disabled
const DynamicSignIn = dynamic(() => import('@/components/SignIn'), {
  ssr: false,
})

declare global {
  interface Window {
    supabase: any
  }
}

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

// Function to fetch Open Collective contributors
async function getOpenCollectiveContributors(): Promise<Contributor[]> {
  try {
    const res = await fetch('https://opencollective.com/community-archive/members/all.json', { next: { revalidate: 3600 } }) 
    if (!res.ok) {
      console.error(`Failed to fetch Open Collective data: ${res.status}`)
      return []
    }
    const members: any[] = await res.json()

    members.sort((a, b) => {
      const amountA = typeof a.totalAmountDonated === 'number' ? a.totalAmountDonated : 0;
      const amountB = typeof b.totalAmountDonated === 'number' ? b.totalAmountDonated : 0;
      if (amountB !== amountA) { 
        return amountB - amountA;
      }
      return a.name.localeCompare(b.name);
    });

    // Filter for active, non-admin, financial contributors for the main list used for visuals
    // The textual thank you can still draw from a broader list later if needed.
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

// Define a type for the panel props for better type safety
interface InfoPanelProps {
  icon: React.ReactElement
  title: string
  description: string
  href: string
}

const InfoPanel: React.FC<InfoPanelProps> = ({ icon, title, description, href }) => (
  <Link href={href} passHref>
    <div className="flex flex-col items-center p-6 bg-slate-100 dark:bg-slate-800 bg-gradient-to-br from-slate-50 to-slate-200 dark:from-slate-700 dark:to-slate-800 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 h-full">
      <div className="text-4xl mb-4 text-blue-500 dark:text-blue-400">{icon}</div>
      <h3 className="text-xl font-semibold mb-2 text-center text-gray-800 dark:text-gray-200">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{description}</p>
    </div>
  </Link>
)

export default async function Homepage() {
  const supabase = createServerClient(cookies())
  const mostFollowed = (await getMostFollowedAccounts(supabase)).slice(0, 7)
  const financialContributors = await getOpenCollectiveContributors()

  // Calculate total amount raised and total supporters count
  const totalAmountRaised = financialContributors.reduce((sum, contributor) => sum + contributor.totalAmountDonated, 0);
  const totalSupportersCount = financialContributors.length;

  // Process contributors for the new display logic
  // No need to filter admins again here as getOpenCollectiveContributors does it.
  // financialContributors are already sorted and filtered appropriately for the image stack.
  const contributorsWithImages = financialContributors.filter(c => c.image);
  const highestDonorWithImage = contributorsWithImages.length > 0 ? contributorsWithImages[0] : null;
  const otherDonorsForStack = contributorsWithImages.slice(1, 10); 

  // For textual thank you, we might want a broader list of non-admins if desired,
  // or just use the financial ones. For now, let's use the same financial list for top names.
  const topTenFinancialContributors = financialContributors.slice(0, 10);
  const topTenNames = topTenFinancialContributors.map(c => c.name);
  const additionalSupportersCount = Math.max(0, financialContributors.length - topTenNames.length);

  const stats = await getStats(supabase).catch((error) => {
    console.error('Failed to fetch stats for homepage:', error)
    return {
      accountCount: null,
      tweetCount: null,
      likedTweetCount: null,
      userMentionsCount: null,
    }
  })

  const unifiedDeepBlueBase = "bg-slate-200 dark:bg-slate-900";
  
  const sectionPaddingClasses = "py-16 md:py-20"
  const contentWrapperClasses = "w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"

  const glowBaseColor = "hsla(200, 100%, 60%,"
  const glowStyleStrong = {
    backgroundImage: `radial-gradient(ellipse at 50% 0%, ${glowBaseColor}0.2) 0%, transparent 50%)`,
    backgroundRepeat: 'no-repeat',
  }
  const glowStyleModerate = {
    backgroundImage: `radial-gradient(ellipse at 50% 0%, ${glowBaseColor}0.15) 0%, transparent 50%)`,
    backgroundRepeat: 'no-repeat',
  }
  const glowStyleSubtleDiffuse = {
    backgroundImage: `radial-gradient(ellipse at 50% 0%, ${glowBaseColor}0.07) 0%, transparent 70%)`,
    backgroundRepeat: 'no-repeat',
  }
  const glowStyleCarouselFocused = {
    backgroundImage: `radial-gradient(ellipse at 50% 30%, ${glowBaseColor}0.1) 0%, transparent 50%)`,
    backgroundRepeat: 'no-repeat',
  }

  return (
    <main> 
      {/* Parent wrapper for the first three sections - now with the strong glow */}
      <section 
        className={`${unifiedDeepBlueBase} overflow-hidden`}
        style={glowStyleStrong}
      >

        {/* Section 1: Header */}
        <section 
          className={`${sectionPaddingClasses} overflow-hidden`}
        >
          <div className={`${contentWrapperClasses} text-center space-y-4`}>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 dark:text-white">
              Community Archive
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              An open database and API anyone can build on.
            </p>
          </div>
        </section>

        {/* Section 2: Featuring archives uploaded by - Inset panel */}
        <section 
          className={`pt-12 md:pt-16 pb-8 md:pb-10 overflow-hidden`}
        >
          <div 
            className={`max-w-5xl mx-auto rounded-xl p-8 md:p-10 shadow-lg space-y-6 text-center relative z-10 bg-slate-100/50 dark:bg-slate-800/50`}
            style={glowStyleSubtleDiffuse}
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

        {/* Section 3: Our Mission */}
        <section 
          className={`${sectionPaddingClasses} overflow-hidden`}
        >
          <div className={`${contentWrapperClasses} space-y-6 text-center`}>
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">🌟 Our Mission</h2>
            <div className="max-w-2xl mx-auto px-4 md:px-0">
              <p className="text-lg text-gray-700 dark:text-gray-300 text-center">
                We believe in the immense cultural, historical, and economic value embedded in our collective digital data. 
                Our goal is to build open-source, public infrastructure to <strong className="font-semibold text-gray-800 dark:text-gray-100">collect, host, and serve</strong> this data, empowering communities to use it for any purpose they choose.
              </p>
            </div>
          </div>
        </section>
      </section>

      {/* Section 4: Upload your data - Updated background */}
      <section 
        className={`bg-sky-100 dark:bg-slate-800 ${sectionPaddingClasses} overflow-hidden`}
        style={glowStyleModerate}
      >
        <div className={`${contentWrapperClasses} space-y-6 text-center`}>
          <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">📤 Upload Your Data</h2>
          <div className="max-w-lg mx-auto px-2">
            <p className="mb-4 text-gray-700 dark:text-gray-300">
              Export your data from X (formerly Twitter):{' '}
              <a
                href="https://x.com/settings/download_your_data"
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://x.com/settings/download_your_data
              </a>
            </p>
            <div className="my-6">
              <DynamicSignIn />
            </div>
            <UploadHomepageSection />
          </div>
        </div>
      </section>
      
      {/* Section 5: Showcased Apps (Built with the Archive) - Reverted to its original specified background and glow */}
      <section 
        className={`bg-white dark:bg-slate-900 ${sectionPaddingClasses} overflow-hidden`}
        style={glowStyleCarouselFocused}
      >
        <div className={contentWrapperClasses}>
           <ShowcasedApps />
        </div>
      </section>

      {/* Section 6: Data & source code - Updated background */}
      <section 
        className={`bg-sky-100 dark:bg-slate-800 ${sectionPaddingClasses} overflow-hidden`}
        style={glowStyleModerate}
      >
        <div className={`${contentWrapperClasses} space-y-8`}>
          <div className="text-center">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">💻 Data & Source Code</h2>
            <p className="mt-3 text-lg text-gray-600 dark:text-gray-300 max-w-xl mx-auto px-4 md:px-0">
              Access the data, explore the code, and see how everything works.
              For details on what data is processed, see our{' '}
              <Link href="/data-policy" passHref>
                <span className="font-medium text-blue-600 hover:underline dark:text-blue-400 cursor-pointer">Data Policy</span>
              </Link>
              .
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            <InfoPanel icon={<FaGithub />} title="GitHub Repository" description="Access the full source code, contribute to the project, and track issues." href="https://github.com/TheExGenesis/community-archive" />
            <InfoPanel icon={<FaDiscord />} title="Join our Discord" description="Connect with the community, ask questions, and share your projects." href="https://discord.gg/5mbWEfVrqw" />
            <InfoPanel icon={<FaBook />} title="Documentation & API" description="Explore our API, download data, and find examples to build your own apps." href="https://github.com/TheExGenesis/community-archive/tree/main/docs" />
          </div>
        </div>
      </section>

      {/* Section 7: Our Supporters */}
      <section 
        className={`bg-white dark:bg-slate-900 ${sectionPaddingClasses} overflow-hidden`}
        style={glowStyleModerate}
      >
        <div className={`${contentWrapperClasses} text-center space-y-6`}>
          <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">💖 Our Supporters</h2>
          
          <TieredSupportersDisplay 
            highestDonorWithImage={highestDonorWithImage}
            otherDonorsForStack={otherDonorsForStack}
            topTenNames={topTenNames}
            additionalSupportersCount={additionalSupportersCount}
            totalAmountRaised={totalAmountRaised}
            totalSupportersCount={totalSupportersCount}
          />

          <div className="pt-8">
            <Link href="https://opencollective.com/community-archive/donate" passHref>
               <div className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-lg font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 transition-colors duration-300 cursor-pointer shadow-md hover:shadow-lg">
                 <FaHeart className="mr-2" /> Donate to our Open Collective
               </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Maintained by text */}
      <section className={`bg-slate-100 dark:bg-slate-800 py-8 overflow-hidden`}>
        <div className={`${contentWrapperClasses} text-center`}>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Maintained & developed by{' '}
            <a href="https://x.com/exgenesis" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Xiq (@exgenesis)
            </a>{' '}
            & contributors.
          </p>
        </div>
      </section>

      <Footer /> 

    </main>
  )
}
