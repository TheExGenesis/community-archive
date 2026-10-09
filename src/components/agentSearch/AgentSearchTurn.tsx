'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, AlertCircle, Loader2 } from 'lucide-react'
import { AnswerMarkdown } from './AnswerMarkdown'
import { CitationContext, type CitationLinks } from './CitationContext'
import { CitationRail } from './CitationRail'
import { EvidenceBoundary } from './EvidenceBoundary'
import { EvidenceTabs, type EvidenceTab } from './EvidenceTabs'
import {
  NOT_SEARCHED_LINE,
  receiptSegments,
  type CoverageView,
  type ProgressLine,
  type ReceiptTarget,
  type TurnView,
} from './messageView'

export function ProgressList({
  lines,
  active,
}: {
  lines: ProgressLine[]
  active: boolean
}) {
  const list = (
    <ol className="space-y-1.5 text-sm text-muted-foreground">
      {lines.map((line) => (
        <li key={line.id} className="flex items-start gap-2">
          {line.status === 'running' ? (
            <Loader2
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
            />
          ) : line.status === 'error' ? (
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
            />
          ) : (
            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span className="min-w-0 break-words">{line.text}</span>
        </li>
      ))}
    </ol>
  )

  // While the agent works, this lists what it did; afterwards the same
  // ground is covered by How this was searched under the evidence.
  if (!active) return null
  return (
    <div aria-live="polite" aria-label="Search progress">
      {lines.length > 0 && list}
    </div>
  )
}

export function CoverageBlock({ coverage }: { coverage: CoverageView }) {
  const nothingRan =
    !coverage.searches.length &&
    !coverage.scored &&
    !coverage.threadsRead &&
    !coverage.quotesRead &&
    !coverage.people.length
  return (
    <section
      aria-label="How this was searched"
      className="space-y-2 border-l-2 border-border pl-4 text-sm text-muted-foreground"
    >
      {nothingRan ? (
        <p>Answered from the posts found for the earlier question.</p>
      ) : (
        coverage.searches.length > 0 && (
          <ul className="space-y-1">
            {coverage.searches.map((search) => (
              <li key={search.label} className="break-words">
                <span className="text-foreground">{search.label}</span>
                {' · '}
                {search.detail}
              </li>
            ))}
          </ul>
        )
      )}
      {coverage.people.length > 0 && (
        <p>
          Looked up {coverage.people.map((name) => `“${name}”`).join(', ')}.
        </p>
      )}
      {coverage.scored > 0 && (
        <p>
          Checked {coverage.scored.toLocaleString('en-US')} posts against your
          question: {coverage.kept.toLocaleString('en-US')} relevant
          {coverage.capped ? ', stopped at the limit, so more exist' : ''}.
        </p>
      )}
      {(coverage.threadsRead > 0 || coverage.quotesRead > 0) && (
        <p>
          Read{' '}
          {[
            coverage.threadsRead
              ? `${coverage.threadsRead} ${coverage.threadsRead === 1 ? 'thread' : 'threads'}`
              : null,
            coverage.quotesRead
              ? `the quotes of ${coverage.quotesRead} ${coverage.quotesRead === 1 ? 'post' : 'posts'}`
              : null,
          ]
            .filter(Boolean)
            .join(' and ')}
          .
        </p>
      )}
      <p>{NOT_SEARCHED_LINE}.</p>
    </section>
  )
}

/** One muted line under the question: what the answer rests on. */
function Receipt({
  receipt,
  onSelect,
}: {
  receipt: TurnView['receipt']
  onSelect: (target: ReceiptTarget) => void
}) {
  const segments = receiptSegments(receipt)
  return (
    <p className="text-sm text-muted-foreground">
      {segments.map((segment, index) => (
        <span key={segment.text}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          {segment.target ? (
            <button
              type="button"
              onClick={() => onSelect(segment.target as ReceiptTarget)}
              className="rounded-sm underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {segment.text}
            </button>
          ) : (
            segment.text
          )}
        </span>
      ))}
    </p>
  )
}

function SearchDetails({ coverage }: { coverage: CoverageView }) {
  return (
    <details className="group mt-4">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        How this was searched
      </summary>
      <div className="mt-2">
        <CoverageBlock coverage={coverage} />
      </div>
    </details>
  )
}

export function AgentSearchTurn({
  view,
  active,
}: {
  view: TurnView
  active: boolean
}) {
  const { answer } = view
  const hasAnswer = Boolean(answer.markdown.trim())
  // Until the member picks a tab, open the strongest tier that has posts.
  const [chosenTab, setTab] = useState<EvidenceTab | null>(null)
  const tab = chosenTab ?? (view.receipt.relevant > 0 ? 'relevant' : 'other')
  const evidenceRef = useRef<HTMLElement>(null)
  const citedRef = useRef<HTMLElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<CitationLinks['selected']>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [inView, setInView] = useState<ReadonlySet<string>>(new Set())
  const links = useMemo<CitationLinks>(
    () => ({
      selected,
      hovered,
      inView,
      select: (anchor) =>
        setSelected((current) => ({ anchor, seq: (current?.seq ?? 0) + 1 })),
      hover: setHovered,
    }),
    [selected, hovered, inView],
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

  const showTier = (target: ReceiptTarget) => {
    if (target === 'cited') {
      citedRef.current?.scrollIntoView({ block: 'start' })
      return
    }
    setTab(target)
    evidenceRef.current?.scrollIntoView({ block: 'start' })
  }

  // A run stopped or failed before any search: the note above says so, and
  // there is nothing else to show.
  if (view.outcome !== 'done' && !active && view.progress.length === 0) {
    return null
  }

  // Wide screens: the answer on the left, cited tweets in a sticky column
  // beside it so a citation and its tweet are both on screen. Narrow screens:
  // the cited tweets follow the answer.
  return (
    <CitationContext.Provider value={links}>
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-x-8 lg:gap-y-5 lg:space-y-0">
        <div className="min-w-0 space-y-5 lg:col-start-1">
          {!active && <Receipt receipt={view.receipt} onSelect={showTier} />}
          <ProgressList lines={view.progress} active={active && !hasAnswer} />

          {hasAnswer && (
            <div
              ref={answerRef}
              className="break-words text-base text-foreground"
            >
              <AnswerMarkdown>{answer.markdown}</AnswerMarkdown>
            </div>
          )}

          {!active && answer.unverified.length > 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              {answer.unverified.length === 1
                ? 'One citation points to a post the searches never returned, so it is marked unverified: '
                : `${answer.unverified.length} citations point to posts the searches never returned, so they are marked unverified: `}
              <span className="break-all font-mono text-xs">
                {answer.unverified.join(', ')}
              </span>
            </p>
          )}
        </div>

        <EvidenceBoundary label="cited tweets">
          <CitationRail
            ref={citedRef}
            citations={answer.citations}
            active={active}
            found={view.topFound}
          />
        </EvidenceBoundary>

        {!active && (
          <section
            ref={evidenceRef}
            aria-label="Evidence"
            className="min-w-0 scroll-mt-24 lg:col-start-1"
          >
            <EvidenceBoundary label="evidence">
              <EvidenceTabs
                tab={tab}
                onTabChange={setTab}
                relevant={view.relevant}
                relevantTotal={view.receipt.relevant}
                otherMatches={view.otherMatches}
                groups={view.groups}
                footer={<SearchDetails coverage={view.coverage} />}
              />
            </EvidenceBoundary>
          </section>
        )}
      </div>
    </CitationContext.Provider>
  )
}
