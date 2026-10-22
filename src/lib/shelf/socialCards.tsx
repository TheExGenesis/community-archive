import 'server-only'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchSafeRemoteResource } from '@/lib/linkPreviews'
import { getHighResolutionAvatarUrl, getSmallAvatarUrl } from '@/lib/avatar'
import { BENTO_ROWS, bentoRank, pickFavourites } from './bento'
import { shelfTileKind } from './labels'
import type { Shelf, ShelfItem, ShelfPerson } from './types'

/* Share cards for a shelf, a work and a top-9 image, rendered by next/og. Satori lays
   out flexbox only, so every container with more than one child sets display: flex. */

const INK = '#f4f4f5'
const MUTED = '#a1a1aa'
const GROUND = '#111113'
const TILE = '#1f1f23'
const RULE = '#2a2a2f'
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif']
const COVER_BUDGET_MS = 4000

const fontFile = (name: string) =>
  readFile(join(process.cwd(), 'src', 'lib', 'shelf', 'card-fonts', name))

/** The site's faces: Manrope for text (the first is the fallback), Petrona for headlines. */
export async function cardFonts() {
  const [regular, bold, serif] = await Promise.all([
    fontFile('manrope-latin-500.woff'),
    fontFile('manrope-latin-700.woff'),
    fontFile('petrona-latin-600.woff'),
  ])
  return [
    {
      name: 'Manrope',
      data: regular,
      weight: 500 as const,
      style: 'normal' as const,
    },
    {
      name: 'Manrope',
      data: bold,
      weight: 700 as const,
      style: 'normal' as const,
    },
    {
      name: 'Petrona',
      data: serif,
      weight: 600 as const,
      style: 'normal' as const,
    },
  ]
}

/**
 * YouTube's hqdefault letterboxes widescreen videos in a 4:3 frame, which
 * shows as black bars in a card. maxresdefault and mqdefault are bar-free
 * 16:9 frames; maxres is missing for some older videos.
 */
function coverCandidates(url: string) {
  const video = url.match(
    /^https:\/\/i\.ytimg\.com\/vi\/([\w-]{6,20})\/hqdefault\.jpg$/,
  )
  if (!video) return [url]
  const base = `https://i.ytimg.com/vi/${video[1]}`
  return [`${base}/maxresdefault.jpg`, `${base}/mqdefault.jpg`, url]
}

async function fetchCover(url: string) {
  const image = await fetchSafeRemoteResource(url, {
    accept: IMAGE_TYPES.join(','),
    maximumBytes: 1.5 * 1024 * 1024,
    allowedContentTypes: (type) => IMAGE_TYPES.includes(type),
  })
  return `data:${image.contentType};base64,${Buffer.from(image.bytes).toString('base64')}`
}

/**
 * Fetch covers through the same guarded fetcher as the cover proxy and inline
 * them, so the renderer never fetches a member-supplied URL itself. Covers
 * not back within the budget are drawn as tiles instead.
 */
export async function inlineCovers(
  urls: Record<string, string>,
  workKeys: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const deadline = new Promise((resolve) =>
    setTimeout(resolve, COVER_BUDGET_MS),
  )
  await Promise.race([
    deadline,
    Promise.all(
      workKeys.map(async (key) => {
        const url = urls[key]
        if (!url) return
        for (const candidate of coverCandidates(url)) {
          try {
            out[key] = await fetchCover(candidate)
            return
          } catch {
            // The next candidate, or a drawn tile.
          }
        }
      }),
    ),
  ])
  return out
}

export async function logoDataUrl() {
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
  return `data:image/png;base64,${logo.toString('base64')}`
}

/** Twitter's CDN only; anything else is left out of the card. */
export function cardAvatar(url: string | null | undefined, small = false) {
  const value = small ? getSmallAvatarUrl(url) : getHighResolutionAvatarUrl(url)
  if (!value) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.hostname === 'pbs.twimg.com'
      ? parsed.toString()
      : null
  } catch {
    return null
  }
}

/**
 * What a card shows: the favourites, then the most tweeted-about works that
 * have a cover, then any others, up to `count`.
 */
export function cardPicks(
  shelf: Shelf,
  count: number,
  hasImage: (item: ShelfItem) => boolean,
): ShelfItem[] {
  const items = shelf.rows
    .filter((row) => BENTO_ROWS.includes(row.key))
    .flatMap((row) => row.items)
  const picks = pickFavourites(items, Math.min(count, 5))
  const rest = items
    .filter((item) => !picks.includes(item))
    .sort(
      (a, b) =>
        Number(hasImage(b)) - Number(hasImage(a)) ||
        bentoRank(b) - bentoRank(a),
    )
  return [...picks, ...rest].slice(0, count)
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text

/** A title size that fits: Satori wraps only at spaces, so the longest word must fit the width. */
function titleSize(label: string, width: number, base: number) {
  const longest = Math.max(...label.split(/\s+/).map((word) => word.length), 1)
  const byLength =
    label.length > 40 ? base * 0.78 : label.length > 22 ? base * 0.88 : base
  return Math.round(
    Math.max(15, Math.min(byLength, (width * 0.86) / (longest * 0.6))),
  )
}

const tweets = (item: ShelfItem) => {
  const count = item.evidenceTweetIds.length
  return count > 1 ? `${count} tweets` : null
}

/**
 * A cover box: the inlined image, or, as on the page, a plain tile with the
 * title and creator set on it.
 */
export function CardCover({
  item,
  src,
  width,
  height,
  radius = 10,
}: {
  item: ShelfItem
  src: string | undefined
  width: number
  height: number
  radius?: number
}) {
  if (src)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={width}
        height={height}
        style={{ width, height, objectFit: 'cover', borderRadius: radius }}
      />
    )
  const pad = Math.round(Math.min(width, height) * 0.08)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width,
        height,
        padding: pad,
        borderRadius: radius,
        background: TILE,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: titleSize(
            item.label,
            width - pad * 2,
            Math.min(width, height) * 0.11,
          ),
          fontWeight: 700,
          lineHeight: 1.18,
          color: INK,
        }}
      >
        {clip(item.label, 70)}
      </div>
      {item.creator ? (
        <div
          style={{
            display: 'flex',
            fontSize: Math.max(15, Math.round(width * 0.055)),
            color: MUTED,
          }}
        >
          {clip(item.creator, 40)}
        </div>
      ) : null}
    </div>
  )
}

function Brand({ logo }: { logo: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        color: MUTED,
        fontSize: 22,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo}
        alt=""
        width={34}
        height={34}
        style={{ width: 34, height: 34 }}
      />
      community-archive.org
    </div>
  )
}

/** 1200×630: name and count on the left, a small bento of favourites on the right. */
export function ShelfCard({
  name,
  username,
  avatar,
  summary,
  picks,
  covers,
  logo,
}: {
  name: string
  username: string
  avatar: string | null
  summary: string
  picks: ShelfItem[]
  covers: Record<string, string>
  logo: string
}) {
  const cover = (index: number, width: number, height: number) =>
    picks[index] ? (
      <CardCover
        item={picks[index]}
        src={covers[picks[index].workKey]}
        width={width}
        height={height}
      />
    ) : (
      <div
        style={{
          display: 'flex',
          width,
          height,
          borderRadius: 6,
          background: '#1c1c20',
        }}
      />
    )
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: GROUND,
        color: INK,
        padding: 56,
        gap: 48,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 470,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              fontSize: 24,
              color: MUTED,
            }}
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt=""
                width={56}
                height={56}
                style={{ width: 56, height: 56, borderRadius: 28 }}
              />
            ) : null}
            @{username}
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Petrona',
              fontSize: 80,
              fontWeight: 600,
              lineHeight: 1.02,
              letterSpacing: -1.5,
            }}
          >
            {clip(`${name}'s shelf`, 40)}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              color: MUTED,
              lineHeight: 1.3,
            }}
          >
            {summary}
          </div>
        </div>
        <Brand logo={logo} />
      </div>
      <div style={{ display: 'flex', gap: 12, flex: 1 }}>
        <div style={{ display: 'flex' }}>{cover(0, 200, 518)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cover(1, 180, 253)}
          {cover(2, 180, 253)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cover(3, 166, 253)}
          {cover(4, 166, 253)}
        </div>
      </div>
    </div>
  )
}

/** 1200×630: one work, the member's words about it, and who else tweeted about it. */
export function WorkCard({
  item,
  cover,
  name,
  username,
  quote,
  people,
  logo,
}: {
  item: ShelfItem
  cover: string | undefined
  name: string
  username: string
  quote: string | null
  people: ShelfPerson[]
  logo: string
}) {
  const book = shelfTileKind(item) === 'book'
  const others = item.echoAccountIds.length
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: GROUND,
        color: INK,
        padding: 56,
        gap: 52,
        alignItems: 'center',
      }}
    >
      <div
        style={{ display: 'flex', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}
      >
        <CardCover
          item={item}
          src={cover}
          width={book ? 330 : 420}
          height={book ? 500 : 420}
          radius={8}
        />
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          height: '100%',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', fontSize: 24, color: MUTED }}>
            {`On ${name}'s shelf · @${username}`}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: item.label.length > 40 ? 50 : 62,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
            }}
          >
            {clip(item.label, 90)}
          </div>
          {item.creator ? (
            <div style={{ display: 'flex', fontSize: 28, color: MUTED }}>
              {clip(item.creator, 60)}
            </div>
          ) : null}
          {quote ? (
            <div
              style={{
                display: 'flex',
                marginTop: 12,
                paddingLeft: 20,
                borderLeft: `3px solid ${RULE}`,
                fontSize: 26,
                lineHeight: 1.4,
                color: '#d4d4d8',
              }}
            >
              “{clip(quote, 170)}”
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {others ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                fontSize: 24,
                color: MUTED,
              }}
            >
              <div style={{ display: 'flex' }}>
                {people.slice(0, 5).map((person, index) => {
                  const src = cardAvatar(person.avatar, true)
                  return src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={person.accountId}
                      src={src}
                      alt=""
                      width={44}
                      height={44}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        marginLeft: index ? -12 : 0,
                        border: `3px solid ${GROUND}`,
                      }}
                    />
                  ) : null
                })}
              </div>
              {others} other {others === 1 ? 'member' : 'members'} tweeted about
              it too
            </div>
          ) : null}
          <Brand logo={logo} />
        </div>
      </div>
    </div>
  )
}

const TOP9_TILE = { width: 309, height: 256 }

/** One of the nine: the cover with the title over a scrim, or a plain titled tile. */
function Top9Tile({ item, src }: { item: ShelfItem; src: string | undefined }) {
  const { width, height } = TOP9_TILE
  const count = tweets(item)
  if (!src)
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width,
          height,
          padding: 22,
          borderRadius: 12,
          background: TILE,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize(item.label, width - 44, 27),
              fontWeight: 700,
              lineHeight: 1.2,
              color: INK,
            }}
          >
            {clip(item.label, 64)}
          </div>
          {item.creator ? (
            <div style={{ display: 'flex', fontSize: 17, color: MUTED }}>
              {clip(item.creator, 30)}
            </div>
          ) : null}
        </div>
        {count ? (
          <div style={{ display: 'flex', fontSize: 16, color: MUTED }}>
            {count}
          </div>
        ) : null}
      </div>
    )
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width,
        height,
        borderRadius: 12,
        overflow: 'hidden',
        background: TILE,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height,
          objectFit: 'cover',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '56px 18px 16px',
          backgroundImage:
            'linear-gradient(180deg, rgba(10,10,12,0) 0%, rgba(10,10,12,0.72) 45%, rgba(10,10,12,0.9) 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1.22,
            color: '#ffffff',
          }}
        >
          {clip(item.label, 46)}
        </div>
        {item.creator || count ? (
          <div
            style={{
              display: 'flex',
              fontSize: 15,
              color: 'rgba(255,255,255,0.68)',
            }}
          >
            {[item.creator && clip(item.creator, 24), count]
              .filter(Boolean)
              .join(' · ')}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** 1080×1080: the nine works a member came back to most. */
export function Top9Card({
  name,
  username,
  avatar,
  picks,
  covers,
  logo,
}: {
  name: string
  username: string
  avatar: string | null
  picks: ShelfItem[]
  covers: Record<string, string>
  logo: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: GROUND,
        color: INK,
        padding: '56px 63px',
        fontFamily: 'Manrope',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 34,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'Petrona',
            fontWeight: 600,
            fontSize: 70,
            lineHeight: 1,
            letterSpacing: -1.5,
          }}
        >
          {clip(`${name}'s top 9`, 24)}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 22,
            color: MUTED,
          }}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              width={40}
              height={40}
              style={{ width: 40, height: 40, borderRadius: 20 }}
            />
          ) : null}
          @{username}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          width: TOP9_TILE.width * 3 + 24,
        }}
      >
        {picks.slice(0, 9).map((item) => (
          <Top9Tile key={item.workKey} item={item} src={covers[item.workKey]} />
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 'auto' }}>
        <Brand logo={logo} />
      </div>
    </div>
  )
}
