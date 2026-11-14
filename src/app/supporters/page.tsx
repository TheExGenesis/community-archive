import Link from 'next/link'
import { FaHeart } from 'react-icons/fa'
import FundersThanks from '@/components/FundersThanks'
import TieredSupportersDisplay from '@/components/TieredSupportersDisplay'
import { getOpenCollectiveContributors } from '@/lib/supporters'

export const metadata = {
  title: 'Supporters · Community Archive',
  description:
    'The supporters who make Community Archive, an open public archive of tweets, possible.',
}

export default async function SupportersPage() {
  const contributors = await getOpenCollectiveContributors()
  const contributorsWithImages = contributors.filter(
    (contributor) => contributor.image,
  )
  const topTenNames = contributors.slice(0, 10).map(({ name }) => name)

  return (
    <main className="bg-muted py-12 dark:bg-card md:py-16 lg:py-20">
      <div className="mx-auto w-full max-w-5xl space-y-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground">Our Supporters</h1>
          <p className="mt-3 text-base text-muted-foreground">
            Thanks to the funders and backers who make the public archive
            possible.
          </p>
        </div>

        <div className="mx-auto max-w-4xl rounded-lg border border-border bg-card p-6 md:p-8">
          <div className="mb-6">
            <p className="mb-4 text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Funders
            </p>
            <FundersThanks className="mx-auto max-w-2xl" />
          </div>

          <div className="my-6 border-t border-border" />
          <p className="mb-4 text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Community Backers
          </p>
          <TieredSupportersDisplay
            highestDonorWithImage={contributorsWithImages[0] ?? null}
            otherDonorsForStack={contributorsWithImages.slice(1, 10)}
            topTenNames={topTenNames}
            additionalSupportersCount={Math.max(
              0,
              contributors.length - topTenNames.length,
            )}
            totalAmountRaised={contributors.reduce(
              (sum, contributor) => sum + contributor.totalAmountDonated,
              0,
            )}
            totalSupportersCount={contributors.length}
          />
        </div>

        <div className="text-center">
          <Link
            href="https://opencollective.com/community-archive/donate"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-brand px-6 py-3 font-medium text-brand-foreground transition-colors hover:bg-brand/90"
          >
            <FaHeart className="mr-2" /> Support the Project
          </Link>
        </div>
      </div>
    </main>
  )
}
