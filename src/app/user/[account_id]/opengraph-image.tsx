import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { getHighResolutionAvatarUrl } from '@/lib/avatar'
import { formatNumber } from '@/lib/formatNumber'
import {
  PROFILE_BADGE_LABELS,
  profileBadge,
  type ProfileBadge,
} from '@/lib/metaTwitter/profileBadge'
import { resolveProfile } from '@/lib/metaTwitter/profile'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'

export const alt = 'Community Archive user profile'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600
// Header and avatar images are fetched from pbs.twimg.com while the image
// renders; a slow upstream can outlast the 15s default and 504 the card.
export const maxDuration = 60

const colors = {
  brand: '#25aadf',
  gold: '#ca8a04',
  goldBorder: 'rgba(234, 179, 8, 0.4)',
  goldFill: 'rgba(234, 179, 8, 0.1)',
  card: '#ffffff',
  foreground: '#111113',
  muted: '#777780',
  border: '#e1e1e5',
}

const truncate = (value: string, maximum: number) =>
  value.length > maximum ? `${value.slice(0, maximum - 1).trimEnd()}…` : value

const safeTwitterImageUrl = (value: string | null | undefined) => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'pbs.twimg.com'
      ? url.toString()
      : null
  } catch {
    return null
  }
}

const headerImageUrl = (value: string | null) => {
  const safeUrl = safeTwitterImageUrl(value)
  if (!safeUrl) return null
  const url = new URL(safeUrl)
  url.pathname = `${url.pathname.replace(/\/$/, '')}/1500x500`
  url.search = ''
  url.hash = ''
  return url.toString()
}

const avatarImageUrl = (value: string | null) =>
  safeTwitterImageUrl(getHighResolutionAvatarUrl(value))

const joinedYear = (value: string | null) => {
  if (!value) return null
  const joined = new Date(value)
  return Number.isNaN(joined.getTime()) ? null : String(joined.getUTCFullYear())
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ alignItems: 'baseline', display: 'flex' }}>
      <span style={{ fontSize: 25, fontWeight: 800 }}>{value}</span>
      <span style={{ color: colors.muted, fontSize: 25, marginLeft: 7 }}>
        {label}
      </span>
    </div>
  )
}

function BadgeIcon({ badge }: { badge: Exclude<ProfileBadge, null> }) {
  // Satori cannot render fragments inside <svg>, so each state supplies its own
  // complete element rather than sharing one wrapper.
  const stroke = badge === 'contributor' ? colors.gold : colors.brand
  const shared = {
    fill: 'none',
    height: 21,
    stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
    viewBox: '0 0 24 24',
    width: 21,
  }

  if (badge === 'contributor') {
    return (
      <svg {...shared}>
        <circle cx="12" cy="8" r="6" />
        <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
      </svg>
    )
  }
  if (badge === 'archive') {
    return (
      <svg {...shared}>
        <rect x="2" y="3" width="20" height="5" rx="1" />
        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
        <path d="M10 12h4" />
      </svg>
    )
  }
  return (
    <svg {...shared}>
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
      <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
    </svg>
  )
}

function ProfileBadgePill({ profile }: { profile: ProfileHeaderData }) {
  const badge = profileBadge(profile)
  if (!badge) return null
  const isContributor = badge === 'contributor'

  return (
    <div
      style={{
        alignItems: 'center',
        background: isContributor ? colors.goldFill : '#e9f6fc',
        border: `1px solid ${isContributor ? colors.goldBorder : colors.brand}`,
        borderRadius: 999,
        color: isContributor ? colors.gold : colors.brand,
        display: 'flex',
        flexShrink: 0,
        fontSize: 21,
        fontWeight: 700,
        marginLeft: 20,
        padding: '5px 16px',
      }}
    >
      <BadgeIcon badge={badge} />
      <span style={{ marginLeft: 9 }}>{PROFILE_BADGE_LABELS[badge]}</span>
    </div>
  )
}

function ProfilePreview({
  logoUrl,
  profile,
}: {
  logoUrl: string
  profile: ProfileHeaderData
}) {
  const headerUrl = headerImageUrl(profile.header_media_url)
  const avatarUrl = avatarImageUrl(profile.avatar_media_url)
  const bio = profile.bio?.replace(/\s+/g, ' ').trim() ?? ''
  const joined = joinedYear(profile.created_at)
  const metrics = [
    { label: 'Posts', value: profile.num_tweets },
    { label: 'Followers', value: profile.num_followers },
  ]
    .filter((metric) => metric.value !== null)
    .map((metric) => ({
      label: metric.label,
      value: formatNumber(metric.value),
    }))

  return (
    <div
      style={{
        background: '#f4f4f5',
        display: 'flex',
        height: '100%',
        width: '100%',
      }}
    >
      <div
        style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: 32,
          color: colors.foreground,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'sans-serif',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          width: '100%',
        }}
      >
        <div
          style={{
            alignItems: 'center',
            background: colors.brand,
            color: '#ffffff',
            display: 'flex',
            flexShrink: 0,
            height: 120,
            padding: '0 48px',
            width: '100%',
          }}
        >
          {/* ImageResponse renders the bundled raster asset directly. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src={logoUrl}
            style={{ height: 72, objectFit: 'contain', width: 72 }}
          />
          <span
            style={{
              fontFamily: 'serif',
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              marginLeft: 24,
            }}
          >
            Community Archive
          </span>
          <span
            style={{
              fontSize: 24,
              fontWeight: 600,
              marginLeft: 'auto',
              opacity: 0.9,
            }}
          >
            community-archive.org
          </span>
        </div>

        <div
          style={{
            background:
              'linear-gradient(135deg, #d9f1fa 0%, #9fdcf0 52%, #60c4e8 100%)',
            display: 'flex',
            flexShrink: 0,
            height: 190,
            overflow: 'hidden',
            width: '100%',
          }}
        >
          {headerUrl ? (
            // ImageResponse renders remote assets directly; next/image is not
            // available inside the generated image renderer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              src={headerUrl}
              style={{ height: '100%', objectFit: 'cover', width: '100%' }}
            />
          ) : null}
        </div>

        <div
          style={{
            alignItems: 'center',
            background: colors.card,
            border: `8px solid ${colors.card}`,
            borderRadius: 999,
            display: 'flex',
            height: 196,
            justifyContent: 'center',
            left: 64,
            overflow: 'hidden',
            position: 'absolute',
            top: 212,
            width: 196,
          }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              src={avatarUrl}
              style={{ height: '100%', objectFit: 'cover', width: '100%' }}
            />
          ) : (
            <span
              style={{
                alignItems: 'center',
                background: '#e8e8eb',
                display: 'flex',
                fontFamily: 'serif',
                fontSize: 72,
                fontWeight: 800,
                height: '100%',
                justifyContent: 'center',
                width: '100%',
              }}
            >
              {profile.account_display_name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '28px 64px 44px',
          }}
        >
          <div style={{ alignItems: 'center', display: 'flex' }}>
            <span
              style={{
                fontFamily: 'serif',
                fontSize: 52,
                fontWeight: 700,
                lineHeight: 1,
                maxWidth: 480,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {truncate(profile.account_display_name, 30)}
            </span>
            <span
              style={{
                color: colors.muted,
                fontSize: 28,
                lineHeight: 1,
                marginLeft: 16,
                maxWidth: 260,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              @{truncate(profile.username, 20)}
            </span>
            <ProfileBadgePill profile={profile} />
          </div>

          <div
            style={{
              fontSize: 25,
              lineHeight: 1.4,
              marginTop: 18,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              width: '100%',
            }}
          >
            {bio ? truncate(bio, 145) : 'A profile in the Community Archive'}
          </div>

          <div style={{ alignItems: 'center', display: 'flex', marginTop: 18 }}>
            {metrics.map((metric, index) => (
              <div
                key={metric.label}
                style={{ display: 'flex', marginLeft: index === 0 ? 0 : 34 }}
              >
                <Metric label={metric.label} value={metric.value} />
              </div>
            ))}
            {joined ? (
              <div
                style={{
                  color: colors.muted,
                  display: 'flex',
                  fontSize: 25,
                  marginLeft: metrics.length === 0 ? 0 : 34,
                }}
              >
                Joined {joined}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function Image({
  params,
}: {
  params: { account_id: string }
}) {
  const resolved = await resolveProfile(params.account_id)
  if (!resolved) notFound()
  const logo = await readFile(
    join(
      process.cwd(),
      'src',
      'app',
      'user',
      '[account_id]',
      'community-archive-logo-white.png',
    ),
  )
  const logoUrl = `data:image/png;base64,${logo.toString('base64')}`

  return new ImageResponse(
    <ProfilePreview logoUrl={logoUrl} profile={resolved.profile} />,
    size,
  )
}
