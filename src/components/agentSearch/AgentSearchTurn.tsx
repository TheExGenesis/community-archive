'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnswerMarkdown } from './AnswerMarkdown'
import { CitationContext, type CitationLinks } from './CitationContext'
import { CitationRail } from './CitationRail'
import { CitationSheet } from './CitationSheet'
import { EvidenceBoundary } from './EvidenceBoundary'
import { logSummary, type TurnView } from './messageView'
import { ResultList } from './ResultList'
import { Sources } from './Sources'
import { LogLine, StepLog } from './StepLog'

/** A run that ended without a full answer, as the page knows it. */
export interface TurnInterruption {
  kind: 'stopped' | 'failed'
  /** How long a run stopped in this visit had run; null when unknown. */
  elapsedMs: number | null
}

export function AgentSearchTurn({
  view,
  active,
  interrupted = null,
  startedAt = Date.now(),
  onStop,
  onAskAgain,
  canAskAgain = true,
  showSources = true,
}: {
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
}) {
  const { answer } = view
  const hasAnswer = answer.blocks.length > 0
  const answerRef = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<CitationLinks['selected']>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [inView, setInView] = useState<ReadonlySet<string>>(new Set())
  const [sheetAnchor, setSheetAnchor] = useState<string | null>(null)
  const sheetChipRef = useRef<HTMLElement | null>(null)
  const links = useMemo<CitationLinks>(
    () => ({
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
    }),
    [selected, hovered, inView],
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

  const log = active ? (
    hasAnswer ? (
      <LogLine
        summary={logSummary(view, { writing: true })}
        steps={view.progress}
        onStop={onStop}
      />
    ) : (
      <StepLog
        mode="running"
        steps={view.progress}
        startedAt={startedAt}
        onStop={onStop ?? (() => undefined)}
      />
    )
  ) : ended ? (
    <StepLog
      mode={ended.kind}
      steps={view.progress}
      elapsedMs={ended.elapsedMs}
      unavailable={ended.kind === 'failed' && view.unavailable}
      onAskAgain={onAskAgain}
      canAskAgain={canAskAgain}
    />
  ) : (
    <LogLine
      summary={logSummary(view)}
      steps={view.progress}
      cappedAt={view.receipt.cappedAt}
    />
  )

  // Wide screens: the answer on the left, cited tweets in a sticky column
  // beside it so a citation and its tweet are both on screen. Narrow screens:
  // the cited tweets are a tier of Sources under the answer.
  return (
    <CitationContext.Provider value={links}>
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-x-8 lg:gap-y-5 lg:space-y-0">
        <div className="min-w-0 space-y-5 lg:col-start-1">
          {log}

          {hasAnswer && (
            <div
              ref={answerRef}
              className="max-w-[68ch] break-words text-base text-foreground"
            >
              {answer.blocks.map((block, index) =>
                block.kind === 'text' ? (
                  <AnswerMarkdown key={`text-${index}`}>
                    {block.markdown}
                  </AnswerMarkdown>
                ) : (
                  <EvidenceBoundary key={block.key} label="tweet list">
                    <ResultList
                      label={block.label}
                      tweets={block.tweets}
                      citations={citationNumbers}
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

        <EvidenceBoundary label="cited tweets">
          <CitationRail
            citations={answer.citations}
            active={active}
            found={view.topFound}
          />
        </EvidenceBoundary>

        {!active && showSources && (
          <div className="min-w-0 scroll-mt-24 lg:col-start-1">
            <EvidenceBoundary label="sources">
              <Sources
                title={
                  ended?.kind === 'stopped'
                    ? 'Found before you stopped'
                    : ended
                      ? 'Found before it stopped'
                      : 'Sources'
                }
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
}
