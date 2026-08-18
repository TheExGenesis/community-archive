import Link from 'next/link'
import type { PortalTweet } from '@/lib/portal/types'
import { MUTED, BODY } from '@/components/portal/styles'

const RIBBON_SIZE = 8
/** Long tweets break the single-line pill, so the ribbon only takes short ones. */
const MAX_LENGTH = 110

const oneLine = (text: string) =>
  text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * A slow marquee of real archive posts spanning the corpus, drawn from the
 * same historical bangers the dashboard ranks below.
 */
export default function CorpusRibbon({ tweets }: { tweets: PortalTweet[] }) {
  const items = tweets
    .map((tweet) => ({
      id: tweet.id,
      who: tweet.username,
      text: oneLine(tweet.text),
      year: new Date(tweet.createdAt).getUTCFullYear(),
    }))
    .filter(
      (item) =>
        item.who &&
        item.text.length > 0 &&
        item.text.length <= MAX_LENGTH &&
        Number.isFinite(item.year),
    )
    .slice(0, RIBBON_SIZE)

  // Too few pills to fill the viewport twice would show the seam.
  if (items.length < 4) return null

  return (
    <div className="mt-16 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
      <div className="flex w-max gap-3 [animation:corpus-marquee_64s_linear_infinite] hover:[animation-play-state:paused] motion-reduce:animate-none">
        {[0, 1].map((pass) =>
          items.map((item) => (
            <Link
              key={`${pass}-${item.id}`}
              href={`/tweets/${item.id}`}
              aria-hidden={pass === 1}
              tabIndex={pass === 1 ? -1 : undefined}
              className="flex items-center gap-2.5 whitespace-nowrap rounded-full border border-zinc-200 bg-white px-4 py-[9px] text-[13.5px] transition-colors hover:border-brand dark:border-[#26262a] dark:bg-[#1b1b1e]"
            >
              <span className="text-[12.5px] font-semibold text-brand-deep">
                @{item.who}
              </span>
              <span className={BODY}>{item.text}</span>
              <span className={`text-[12px] ${MUTED}`}>{item.year}</span>
            </Link>
          )),
        )}
      </div>
    </div>
  )
}
