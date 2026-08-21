import AvatarList from '@/components/AvatarList'
import {
  HOMEPAGE_FEATURED_ARCHIVE_COUNT,
  sampleFeaturedArchives,
} from '@/lib/featuredArchives'
import { loadHomepageArchiveProfiles } from '@/lib/homepageArchiveProfiles'

export function HomepagePeopleFallback() {
  return (
    <div className="pt-2">
      <div
        aria-hidden="true"
        className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-3 gap-y-4 pb-2"
      >
        {Array.from({ length: HOMEPAGE_FEATURED_ARCHIVE_COUNT }, (_, index) => (
          <span
            key={index}
            className="h-10 w-10 animate-pulse rounded-full bg-muted"
          />
        ))}
      </div>
    </div>
  )
}

export default async function HomepagePeople() {
  const featuredCandidates = sampleFeaturedArchives()
  const featured = await loadHomepageArchiveProfiles(featuredCandidates)
  const archives = featured.length ? featured : featuredCandidates

  return (
    <div className="home-fade-in pt-2">
      <div className="mx-auto w-full max-w-3xl">
        <AvatarList initialAvatars={archives} compact />
      </div>
    </div>
  )
}
