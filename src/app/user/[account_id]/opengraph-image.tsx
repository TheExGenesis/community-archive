import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { getHighResolutionAvatarUrl } from '@/lib/avatar'
import { formatNumber } from '@/lib/formatNumber'
import {
  getProfilePreviewStats,
  resolveProfile,
  type ProfilePreviewStats,
} from '@/lib/metaTwitter/profile'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'

export const alt = 'Community Archive user profile'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600

const colors = {
  brand: '#25aadf',
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ alignItems: 'baseline', display: 'flex' }}>
      <span style={{ fontSize: 26, fontWeight: 800 }}>{value}</span>
      <span style={{ color: colors.muted, fontSize: 26, marginLeft: 7 }}>
        {label}
      </span>
    </div>
  )
}

function ProfilePreview({
  logoUrl,
  profile,
  stats,
}: {
  logoUrl: string
  profile: ProfileHeaderData
  stats: ProfilePreviewStats | null
}) {
  const headerUrl = headerImageUrl(profile.header_media_url)
  const avatarUrl = avatarImageUrl(profile.avatar_media_url)
  const bio = profile.bio?.replace(/\s+/g, ' ').trim() ?? ''

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
          <div style={{ alignItems: 'baseline', display: 'flex' }}>
            <span
              style={{
                fontFamily: 'serif',
                fontSize: 52,
                fontWeight: 700,
                lineHeight: 1,
                maxWidth: 680,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {truncate(profile.account_display_name, 42)}
            </span>
            <span
              style={{
                color: colors.muted,
                fontSize: 28,
                marginLeft: 16,
              }}
            >
              @{truncate(profile.username, 30)}
            </span>
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

          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              marginTop: 18,
            }}
          >
            <Metric
              value={stats ? formatNumber(stats.bangers) : '—'}
              label="Bangers"
            />
            <div style={{ display: 'flex', marginLeft: 40 }}>
              <Metric
                value={stats ? formatNumber(stats.archivedQuotes) : '—'}
                label="Archived quotes"
              />
            </div>
            <div style={{ display: 'flex', marginLeft: 40 }}>
              <Metric
                value={stats ? formatNumber(stats.yearsArchived) : '—'}
                label="Years archived"
              />
            </div>
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
  const [logo, stats] = await Promise.all([
    readFile(
      join(
        process.cwd(),
        'src',
        'app',
        'user',
        '[account_id]',
        'community-archive-logo-white.png',
      ),
    ),
    getProfilePreviewStats(resolved.accountId),
  ])
  const logoUrl = `data:image/png;base64,${logo.toString('base64')}`

  return new ImageResponse(
    (
      <ProfilePreview
        logoUrl={logoUrl}
        profile={resolved.profile}
        stats={stats}
      />
    ),
    size,
  )
}
