'use client'

import { forwardRef, useRef, useState } from 'react'
import { Check, ChevronRight, AlertCircle, Loader2 } from 'lucide-react'
import TweetCard from '@/components/TweetCard'
import { AnswerMarkdown } from './AnswerMarkdown'
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

  // While the agent works, progress is the main thing on screen; afterwards
  // the steps fold away behind the answer.
  // The status row above says the run started; this lists what it did.
  if (active) {
    return (
      <div aria-live="polite" aria-label="Search progress">
        {lines.length > 0 && list}
      </div>
    )
  }
  if (!lines.length) return null
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        {lines.length === 1
          ? '1 research step'
          : `${lines.length} research steps`}
      </summary>
      <div className="mt-2 pl-5">{list}</div>
    </details>
  )
}

export function CoverageBlock({ coverage }: { coverage: CoverageView }) {
  return (
    <section
      aria-label="Coverage"
      className="rounded-lg border border-border bg-muted px-4 py-3 text-sm"
    >
      <h3 className="font-semibold text-foreground">Coverage</h3>
      {coverage.searches.length ? (
        <ul className="mt-2 space-y-1 text-muted-foreground">
          {coverage.searches.map((search, index) => (
            <li key={`${search.label}-${index}`} className="break-words">
              <span className="text-foreground">{search.label}</span>
              {' · '}
              {search.detail}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-muted-foreground">No searches ran.</p>
      )}
      {coverage.scored > 0 && (
        <p className="mt-2 text-muted-foreground">
          {coverage.scored.toLocaleString('en-US')} posts scored for relevance,{' '}
          {coverage.kept.toLocaleString('en-US')} kept.
        </p>
      )}
      {(coverage.threadsRead > 0 || coverage.quotesRead > 0) && (
        <p className="mt-1 text-muted-foreground">
          {[
            coverage.threadsRead
              ? `${coverage.threadsRead} ${coverage.threadsRead === 1 ? 'thread' : 'threads'} read`
              : null,
            coverage.quotesRead
              ? `quotes read for ${coverage.quotesRead} ${coverage.quotesRead === 1 ? 'post' : 'posts'}`
              : null,
          ]
            .filter(Boolean)
            .join(', ')}
          .
        </p>
      )}
      <p className="mt-2 text-muted-foreground">{NOT_SEARCHED_LINE}.</p>
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
    <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-x-8 lg:gap-y-5 lg:space-y-0">
      <div className="min-w-0 space-y-5 lg:col-start-1">
        {!active && <Receipt receipt={view.receipt} onSelect={showTier} />}
        <ProgressList lines={view.progress} active={active && !hasAnswer} />

        {hasAnswer && (
          <div className="break-words text-base text-foreground">
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
        <CitedTweets
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
  )
}

const CitedTweets = forwardRef<
  HTMLElement,
  {
    citations: TurnView['answer']['citations']
    active: boolean
    /** Shown while the run is still searching and nothing is cited yet. */
    found: TurnView['topFound']
  }
>(function CitedTweets({ citations, active, found }, ref) {
  if (!citations.length && !active) return null
  const showFound = active && !citations.length && found.length > 0
  return (
    <aside
      ref={ref}
      aria-label={showFound ? 'Posts found so far' : 'Cited tweets'}
      className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
    >
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {showFound ? 'Posts found so far' : 'Cited tweets'}
        {citations.length > 0 && (
          <span className="ml-1.5 font-normal normal-case tracking-normal">
            ({citations.length})
          </span>
        )}
      </h3>
      {citations.length ? (
        <ol className="space-y-3">
          {citations.map((citation) => (
            <li
              key={citation.id}
              id={citation.anchor}
              tabIndex={-1}
              className="flex scroll-mt-4 gap-2 rounded-lg target:ring-2 target:ring-brand/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-label={`Citation ${citation.n}`}
                className="min-w-5 mt-3 inline-flex h-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-foreground"
              >
                {citation.n}
              </span>
              <div className="min-w-0 flex-1">
                <TweetCard tweet={citation.tweet} showDate showExternalLink />
              </div>
            </li>
          ))}
        </ol>
      ) : showFound ? (
        <ul className="space-y-3">
          {found.map((tweet) => (
            <li key={tweet.id}>
              <TweetCard tweet={tweet} compact collapsible showDate />
            </li>
          ))}
        </ul>
      ) : (
        <p className="hidden text-sm text-muted-foreground lg:block">
          Tweets appear here as the answer cites them.
        </p>
      )}
    </aside>
  )
})
