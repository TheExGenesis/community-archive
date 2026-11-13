/**
 * Tweets can carry up to 20 photos, but feed rows show at most this many
 * tiles; the last visible tile carries a "+N" overlay and every tile opens
 * a lightbox gallery with all of them.
 */
export const MAX_VISIBLE_MEDIA = 4

/** Drawn over the last visible thumbnail when more media are hidden. */
export function MediaOverflowBadge({ hidden }: { hidden: number }) {
  return (
    <span
      aria-hidden="true"
      data-testid="media-overflow"
      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-xl font-semibold tabular-nums text-white sm:text-2xl"
    >
      +{hidden}
    </span>
  )
}

/** Accessible name for a thumbnail that also stands for the hidden media. */
export const overflowLabel = (alt: string, hidden: number) =>
  `Enlarge ${alt.toLowerCase()}, ${hidden} more ${hidden === 1 ? 'image' : 'images'}`
