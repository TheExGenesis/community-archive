import AvatarList from '@/components/AvatarList'
import { loadFavoritePeople } from '@/lib/favoritePeople'
import {
  HOMEPAGE_FEATURED_ARCHIVE_COUNT,
  sampleFeaturedArchives,
} from '@/lib/featuredArchives'
import { getCurrentUser } from '@/lib/portal/auth'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import type { AvatarType } from '@/lib/types'

const labelClassName =
  'mb-5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80'

async function personalizedArchives(): Promise<AvatarType[]> {
  const user = await getCurrentUser()
  const username = user ? getSessionTwitterUsername(user) : null
  if (!username) return []

  const favoritePeople = await loadFavoritePeople(username)
  return favoritePeople.people
    .slice(0, HOMEPAGE_FEATURED_ARCHIVE_COUNT)
    .map((person) => ({
      account_id: person.accountId,
      username: person.username || person.accountId,
      avatar_media_url: person.avatarUrl || '',
    }))
}

export function HomepagePeopleFallback() {
  return (
    <div className="pt-2">
      <p className={labelClassName}>Featured archives</p>
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

export default async function HomepagePeople({
  isMember,
}: {
  isMember: boolean
}) {
  const personalized = isMember ? await personalizedArchives() : []
  const archives = personalized.length ? personalized : sampleFeaturedArchives()

  return (
    <div className="pt-2">
      <p className={labelClassName}>
        {personalized.length
          ? 'People you interact with most'
          : 'Featured archives'}
      </p>
      <div className="mx-auto w-full max-w-3xl">
        <AvatarList initialAvatars={archives} compact />
      </div>
    </div>
  )
}
