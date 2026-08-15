import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { PiInfo } from 'react-icons/pi'
import { formatNumber } from '@/lib/formatNumber'
import type {
  ProfileHeaderData,
  ResolvedProfileLink,
} from '@/lib/metaTwitter/types'
import { MembershipStatusIcon } from '@/components/MembershipStatusIcon'
import { ProjectContributorBadge } from '@/components/ProjectContributorBadge'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileEditButton } from './ProfileEditButton'

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

const urlPattern = /(https?:\/\/[^\s]+)/g

function ProfileText({
  text,
  links,
}: {
  text: string
  links: Map<string, ResolvedProfileLink>
}) {
  return text.split(urlPattern).map((part, index) => {
    if (!/^https?:\/\/[^\s]+$/.test(part)) return part
    const link = links.get(part)
    return (
      <a
        key={`${part}-${index}`}
        href={link?.expanded_url ?? part}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-brand underline-offset-2 hover:underline"
      >
        {link?.display_url ?? part.replace(/^https?:\/\//, '')}
      </a>
    )
  })
}

export function ProfileHeader({
  profile,
  archivedAt,
  archivedAtSlot,
  downloadArchiveVisible = true,
  isOwner = false,
}: {
  profile: ProfileHeaderData
  archivedAt: string | null
  archivedAtSlot?: ReactNode
  downloadArchiveVisible?: boolean
  isOwner?: boolean
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const archiveUrl =
    profile.has_archive && supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/archives/${profile.username.toLowerCase()}/archive.json`
      : null
  const headerUrl = profile.header_media_url
    ? `${profile.header_media_url.replace(/\/$/, '')}/1500x500`
    : null
  const profileLinks = new Map(
    (profile.profile_links ?? []).map((link) => [link.original_url, link]),
  )

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
      <div className="px-4 pb-3 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <ProfileAvatar
            accountId={profile.account_id}
            avatarUrl={profile.avatar_media_url}
            displayName={profile.account_display_name}
          />
          <div className="flex flex-wrap justify-end gap-2 pt-3.5">
            {archiveUrl && downloadArchiveVisible && (
              <a
                href={archiveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border bg-transparent px-4 py-[7px] text-sm font-semibold text-foreground hover:bg-muted"
              >
                Download archive
              </a>
            )}
            {isOwner ? <ProfileEditButton /> : null}
            <a
              href={`https://x.com/${profile.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border/70 bg-transparent px-4 py-[7px] text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              View on X
            </a>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center">
          <h1 className="text-xl font-extrabold">
            {profile.account_display_name}
          </h1>
          <div className="ml-2 flex flex-wrap items-center gap-1.5">
            <ProjectContributorBadge username={profile.username} />
            <MembershipStatusIcon
              hasArchive={profile.has_archive}
              isOptedIn={profile.is_opted_in}
            />
          </div>
        </div>
        <div className="text-[15px] text-muted-foreground">
          @{profile.username}
        </div>

        <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-x-8">
          <div className="min-w-0">
            <div
              className={
                profile.bio
                  ? 'whitespace-pre-line text-sm leading-[1.4]'
                  : 'hidden lg:block'
              }
            >
              {profile.bio ? (
                <ProfileText text={profile.bio} links={profileLinks} />
              ) : null}
            </div>

            {profile.website ? (
              <div className="mt-1 text-sm">
                <ProfileText text={profile.website} links={profileLinks} />
              </div>
            ) : null}

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
                  so we only have a selection of their tweets - ones that
                  Archive users interacted with. Is this your profile? You can{' '}
                  <Link
                    href="/settings"
                    className="font-semibold text-foreground/80 underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
                  >
                    sign in and opt out
                  </Link>{' '}
                  at any time.
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-2 text-sm lg:items-end lg:text-right">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground lg:justify-end">
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

            <div className="flex flex-wrap gap-x-4 gap-y-1 lg:justify-end">
              <Stat value={profile.num_tweets} label="Posts" />
              <Stat value={profile.num_followers} label="Followers" />
              <Stat value={profile.num_following} label="Following" />
              <Stat value={profile.num_likes} label="Likes" />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
