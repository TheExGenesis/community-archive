import Image from 'next/image'
import { getHighResolutionAvatarUrl } from '@/lib/avatar'
import { formatNumber } from '@/lib/formatNumber'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'

const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

const Stat = ({ value, label }: { value: number | null; label: string }) =>
  value === null ? null : (
    <span>
      <b>{formatNumber(value)}</b>{' '}
      <span className="text-muted-foreground">{label}</span>
    </span>
  )

export function ProfileHeader({
  profile,
  archivedAt,
}: {
  profile: ProfileHeaderData
  archivedAt: string | null
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const archiveUrl =
    profile.has_archive && supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/archives/${profile.username.toLowerCase()}/archive.json`
      : null
  const headerUrl = profile.header_media_url
    ? `${profile.header_media_url.replace(/\/$/, '')}/1500x500`
    : null
  const avatarUrl = getHighResolutionAvatarUrl(profile.avatar_media_url)

  return (
    <header>
      <div className="relative h-[210px] w-full bg-muted">
        {headerUrl && (
          <Image
            src={headerUrl}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="(max-width: 1220px) 100vw, 1220px"
          />
        )}
      </div>
      <div className="px-4 pb-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={`${profile.account_display_name}'s avatar`}
              width={132}
              height={132}
              sizes="132px"
              priority
              className="relative z-10 -mt-[66px] h-[132px] w-[132px] rounded-full border-4 border-card bg-muted object-cover"
            />
          ) : (
            <div className="relative z-10 -mt-[66px] grid h-[132px] w-[132px] place-items-center rounded-full border-4 border-card bg-muted text-4xl font-bold">
              {profile.account_display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-3.5">
            {archiveUrl && (
              <a
                href={archiveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border bg-transparent px-4 py-[7px] text-sm font-semibold text-foreground hover:bg-muted"
              >
                Download archive
              </a>
            )}
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

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <h1 className="text-xl font-extrabold">
            {profile.account_display_name}
          </h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {profile.has_archive ? 'Archive contributor' : 'Community member'}
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
          {profile.created_at && (
            <span>📅 Joined {monthYear(profile.created_at)}</span>
          )}
          {archivedAt && <span>🗄️ Archived {monthYear(archivedAt)}</span>}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-[18px] text-sm">
          <Stat value={profile.num_tweets} label="Posts" />
          <Stat value={profile.num_followers} label="Followers" />
          <Stat value={profile.num_following} label="Following" />
          <Stat value={profile.num_likes} label="Likes" />
        </div>
      </div>
    </header>
  )
}
