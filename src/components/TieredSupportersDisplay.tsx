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
  totalSupportersCount
}) => {

  const imageStack = highestDonorWithImage 
    ? [highestDonorWithImage, ...otherDonorsForStack.slice(0,9)] 
    : otherDonorsForStack.slice(0,10);

  // --- BEGIN DEBUG LOG ---
  if (typeof window !== 'undefined') { 
    console.log('[TieredSupportersDisplay] highestDonorWithImage:', highestDonorWithImage ? highestDonorWithImage.name : 'None');
    console.log('[TieredSupportersDisplay] otherDonorsForStack received length:', otherDonorsForStack.length);
    console.log('[TieredSupportersDisplay] otherDonorsForStack names:', otherDonorsForStack.map(c=>c.name));
    console.log('[TieredSupportersDisplay] Final imageStack length:', imageStack.length);
    console.log('[TieredSupportersDisplay] Final imageStack names:', imageStack.map(c=>c.name));
  }
  // --- END DEBUG LOG ---

  return (
    <div className="w-full flex flex-col items-center space-y-10">
      {/* Top Row: Money, Icons, Count */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6 items-center w-full max-w-5xl">
        
        {/* Column 1: Money Raised */}
        <div className="flex flex-col justify-center items-center text-center order-1 h-full">
          <div>
            <p className="text-3xl lg:text-4xl font-bold text-green-600 dark:text-green-400">
              ${formatNumber(totalAmountRaised)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Raised from our community</p>
          </div>
        </div>

        {/* Column 2: Image Stack (Centered) */}
        <div className="flex flex-col items-center justify-center order-3 md:order-2 mt-6 md:mt-0 h-full">
          {imageStack.length > 0 && (
            <div className="relative h-32 md:h-36 w-full min-w-[280px]">
              {imageStack.map((contributor, index) => {
                const numImages = imageStack.length;
                const itemOffset = 45;
                const groupCenterOffset = (numImages - 1) * itemOffset / 2;
                const positionWithinStack = (index * itemOffset) - groupCenterOffset;

                return (
                  <Link 
                    href={contributor.profile} 
                    key={contributor.slug || contributor.profile} 
                    passHref 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={`absolute rounded-full overflow-hidden shadow-xl border-2 border-white dark:border-slate-700 hover:scale-105 hover:z-20 transition-all duration-300 ease-in-out bg-white dark:bg-slate-600`}
                    style={{
                      zIndex: imageStack.length - index, 
                      left: `calc(50% + ${positionWithinStack}px)`,
                      top: '50%',
                      transform: `translate(-50%, -50%) scale(${1 - index * 0.03})`,
                      width: `${80 - index * 4}px`,
                      height: `${80 - index * 4}px`,
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
                      <div className="w-full h-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-white text-xs">
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
        <div className="flex flex-col justify-center items-center text-center order-2 md:order-3 h-full">
          <div>
            <p className="text-3xl lg:text-4xl font-bold text-blue-600 dark:text-blue-400">
              {formatNumber(totalSupportersCount)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Financial Supporters</p>
          </div>
        </div>
      </div>

      {/* Bottom Row: Textual Acknowledgment (Centered) */}
      <div className="w-full max-w-2xl text-center">
        {topTenNames.length > 0 && (
          <p className="text-gray-700 dark:text-gray-300 text-lg">
            <span className="font-semibold">{topTenNames.join(', ')}</span>
            {additionalSupportersCount > 0 && (
              <span>, and {additionalSupportersCount} more wonderful supporter{additionalSupportersCount > 1 ? 's' : ''}</span>
            )}
          </p>
        )}
        {(imageStack.length === 0 && topTenNames.length === 0 && totalSupportersCount > 0) && (
           <p className="text-gray-600 dark:text-gray-400">We are grateful for all {totalSupportersCount} of our supporters!</p>
        )}
         {(imageStack.length === 0 && topTenNames.length === 0 && totalSupportersCount === 0) && (
           <p className="text-gray-600 dark:text-gray-400">Become our first supporter!</p>
        )}
      </div>
    </div>
  )
}

export default TieredSupportersDisplay 