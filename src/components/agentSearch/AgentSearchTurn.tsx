'use client'

import { PanelRightOpen } from 'lucide-react'
import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnswerMarkdown } from './AnswerMarkdown'
import {
  CitationContext,
  RAIL_MEDIA,
  type CitationLinks,
} from './CitationContext'
import { CitationRail } from './CitationRail'
import { CitationSheet } from './CitationSheet'
import { EvidenceBoundary } from './EvidenceBoundary'
import { logSummary, type TurnView } from './messageView'
import { peopleFromTweets } from './profileLinks'
import { EmbeddedTweet, ResultList } from './ResultList'
import { useCitedColumnHidden } from './railPreference'
import { Sources } from './Sources'
import { LogLine, StepLog } from './StepLog'

/** A run that ended without a full answer, as the page knows it. */
export interface TurnInterruption {
  kind: 'stopped' | 'failed'
  /** How long a run stopped in this visit had run; null when unknown. */
  elapsedMs: number | null
}

interface AgentSearchTurnProps {
  view: TurnView
  active: boolean
  interrupted?: TurnInterruption | null
  /** Client clock when the question was sent or reopened, for the timer. */
  startedAt?: number
  onStop?: () => void
  onAskAgain?: () => void
  canAskAgain?: boolean
  /** The latest turn, or one that was stopped: earlier ones keep the rest. */
  showSources?: boolean
}

export const AgentSearchTurn = memo(function AgentSearchTurn({
  view,
  active,
  interrupted = null,
  startedAt = Date.now(),
  onStop,
  onAskAgain,
  canAskAgain = true,
  showSources = true,
}: AgentSearchTurnProps) {
  const { answer } = view
  const hasAnswer = answer.blocks.length > 0
  const answerRef = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<CitationLinks['selected']>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [inView, setInView] = useState<ReadonlySet<string>>(new Set())
  const [sheetAnchor, setSheetAnchor] = useState<string | null>(null)
  const sheetChipRef = useRef<HTMLElement | null>(null)
  const citedByAnchor = useMemo(
    () =>
      new Map(
        answer.citations.map((citation) => [citation.anchor, citation.tweet]),
      ),
    [answer.citations],
  )
  // Handles in the answer link to profiles only for people whose tweets the
  // run returned, so a misspelt or invented handle stays plain text.
  const people = useMemo(
    () =>
      peopleFromTweets([
        answer.citations.map((citation) => citation.tweet),
        ...answer.blocks.flatMap((block) =>
          block.kind === 'list' ? [block.tweets] : [],
        ),
        view.relevant,
        view.otherMatches,
      ]),
    [answer.citations, answer.blocks, view.relevant, view.otherMatches],
  )
  const [railHidden, setRailHidden] = useCitedColumnHidden()
  const links = useMemo<CitationLinks>(
    () => ({
      railShown: !railHidden,
      selected,
      hovered,
      inView,
      select: (anchor) =>
        setSelected((current) => ({ anchor, seq: (current?.seq ?? 0) + 1 })),
      hover: setHovered,
      openSheet: (anchor, chip) => {
        sheetChipRef.current = chip
        setSheetAnchor(anchor)
      },
      tweetFor: (anchor) => citedByAnchor.get(anchor),
    }),
    [selected, hovered, inView, citedByAnchor, railHidden],
  )
  const citationNumbers = useMemo(
    () =>
      new Map(answer.citations.map((citation) => [citation.id, citation.n])),
    [answer.citations],
  )

  // The paragraph nearest the middle of the screen marks its citations, so
  // the rail can follow the reader.
  const answerKey = active ? '' : answer.markdown
  useEffect(() => {
    const root = answerRef.current
    if (!root || !answerKey || typeof IntersectionObserver === 'undefined') {
      return
    }
    const blocks = Array.from(
      root.querySelectorAll<HTMLElement>('p, li'),
    ).filter((block) => block.querySelector('a[href^="#ask-"]'))
    const visible = new Set<HTMLElement>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const block = entry.target as HTMLElement
          if (entry.isIntersecting) visible.add(block)
          else visible.delete(block)
        }
        // The innermost visible block: a list item's paragraph, not the list.
        const block = Array.from(visible).find(
          (candidate) =>
            !Array.from(visible).some(
              (other) => other !== candidate && candidate.contains(other),
            ),
        )
        const anchors = new Set(
          Array.from(
            block?.querySelectorAll<HTMLAnchorElement>('a[href^="#ask-"]') ??
              [],
          ).map((chip) => chip.getAttribute('href')!.slice(1)),
        )
        setInView((current) =>
          current.size === anchors.size &&
          Array.from(anchors).every((anchor) => current.has(anchor))
            ? current
            : anchors,
        )
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    blocks.forEach((block) => observer.observe(block))
    return () => observer.disconnect()
  }, [answerKey])

  // A turn that ended without a full answer keeps its steps in view.
  const ended: TurnInterruption | null = active
    ? null
    : (interrupted ??
      (view.outcome === 'done'
        ? null
        : { kind: view.outcome, elapsedMs: null }))

  // Tweets found but not in the answer open below it from the log line's
  // count. Phones always show them, since they also hold the cited tier.
  const [moreOpen, setMoreOpen] = useState(false)
  const sourcesRef = useRef<HTMLDivElement>(null)
  const sourcesId = useId()
  const moreCount = view.receipt.relevant + view.receipt.other
  const moreControl =
    showSources && !ended && moreCount > 0
      ? {
          count: moreCount,
          open: moreOpen,
          controls: sourcesId,
          onToggle: () => {
            const wide = window.matchMedia?.(RAIL_MEDIA).matches ?? false
            const opening = !wide || !moreOpen
            if (wide) setMoreOpen(opening)
            if (opening) {
              requestAnimationFrame(() =>
                sourcesRef.current?.scrollIntoView({ block: 'start' }),
              )
            }
          },
        }
      : undefined

  const log = active ? (
    hasAnswer ? (
      <LogLine
        summary={logSummary(view, { writing: true })}
        steps={view.progress}
        timeline={view.timeline}
        onStop={onStop}
      />
    ) : (
      <StepLog
        mode="running"
        steps={view.progress}
        timeline={view.timeline}
        startedAt={startedAt}
        onStop={onStop ?? (() => undefined)}
      />
    )
  ) : ended ? (
    <StepLog
      mode={ended.kind}
      steps={view.progress}
      timeline={view.timeline}
      elapsedMs={ended.elapsedMs}
      unavailable={ended.kind === 'failed' && view.unavailable}
      onAskAgain={onAskAgain}
      canAskAgain={canAskAgain}
    />
  ) : (
    <LogLine
      summary={logSummary(view, { withoutMore: Boolean(moreControl) })}
      steps={view.progress}
      timeline={view.timeline}
      cappedAt={view.receipt.cappedAt}
      more={moreControl}
    />
  )

  // Wide screens: the answer on the left, cited tweets in a sticky column
  // beside it so a citation and its tweet are both on screen. The answer
  // keeps a reading width; the column takes the rest, up to a width tweet
  // cards still read well at. Narrow screens: the cited tweets are a tier of
  // Sources under the answer.
  return (
    <CitationContext.Provider value={links}>
      <div
        className={`space-y-5 lg:grid ${railHidden ? 'lg:grid-cols-[minmax(0,48rem)_auto]' : 'lg:grid-cols-[minmax(0,48rem)_minmax(21rem,32rem)]'} lg:items-start lg:gap-x-8 lg:gap-y-5 lg:space-y-0`}
      >
        <div className="min-w-0 space-y-5 lg:col-start-1">
          {log}

          {hasAnswer && (
            <div
              ref={answerRef}
              className="max-w-[68ch] break-words text-base text-foreground"
            >
              {answer.blocks.map((block, index) =>
                block.kind === 'text' ? (
                  <AnswerMarkdown key={`text-${index}`} people={people}>
                    {block.markdown}
                  </AnswerMarkdown>
                ) : block.kind === 'tweet' ? (
                  <EvidenceBoundary key={block.key} label="tweet">
                    <EmbeddedTweet citation={block.citation} />
                  </EvidenceBoundary>
                ) : (
                  <EvidenceBoundary key={block.key} label="tweet list">
                    <ResultList
                      label={block.label}
                      tweets={block.tweets}
                      citations={citationNumbers}
                      view={block.view}
                      scores={block.scores}
                    />
                  </EvidenceBoundary>
                ),
              )}
              {ended && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Unfinished answer
                </p>
              )}
            </div>
          )}

          {!active && answer.unverified.length > 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              {answer.unverified.length === 1
                ? 'One citation points to a tweet the searches never returned, so it is marked unverified: '
                : `${answer.unverified.length} citations point to tweets the searches never returned, so they are marked unverified: `}
              <span className="break-all font-mono text-xs">
                {answer.unverified.join(', ')}
              </span>
            </p>
          )}
          {!active && answer.missingLists.length > 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              {answer.missingLists.length === 1
                ? 'A list the answer referred to could not be found.'
                : `${answer.missingLists.length} lists the answer referred to could not be found.`}
            </p>
          )}
        </div>

        {railHidden &&
          (answer.citations.length > 0 ||
            (active && view.topFound.length > 0)) && (
            // Where the closed column was, so it reopens from the same spot.
            <div className="hidden lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block">
              <button
                type="button"
                onClick={() => setRailHidden(false)}
                className="sticky top-16 inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-md px-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PanelRightOpen aria-hidden="true" className="h-4 w-4" />
                {answer.citations.length ? 'Cited' : 'Found so far'}
                {answer.citations.length > 0 && (
                  <span className="font-normal tabular-nums">
                    · {answer.citations.length}
                  </span>
                )}
              </button>
            </div>
          )}
        <EvidenceBoundary label="cited tweets">
          <CitationRail
            citations={answer.citations}
            active={active}
            found={view.topFound}
            hidden={railHidden}
            onHide={() => setRailHidden(true)}
          />
        </EvidenceBoundary>

        {!active && showSources && (
          <div
            ref={sourcesRef}
            id={sourcesId}
            className={`min-w-0 scroll-mt-24 lg:col-start-1 ${
              moreControl && !moreOpen ? 'lg:hidden' : ''
            }`}
          >
            <EvidenceBoundary label="sources">
              <Sources
                title={
                  ended?.kind === 'stopped'
                    ? 'Found before you stopped'
                    : ended
                      ? 'Found before it stopped'
                      : 'Sources'
                }
                // Opened from the count, the section needs no heading of
                // its own on wide screens.
                titleClassName={moreControl ? 'lg:sr-only' : undefined}
                relevant={view.relevant}
                relevantNotShown={view.relevantNotShown}
                otherMatches={view.otherMatches}
                citations={answer.citations}
              />
            </EvidenceBoundary>
          </div>
        )}
      </div>
      <CitationSheet
        citations={answer.citations}
        anchor={sheetAnchor}
        onNavigate={setSheetAnchor}
        onClose={() => setSheetAnchor(null)}
        returnFocusTo={sheetChipRef.current}
      />
    </CitationContext.Provider>
  )
}, sameTurn)

/**
 * A finished answer only changes with its view or its state; the page's
 * handlers are stable and the interruption is rebuilt each render, so it is
 * compared by value.
 */
function sameTurn(a: AgentSearchTurnProps, b: AgentSearchTurnProps) {
  return (
    a.view === b.view &&
    a.active === b.active &&
    a.startedAt === b.startedAt &&
    a.onStop === b.onStop &&
    a.onAskAgain === b.onAskAgain &&
    a.canAskAgain === b.canAskAgain &&
    a.showSources === b.showSources &&
    a.interrupted?.kind === b.interrupted?.kind &&
    a.interrupted?.elapsedMs === b.interrupted?.elapsedMs
  )
}
