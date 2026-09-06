import AvatarList from '@/components/AvatarList'
import { sampleFeaturedArchives } from '@/lib/featuredArchives'

export default function HomepagePeople() {
  const archives = sampleFeaturedArchives()

  return (
    <div className="home-fade-in pt-2">
      <div className="mx-auto w-full max-w-3xl">
        <AvatarList initialAvatars={archives} compact />
      </div>
    </div>
  )
}
