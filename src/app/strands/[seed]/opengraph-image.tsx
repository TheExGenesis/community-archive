import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { getStrands } from '@/lib/community-apps/data'
import type { Strand } from '@/lib/community-apps/types'

export const alt = 'A strand on Community Archive'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600
export const maxDuration = 60

const colors = {
  brand: '#25aadf',
  brandText: '#1e9bcd',
  card: '#ffffff',
  foreground: '#111113',
  muted: '#777780',
  page: '#f8fbfd',
}

const truncate = (value: string, maximum: number) =>
  value.length > maximum ? `${value.slice(0, maximum - 1).trimEnd()}…` : value

const clean = (value: string) =>
  value
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

// Month only: the card has no viewer time zone, so a day could disagree with
// the date the page shows in the reader's local time.
const postedOn = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('en-US', {
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
      })
}

function StrandPreview({
  logoUrl,
  strand,
}: {
  logoUrl: string
  strand: Strand
}) {
  const seedText = clean(strand.text)
  const date = postedOn(strand.createdAt)
  const related = strand.totalPosts
    ? `${strand.totalPosts.toLocaleString('en-US')} related posts`
    : null

  return (
    // Full bleed, like the profile card: clients round social cards themselves.
    <div
      style={{
        background: colors.page,
        color: colors.foreground,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'sans-serif',
        height: '100%',
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
            background: 'rgba(255, 255, 255, 0.3)',
            borderRadius: 999,
            fontFamily: 'Noto Sans SemiBold',
            fontSize: 24,
            marginLeft: 'auto',
            padding: '8px 22px',
          }}
        >
          Strands
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '38px 64px 40px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'serif',
            flexShrink: 0,
            fontSize: 58,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            lineHeight: 1.12,
          }}
        >
          {truncate(strand.title, 70)}
        </div>

        <div
          style={{
            background: colors.card,
            border: `3px solid ${colors.foreground}`,
            boxShadow: `7px 7px 0 0 ${colors.brand}`,
            display: 'flex',
            flexDirection: 'column',
            padding: '22px 28px',
          }}
        >
          <div
            style={{
              color: colors.muted,
              display: 'flex',
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: 2.5,
              textTransform: 'uppercase',
            }}
          >
            The seed post
          </div>
          <div
            style={{
              alignItems: 'baseline',
              display: 'flex',
              fontSize: 24,
              marginTop: 14,
            }}
          >
            <span style={{ fontWeight: 700 }}>@{strand.username}</span>
            {date ? (
              <span style={{ color: colors.muted, marginLeft: 12 }}>
                {date}
              </span>
            ) : null}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              lineHeight: 1.35,
              marginTop: 8,
            }}
          >
            {truncate(
              seedText || 'Open the strand to read the seed post.',
              125,
            )}
          </div>
        </div>

        <div
          style={{
            alignItems: 'center',
            color: colors.muted,
            display: 'flex',
            fontSize: 24,
          }}
        >
          {related ? <span>{related}</span> : null}
          <span style={{ color: colors.brandText, marginLeft: 'auto' }}>
            community-archive.org
          </span>
        </div>
      </div>
    </div>
  )
}

export default async function Image({ params }: { params: { seed: string } }) {
  if (!/^\d{1,20}$/.test(params.seed)) notFound()
  const { strands } = await getStrands()
  const strand = strands.find((item) => item.id === params.seed)
  if (!strand) notFound()
  const appFile = (...parts: string[]) =>
    readFile(join(process.cwd(), 'src', 'app', ...parts))
  const [logo, regular, semibold] = await Promise.all([
    appFile('user', '[account_id]', 'community-archive-logo-white.png'),
    appFile('strands', '[seed]', 'noto-sans-latin-400.woff'),
    appFile('strands', '[seed]', 'noto-sans-latin-600.woff'),
  ])
  const logoUrl = `data:image/png;base64,${logo.toString('base64')}`

  return new ImageResponse(
    <StrandPreview logoUrl={logoUrl} strand={strand} />,
    {
      ...size,
      // Passing any font replaces the built-in regular Noto Sans, so it comes
      // back first as the fallback for every family. SemiBold gets its own
      // family name so only the pill asks for it.
      fonts: [
        { data: regular, name: 'Noto Sans', weight: 400 },
        { data: semibold, name: 'Noto Sans SemiBold', weight: 600 },
      ],
    },
  )
}
