'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnswerMarkdown } from './AnswerMarkdown'
import {
  CitationContext,
  SIDEBAR_MEDIA,
  type CitationLinks,
} from './CitationContext'
import { CitationList, CitationRail } from './CitationRail'
import { CitationSheet } from './CitationSheet'
import { CitationSidebar } from './CitationSidebar'
import {
  closeCitationSidebar,
  openCitationSidebar,
  useCitationSidebar,
} from './citationSidebarStore'
import { EvidenceBoundary } from './EvidenceBoundary'
import { logSummary, type TurnView } from './messageView'
import { peopleFromTweets } from './profileLinks'
import { EmbeddedTweet, ResultList } from './ResultList'
import { Sources } from './Sources'
import { LogLine, StepLog } from './StepLog'
import { RETRY_BUTTON } from './TweetPlaceholder'

const plural = (n: number, word: string) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? word : `${word}s`}`

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
  /** A reopened conversation: fetches again the tweets that failed to load. */
  onRetryTweets?: () => void
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
  onRetryTweets,
}: AgentSearchTurnProps) {
  const { answer } = view
  const hasAnswer = answer.blocks.length > 0
  const answerRef = useRef<HTMLDivElement>(null)

  const [hovered, setHovered] = useState<string | null>(null)
  const [inView, setInView] = useState<ReadonlySet<string>>(new Set())
  const [sheetAnchor, setSheetAnchor] = useState<string | null>(null)
  const sheetChipRef = useRef<HTMLElement | null>(null)
  const citedByAnchor = useMemo(
    () =>
      new Map(answer.citations.map((citation) => [citation.anchor, citation])),
    [answer.citations],
  )
  // Handles in the answer link to profiles only for people whose tweets the
  // run returned, so a misspelt or invented handle stays plain text.
  const people = useMemo(
    () =>
      peopleFromTweets([
        answer.citations.flatMap((citation) =>
          citation.tweet ? [citation.tweet] : [],
        ),
        ...answer.blocks.flatMap((block) =>
          block.kind === 'list' ? [block.tweets] : [],
        ),
        view.relevant,
        view.otherMatches,
      ]),
    [answer.citations, answer.blocks, view.relevant, view.otherMatches],
  )
  // The page's one sidebar, when it shows one of this answer's citations.
  const sidebar = useCitationSidebar()
  const selected = sidebar && citedByAnchor.has(sidebar.anchor) ? sidebar : null
  const links = useMemo<CitationLinks>(
    () => ({
      selected,
      hovered,
      inView,
      hover: setHovered,
      openSidebar: openCitationSidebar,
      openSheet: (anchor, chip) => {
        sheetChipRef.current = chip
        setSheetAnchor(anchor)
      },
      citationFor: (anchor) => citedByAnchor.get(anchor),
      retryTweets: onRetryTweets,
    }),
    [selected, hovered, inView, citedByAnchor, onRetryTweets],
  )
  const citationNumbers = useMemo(
    () =>
      new Map(answer.citations.map((citation) => [citation.id, citation.n])),
    [answer.citations],
  )

  // The paragraph nearest the middle of the screen marks its citations, so
  // the sidebar can follow the reader.
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
  // count. Phones always show them.
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
            const wide = window.matchMedia?.(SIDEBAR_MEDIA).matches ?? false
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

  // Lists show their own placeholders and Retry row, so the turn's line
  // only counts tweets outside them (citations, the column, sources).
  const inLists = { loading: 0, failed: 0 }
  for (const block of answer.blocks) {
    if (block.kind !== 'list') continue
    for (const item of block.pending) {
      if (item.state === 'loading' || item.state === 'failed') {
        inLists[item.state] += 1
      }
    }
  }
  const elsewhere = {
    loading: Math.max(0, view.tweets.loading - inLists.loading),
    failed: Math.max(0, view.tweets.failed - inLists.failed),
  }

  // One column: the answer at a reading width, its cited tweets under it,
  // then what else the search found. A citation chip opens its tweet in the
  // sidebar on wide screens and in a sheet on narrow ones. While the run
  // still searches, the tweets found so far sit where the cited ones will.
  const cited = answer.citations.length
  return (
    <CitationContext.Provider value={links}>
      <div className="space-y-5">
        <div className="min-w-0 space-y-5">
          {log}

          {hasAnswer && (
            <div
              ref={answerRef}
              className="max-w-[68ch] break-words text-base text-foreground"
            >
              {answer.checking && (
                <div className="space-y-2" role="status" aria-live="polite">
                  {answer.citations.some(
                    (citation) => citation.state === 'failed',
                  ) ? (
                    <p className="text-sm text-muted-foreground">
                      Couldn’t check the tweets this answer cites, so it isn’t
                      shown yet.{' '}
                      {onRetryTweets && (
                        <button
                          type="button"
                          onClick={onRetryTweets}
                          className="text-foreground underline underline-offset-2 hover:text-brand"
                        >
                          Retry
                        </button>
                      )}
                    </p>
                  ) : (
                    <>
                      <span className="sr-only">Checking the cited tweets</span>
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-11/12" />
                      <Skeleton className="h-4 w-4/5" />
                    </>
                  )}
                </div>
              )}
              {answer.blocks.map((block, index) =>
                answer.checking && block.kind !== 'list' ? null : block.kind ===
                  'text' ? (
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
                      pending={block.pending}
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
          {!active && answer.withheld && (
            <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              <p>
                Part of this answer relied on tweets that are no longer
                available, so it isn’t shown. Ask again for a fresh answer.
              </p>
              {onAskAgain && canAskAgain && (
                <button
                  type="button"
                  onClick={onAskAgain}
                  className={`mt-1 ${RETRY_BUTTON}`}
                >
                  Ask again
                </button>
              )}
            </div>
          )}
          {!active && answer.authorMismatches.length > 0 && (
            <p className="rounded-md border border-dashed border-destructive/50 px-3 py-2 text-sm text-muted-foreground">
              {answer.authorMismatches.length === 1
                ? `Citation ${answer.authorMismatches[0].n} points at a tweet by @${answer.authorMismatches[0].author}, not @${answer.authorMismatches[0].named}, the person its sentence names.`
                : `${answer.authorMismatches.length} citations point at tweets by someone other than the person their sentence names: ${answer.authorMismatches
                    .map((item) => item.n)
                    .join(', ')}.`}
            </p>
          )}
          {!active && !answer.withheld && answer.unavailable.length > 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              {answer.unavailable.length === 1
                ? 'One tweet in this answer is no longer available: it was deleted, or its author has opted out of the archive.'
                : `${answer.unavailable.length} tweets in this answer are no longer available: they were deleted, or their authors have opted out of the archive.`}
            </p>
          )}
          {!active && elsewhere.loading > 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading {plural(elsewhere.loading, 'tweet')}…
            </p>
          )}
          {!active && elsewhere.loading === 0 && elsewhere.failed > 0 && (
            <p className="text-sm text-muted-foreground">
              Couldn’t load {plural(elsewhere.failed, 'tweet')}
              {onRetryTweets && (
                <>
                  {' '}
                  <span aria-hidden="true">·</span>{' '}
                  <button
                    type="button"
                    onClick={onRetryTweets}
                    className={RETRY_BUTTON}
                  >
                    Retry
                  </button>
                </>
              )}
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

        {cited > 0 ? (
          <section aria-label="Cited tweets" className="min-w-0 space-y-2">
            <h3 className="text-base font-semibold text-foreground">
              Cited{' '}
              <span className="font-normal tabular-nums text-muted-foreground">
                · {cited}
              </span>
            </h3>
            <EvidenceBoundary label="cited tweets">
              <CitationList citations={answer.citations} linkTarget />
            </EvidenceBoundary>
          </section>
        ) : (
          active && (
            <EvidenceBoundary label="found tweets">
              <CitationRail
                citations={answer.citations}
                active={active}
                found={view.topFound}
                foundPhase={view.foundPhase}
                foundCount={view.foundSoFar}
              />
            </EvidenceBoundary>
          )
        )}

        {!active && showSources && (
          <div
            ref={sourcesRef}
            id={sourcesId}
            className={`min-w-0 scroll-mt-24 ${
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
        onRetry={onRetryTweets}
      />
      {cited > 0 && (
        <CitationSidebar open={Boolean(selected)}>
          <EvidenceBoundary label="cited tweets">
            <CitationRail
              citations={answer.citations}
              active={active}
              found={view.topFound}
              variant="sidebar"
              onHide={closeCitationSidebar}
            />
          </EvidenceBoundary>
        </CitationSidebar>
      )}
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
    a.onRetryTweets === b.onRetryTweets &&
    a.interrupted?.kind === b.interrupted?.kind &&
    a.interrupted?.elapsedMs === b.interrupted?.elapsedMs
  )
}
