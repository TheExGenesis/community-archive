import Image from 'next/image'
import Link from 'next/link'

export interface Contributor {
  // Using 'id' is a common practice, ensure API provides a unique key, if not, use index as key in map but prefer stable id
  // For Open Collective, member.id or member.MemberId seems to be available.
  // Let's assume member.id based on typical API structures. We will use profile URL as key for now if id is not directly on the object we map.
  name: string
  role: string // ADMIN, MEMBER, BACKER
  type: string // USER, ORGANIZATION
  isActive: boolean
  profile: string // URL to their Open Collective profile
  image: string | null // URL to their avatar, can be null
  slug: string // The member slug, can be used for a unique key
  totalAmountDonated: number // Added to store donation amount for sorting
}

interface OpenCollectiveContributorsProps {
  contributors: Contributor[]
}

const OpenCollectiveContributors: React.FC<OpenCollectiveContributorsProps> = ({ contributors }) => {
  // --- BEGIN DEBUG LOG ---
  if (typeof window !== 'undefined') { // Ensure this runs only on the client-side
    console.log("Open Collective Contributors - Image URLS:");
    const uniqueHostnames = new Set<string>();
    contributors.forEach(c => {
      if (c.image) {
        try {
          const url = new URL(c.image);
          uniqueHostnames.add(url.hostname);
        } catch (e) {
          console.warn(`Invalid image URL for ${c.name}: ${c.image}`);
        }
      }
    });
    if (uniqueHostnames.size > 0) {
      console.log("Unique image hostnames found:", Array.from(uniqueHostnames));
    }
  }
  // --- END DEBUG LOG ---

  if (!contributors || contributors.length === 0) {
    return <p className="text-gray-600 dark:text-gray-400">No active contributors to display at the moment.</p>
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-8">
      {contributors.map((contributor) => (
        <Link href={contributor.profile} key={contributor.slug || contributor.profile} passHref target="_blank" rel="noopener noreferrer">
          <div className="flex flex-col items-center text-center space-y-2 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors duration-200">
            <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden shadow-md">
              {contributor.image ? (
                <Image 
                  src={contributor.image} 
                  alt={`${contributor.name}'s avatar`} 
                  fill 
                  sizes="(max-width: 768px) 80px, 96px"
                  style={{ objectFit: 'cover' }}
                  unoptimized={contributor.image.endsWith('.gif')} // Basic unoptimization for gifs
                />
              ) : (
                <div className="w-full h-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs">
                  No Image
                </div>
              )}
            </div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate w-full">{contributor.name}</p>
            {/* Optional: Display role if needed */}
            {/* <p className="text-xs text-gray-500 dark:text-gray-400">{contributor.role}</p> */}
          </div>
        </Link>
      ))}
    </div>
  )
}

export default OpenCollectiveContributors 