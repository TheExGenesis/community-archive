'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { MouseEvent } from 'react'
import { X } from 'lucide-react'
import TweetCard from '@/components/TweetCard'
import { RAIL_MEDIA, useCitationLinks } from './CitationContext'
import type { Citation, FoundPhase, FoundTweet } from './messageView'

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const railActive = () =>
  typeof window !== 'undefined' && window.matchMedia(RAIL_MEDIA).matches

/** How long a tweet that just entered the column stays highlighted. */
const FRESH_MS = 1600
/** Tweets the column shows while the answer is written. */
const FOUND_SHOWN = 5

/**
 * Keeps the found tweets on screen in place as the set changes: tweets
 * already shown keep their order, new ones enter at the top, and earlier
 * ones move down until pushed past the last place. A change of phase (latest
 * matches to most relevant) starts over, since the heading changes with it.
 * Returns the tweets to show and the ids that just entered.
 */
function useSteadyFound(found: FoundTweet[], phase: FoundPhase['kind']) {
  const memory = useRef<{
    found: FoundTweet[] | null
    phase: FoundPhase['kind']
    shown: FoundTweet[]
    entered: string[]
  }>({ found: null, phase, shown: [], entered: [] })
  const steady = useMemo(() => {
    const last = memory.current
    // Computed once per new set, so a repeated render (Strict Mode) does
    // not see its own update and lose the newcomers.
    if (last.found === found) return last
    const fresh = new Map(found.map((item) => [item.tweet.id, item]))
    let shown: FoundTweet[]
    let entered: string[] = []
    if (last.phase !== phase || !last.shown.length) {
      shown = found.slice(0, FOUND_SHOWN)
    } else {
      const before = new Set(last.shown.map((item) => item.tweet.id))
      const newcomers = found.filter((item) => !before.has(item.tweet.id))
      // Kept tweets take their latest score.
      const kept = last.shown.map((item) => fresh.get(item.tweet.id) ?? item)
      shown = [...newcomers, ...kept].slice(0, FOUND_SHOWN)
      entered = newcomers.slice(0, FOUND_SHOWN).map((item) => item.tweet.id)
    }
    memory.current = { found, phase, shown, entered }
    return memory.current
  }, [found, phase])

  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    if (!steady.entered.length) return
    setHighlighted(new Set(steady.entered))
    const timer = setTimeout(() => setHighlighted(new Set()), FRESH_MS)
    return () => clearTimeout(timer)
  }, [steady])
  return { shown: steady.shown, highlighted }
}

const count = (n: number) => n.toLocaleString('en-US')

function CitationItem({
  citation,
  expanded,
  onToggle,
  linkTarget = false,
}: {
  citation: Citation
  expanded: boolean
  onToggle: () => void
  /** Carries the citation's anchor id; only one list on the page may. */
  linkTarget?: boolean
}) {
  const links = useCitationLinks()
  const lit =
    links?.selected?.anchor === citation.anchor ||
    links?.hovered === citation.anchor
  const near = !lit && Boolean(links?.inView.has(citation.anchor))

  // A click on the card's own links or buttons keeps its meaning; anywhere
  // else opens or closes the full post.
  const onClick = (event: MouseEvent<HTMLLIElement>) => {
    if ((event.target as HTMLElement).closest('a, button')) return
    onToggle()
  }

  return (
    <li
      id={linkTarget ? citation.anchor : undefined}
      data-anchor={citation.anchor}
      tabIndex={-1}
      onClick={onClick}
      onMouseEnter={() => links?.hover(citation.anchor)}
      onMouseLeave={() => links?.hover(null)}
      className={`flex scroll-mt-14 items-start gap-1 pl-3 transition-colors focus:outline-none [&_article]:hover:bg-transparent ${
        lit ? 'bg-brand/10' : near ? 'bg-muted/60' : 'hover:bg-muted/40'
      } ${expanded ? '' : 'cursor-pointer'}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`Citation ${citation.n}: ${expanded ? 'show less' : 'show the full post'}`}
        className={`mt-3 inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          lit
            ? 'bg-brand text-brand-foreground'
            : 'bg-muted text-foreground hover:bg-accent'
        }`}
      >
        {citation.n}
      </button>
      <div className="min-w-0 flex-1">
        {expanded ? (
          <TweetCard tweet={citation.tweet} stacked showDate showExternalLink />
        ) : (
          <TweetCard
            tweet={citation.tweet}
            stacked
            compact
            collapsible
            showDate
          />
        )}
      </div>
    </li>
  )
}

/** Cited posts as compact rows that open in full; the phone Cited tab. */
export function CitationList({ citations }: { citations: Citation[] }) {
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  return (
    <ol className="divide-y divide-border border-y border-border">
      {citations.map((citation) => (
        <CitationItem
          key={citation.id}
          citation={citation}
          expanded={opened.has(citation.anchor)}
          onToggle={() =>
            setOpened((current) => {
              const next = new Set(current)
              if (next.has(citation.anchor)) next.delete(citation.anchor)
              else next.add(citation.anchor)
              return next
            })
          }
        />
      ))}
    </ol>
  )
}

/**
 * The cited posts beside the answer. On wide screens it is its own rail:
 * a hairline edge and faint surface for the whole turn, and a list pinned
 * under the site header that scrolls by itself, so following a citation
 * never moves the answer.
 */
export const CitationRail = forwardRef<
  HTMLElement,
  {
    citations: Citation[]
    active: boolean
    /** Shown while the run is still searching and nothing is cited yet. */
    found: FoundTweet[]
    /** Whether `found` holds the latest matches or the most relevant. */
    foundPhase?: FoundPhase
    /** Distinct tweets the run has found so far. */
    foundCount?: number
    /** Wide screens: the reader closed the column. */
    hidden?: boolean
    onHide?: () => void
  }
>(function CitationRail(
  {
    citations,
    active,
    found,
    foundPhase = { kind: 'latest', source: null },
    foundCount = found.length,
    hidden = false,
    onHide,
  },
  ref,
) {
  const steady = useSteadyFound(found, foundPhase.kind)
  const links = useCitationLinks()
  const railRef = useRef<HTMLElement | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const pointerInside = useRef(false)
  // While the rail scrolls to a chosen post, the position shows that post,
  // even if the list ends before it can reach the top.
  const holdPositionUntil = useRef(0)
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [position, setPosition] = useState(1)

  const setRefs = (node: HTMLElement | null) => {
    railRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  const scrollToAnchor = useCallback(
    (anchor: string, onlyIfHidden: boolean) => {
      const rail = railRef.current
      if (!rail || !railActive()) return
      const item = rail.querySelector<HTMLElement>(
        `[data-anchor="${CSS.escape(anchor)}"]`,
      )
      if (!item) return
      const top = headerRef.current?.offsetHeight ?? 0
      const visibleFrom = rail.scrollTop + top
      const visibleTo = rail.scrollTop + rail.clientHeight
      if (
        onlyIfHidden &&
        item.offsetTop >= visibleFrom &&
        item.offsetTop + Math.min(item.offsetHeight, 120) <= visibleTo
      ) {
        return
      }
      rail.scrollTo({
        top: Math.max(0, item.offsetTop - top - 4),
        behavior: reducedMotion() ? 'auto' : 'smooth',
      })
    },
    [],
  )

  // A chip click opens its post and brings it into the rail.
  const selected = links?.selected ?? null
  useEffect(() => {
    if (!selected) return
    const citation = citations.find((item) => item.anchor === selected.anchor)
    if (!citation) return
    setOpened((current) => new Set(current).add(selected.anchor))
    setPosition(citation.n)
    holdPositionUntil.current = Date.now() + 1000
    // After the card has grown to its full size.
    requestAnimationFrame(() => scrollToAnchor(selected.anchor, false))
  }, [selected, citations, scrollToAnchor])

  // Reading along: keep the posts of the paragraph in view visible, unless
  // the member is using the rail.
  const firstInView = citations.find((citation) =>
    links?.inView.has(citation.anchor),
  )?.anchor
  useEffect(() => {
    if (!firstInView || pointerInside.current) return
    scrollToAnchor(firstInView, true)
  }, [firstInView, scrollToAnchor])

  const onScroll = () => {
    if (Date.now() < holdPositionUntil.current) return
    const rail = railRef.current
    if (!rail) return
    const top = rail.scrollTop + (headerRef.current?.offsetHeight ?? 0)
    const items = Array.from(
      rail.querySelectorAll<HTMLElement>('[data-anchor]'),
    )
    const index = items.findIndex(
      (item) => item.offsetTop + item.offsetHeight / 2 >= top,
    )
    if (index >= 0) setPosition(index + 1)
  }

  // Nothing cited and nothing found yet: an empty column would say nothing.
  if (!citations.length && !(active && found.length)) return null
  const showFound = active && !citations.length
  const title = !showFound
    ? 'Cited'
    : foundPhase.kind === 'relevant'
      ? 'Most relevant so far'
      : 'Latest matches'
  // What the column draws from, updating as the run goes.
  const foundLine = !showFound
    ? null
    : foundPhase.kind === 'relevant'
      ? `${count(foundCount)} found · ${count(foundPhase.relevant)} judged relevant`
      : foundPhase.source
        ? `${count(foundCount)} found · newest from ${foundPhase.source.charAt(0).toLowerCase()}${foundPhase.source.slice(1)}`
        : `${count(foundCount)} found`

  const toggle = (anchor: string) =>
    setOpened((current) => {
      const next = new Set(current)
      if (next.has(anchor)) next.delete(anchor)
      else next.add(anchor)
      return next
    })

  // Phones show the rail only while a run is going; once answered, cited
  // tweets move into the Cited tier of Sources under the answer.
  return (
    <div
      className={`${active ? '' : 'hidden'} lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-stretch ${hidden ? 'lg:hidden' : 'lg:block'}`}
    >
      <aside
        ref={setRefs}
        aria-label={showFound ? title : 'Cited tweets'}
        onScroll={onScroll}
        onPointerEnter={() => (pointerInside.current = true)}
        onPointerLeave={() => (pointerInside.current = false)}
        className="scroll-mt-24 lg:sticky lg:top-14 lg:max-h-[calc(100vh-3.5rem)] lg:overflow-y-auto lg:overscroll-contain"
      >
        <div
          ref={headerRef}
          className="z-20 flex min-h-[2.5rem] items-center gap-3 border-b border-border bg-background/95 py-1 backdrop-blur lg:sticky lg:top-0 lg:px-4"
        >
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {title}
              {citations.length > 0 && (
                <span className="ml-1.5 font-normal tabular-nums">
                  · {citations.length}
                </span>
              )}
            </h3>
            {foundLine && (
              <p className="truncate text-xs tabular-nums text-muted-foreground">
                {foundLine}
              </p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {citations.length > 1 && (
              <span
                aria-hidden="true"
                className="hidden text-xs tabular-nums text-muted-foreground lg:inline"
              >
                {Math.min(position, citations.length)} of {citations.length}
              </span>
            )}
            {onHide && (
              <button
                type="button"
                onClick={onHide}
                aria-label="Close cited tweets"
                title="Close"
                className="-mr-1.5 hidden h-7 w-7 shrink-0 items-center justify-center self-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {citations.length ? (
          <ol className="divide-y divide-border">
            {citations.map((citation) => (
              <CitationItem
                key={citation.id}
                citation={citation}
                expanded={opened.has(citation.anchor)}
                onToggle={() => toggle(citation.anchor)}
                linkTarget
              />
            ))}
          </ol>
        ) : (
          <ul className="divide-y divide-border">
            {steady.shown.map(({ tweet, score }) => (
              <li
                key={tweet.id}
                className={`relative transition-colors duration-1000 motion-reduce:transition-none ${
                  score !== undefined ? '[&_article]:pr-14' : ''
                } ${steady.highlighted.has(tweet.id) ? 'bg-brand/10' : ''}`}
              >
                <TweetCard tweet={tweet} stacked compact collapsible showDate />
                {score !== undefined && (
                  <span
                    title="Relevance score: the chance the relevance check gave that this tweet answers the question"
                    className="absolute right-4 top-3 text-[11px] tabular-nums text-muted-foreground"
                  >
                    {score.toFixed(2)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
})
