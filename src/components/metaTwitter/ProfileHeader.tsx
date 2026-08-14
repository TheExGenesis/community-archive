import Image from 'next/image'
import { formatNumber } from '@/lib/formatNumber'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'

const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

const Stat = ({ value, label }: { value: number; label: string }) => (
  <span>
    <b>{formatNumber(value)}</b>{' '}
    <span className="text-muted-foreground">{label}</span>
  </span>
)

/** Twitter-style profile header: cover, overlapping avatar, identity, stats. */
export function ProfileHeader({
  profile,
  archivedAt,
}: {
  profile: ProfileHeaderData
  archivedAt: string | null
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const archiveUrl = `${supabaseUrl}/storage/v1/object/public/archives/${profile.username.toLowerCase()}/archive.json`

  return (
    <div>
      <div className="relative h-[210px] w-full bg-muted">
        {profile.header_media_url && (
          <Image
            src={`${profile.header_media_url}/1500x500`}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="(max-width: 1220px) 100vw, 1220px"
          />
        )}
      </div>
      <div className="px-6 pb-4">
        <div className="flex items-start justify-between">
          {/* Avatar overlaps the cover by exactly half its height */}
          <img
            src={profile.avatar_media_url ?? ''}
            alt={profile.account_display_name}
            className="relative z-10 -mt-[66px] h-[132px] w-[132px] rounded-full border-4 border-card bg-[#ddd] object-cover"
          />
          <div className="flex gap-2 pt-3.5">
            <a
              href={archiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border bg-transparent px-4 py-[7px] text-sm font-semibold text-foreground hover:bg-muted"
            >
              Download archive
            </a>
            <a
              href={`https://x.com/${profile.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-foreground px-4 py-[7px] text-sm font-semibold text-background hover:opacity-90"
            >
              Follow on X
            </a>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="text-xl font-extrabold">
            {profile.account_display_name}
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#1d9bf0">
            <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
          </svg>
          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            Archive contributor
          </span>
        </div>
        <div className="text-[15px] text-muted-foreground">
          @{profile.username}
        </div>

        {profile.bio && (
          <div className="mt-2.5 whitespace-pre-line text-[15px] leading-[1.45]">
            {profile.bio}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap gap-4 text-sm text-muted-foreground">
          {profile.location && <span>📍 {profile.location}</span>}
          <span>📅 Joined {monthYear(profile.created_at)}</span>
          {archivedAt && <span>🗄️ Archived {monthYear(archivedAt)}</span>}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-[18px] text-sm">
          <Stat value={profile.num_tweets} label="Posts" />
          <Stat value={profile.num_followers} label="Followers" />
          <Stat value={profile.num_following} label="Following" />
          <Stat value={profile.num_likes} label="Likes" />
        </div>
      </div>
    </div>
  )
}
