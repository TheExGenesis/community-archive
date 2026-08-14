import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { PiInfo } from 'react-icons/pi'
import { formatNumber } from '@/lib/formatNumber'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'
import { ProfileAvatar } from './ProfileAvatar'

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
  archivedAtSlot,
}: {
  profile: ProfileHeaderData
  archivedAt: string | null
  archivedAtSlot?: ReactNode
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const archiveUrl =
    profile.has_archive && supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/archives/${profile.username.toLowerCase()}/archive.json`
      : null
  const headerUrl = profile.header_media_url
    ? `${profile.header_media_url.replace(/\/$/, '')}/1500x500`
    : null

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
          <ProfileAvatar
            accountId={profile.account_id}
            avatarUrl={profile.avatar_media_url}
            displayName={profile.account_display_name}
          />
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
          {(profile.has_archive || profile.is_opted_in) && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {profile.has_archive ? 'Archive contributor' : 'Community member'}
            </span>
          )}
        </div>
        <div className="text-[15px] text-muted-foreground">
          @{profile.username}
        </div>

        {profile.bio && (
          <div className="mt-2.5 whitespace-pre-line text-[15px] leading-[1.45]">
            {profile.bio}
          </div>
        )}

        {!profile.has_archive && !profile.is_opted_in ? (
          <div
            role="note"
            aria-label="Limited profile"
            className="mt-3 flex max-w-5xl items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-xs leading-5 text-muted-foreground/80 sm:text-[13px]"
          >
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <PiInfo className="h-3 w-3" aria-hidden="true" />
            </span>
            <p>
              <span className="font-semibold text-foreground/80">
                This user is not a Community Archive user,
              </span>{' '}
              so we only have a selection of their tweets - ones that Archive
              users interacted with. Is this your profile? You can{' '}
              <Link
                href="/profile"
                className="font-semibold text-foreground/80 underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
              >
                sign in and opt out
              </Link>{' '}
              at any time.
            </p>
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap gap-4 text-sm text-muted-foreground">
          {profile.location && <span>📍 {profile.location}</span>}
          {profile.created_at && (
            <span>📅 Joined {monthYear(profile.created_at)}</span>
          )}
          {archivedAt ? (
            <span>🗄️ Archived {monthYear(archivedAt)}</span>
          ) : (
            archivedAtSlot
          )}
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
