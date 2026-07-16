import Image from 'next/image'
import Link from 'next/link'
import { formatNumber } from '@/lib/formatNumber'

// Re-defining Contributor interface here for now. Can be moved to a global types file.
export interface Contributor {
  name: string
  role: string
  type: string
  isActive: boolean
  profile: string
  image: string | null
  slug: string
  totalAmountDonated: number
}

interface TieredSupportersDisplayProps {
  highestDonorWithImage: Contributor | null
  otherDonorsForStack: Contributor[] // e.g., next 2-4 donors with images
  topTenNames: string[]
  additionalSupportersCount: number
  totalAmountRaised: number
  totalSupportersCount: number
}

const TieredSupportersDisplay: React.FC<TieredSupportersDisplayProps> = ({
  highestDonorWithImage,
  otherDonorsForStack,
  topTenNames,
  additionalSupportersCount,
  totalAmountRaised,
  totalSupportersCount,
}) => {
  const imageStack = highestDonorWithImage
    ? [highestDonorWithImage, ...otherDonorsForStack.slice(0, 9)]
    : otherDonorsForStack.slice(0, 10)

  // --- BEGIN DEBUG LOG ---
  if (typeof window !== 'undefined') {
    console.log(
      '[TieredSupportersDisplay] highestDonorWithImage:',
      highestDonorWithImage ? highestDonorWithImage.name : 'None',
    )
    console.log(
      '[TieredSupportersDisplay] otherDonorsForStack received length:',
      otherDonorsForStack.length,
    )
    console.log(
      '[TieredSupportersDisplay] otherDonorsForStack names:',
      otherDonorsForStack.map((c) => c.name),
    )
    console.log(
      '[TieredSupportersDisplay] Final imageStack length:',
      imageStack.length,
    )
    console.log(
      '[TieredSupportersDisplay] Final imageStack names:',
      imageStack.map((c) => c.name),
    )
  }
  // --- END DEBUG LOG ---

  return (
    <div className="flex w-full flex-col items-center space-y-6">
      {/* Top Row: Money, Icons, Count */}
      <div className="grid w-full max-w-3xl grid-cols-1 items-center gap-x-6 gap-y-4 md:grid-cols-3">
        {/* Column 1: Money Raised */}
        <div className="order-1 flex h-full flex-col items-center justify-center text-center">
          <div>
            <p className="text-2xl font-bold text-brand lg:text-3xl">
              ${formatNumber(totalAmountRaised)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Raised</p>
          </div>
        </div>

        {/* Column 2: Image Stack (Centered) */}
        <div className="order-3 mt-4 flex h-full flex-col items-center justify-center md:order-2 md:mt-0">
          {imageStack.length > 0 && (
            <div className="relative h-24 w-full min-w-[240px] md:h-28">
              {imageStack.map((contributor, index) => {
                const numImages = imageStack.length
                const itemOffset = 36
                const groupCenterOffset = ((numImages - 1) * itemOffset) / 2
                const positionWithinStack =
                  index * itemOffset - groupCenterOffset

                return (
                  <Link
                    href={contributor.profile}
                    key={contributor.slug || contributor.profile}
                    passHref
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`absolute overflow-hidden rounded-full border-2 border-white bg-card shadow-lg transition-all duration-300 ease-in-out hover:z-20 hover:scale-105 dark:border-border dark:bg-muted`}
                    style={{
                      zIndex: imageStack.length - index,
                      left: `calc(50% + ${positionWithinStack}px)`,
                      top: '50%',
                      transform: `translate(-50%, -50%) scale(${1 - index * 0.02})`,
                      width: `${56 - index * 2}px`,
                      height: `${56 - index * 2}px`,
                    }}
                    title={contributor.name}
                  >
                    {contributor.image ? (
                      <Image
                        src={contributor.image}
                        alt={`${contributor.name}'s avatar`}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 80px, 96px"
                        style={{ objectFit: 'cover' }}
                        unoptimized={contributor.image.endsWith('.gif')}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-white">
                        {contributor.name.charAt(0)}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Column 3: Supporter Count */}
        <div className="order-2 flex h-full flex-col items-center justify-center text-center md:order-3">
          <div>
            <p className="text-2xl font-bold text-brand lg:text-3xl">
              {formatNumber(totalSupportersCount)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Supporters</p>
          </div>
        </div>
      </div>

      {/* Bottom Row: Textual Acknowledgment (Centered) */}
      <div className="w-full max-w-xl text-center">
        {topTenNames.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {topTenNames.join(', ')}
            {additionalSupportersCount > 0 && (
              <span className="text-muted-foreground">
                , +{additionalSupportersCount} more
              </span>
            )}
          </p>
        )}
        {imageStack.length === 0 &&
          topTenNames.length === 0 &&
          totalSupportersCount > 0 && (
            <p className="text-sm text-muted-foreground">
              We are grateful for all {totalSupportersCount} of our supporters!
            </p>
          )}
        {imageStack.length === 0 &&
          topTenNames.length === 0 &&
          totalSupportersCount === 0 && (
            <p className="text-sm text-muted-foreground">
              Become our first supporter!
            </p>
          )}
      </div>
    </div>
  )
}

export default TieredSupportersDisplay
