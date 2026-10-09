'use client'

import { useState } from 'react'
import { Check, ChevronRight, AlertCircle, Loader2 } from 'lucide-react'
import TweetCard from '@/components/TweetCard'
import { AnswerMarkdown } from './AnswerMarkdown'
import { EvidenceBoundary } from './EvidenceBoundary'
import {
  NOT_SEARCHED_LINE,
  type CoverageView,
  type ProgressLine,
  type TurnView,
} from './messageView'

const OTHER_PAGE_SIZE = 30

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
  if (active) {
    return (
      <div aria-live="polite" aria-label="Search progress">
        {lines.length ? (
          list
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2
              aria-hidden="true"
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
            />
            Planning searches
          </p>
        )}
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

function OtherPosts({ tweets }: { tweets: TurnView['otherTweets'] }) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(OTHER_PAGE_SIZE)
  if (!tweets.length) return null
  return (
    <details
      className="group"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-medium text-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        Other posts the search found ({tweets.length.toLocaleString('en-US')})
      </summary>
      {/* Cards mount only when opened: a run can return hundreds of posts. */}
      {open && (
        <div className="mt-3">
          <ul className="space-y-3">
            {tweets.slice(0, shown).map((tweet) => (
              <li key={tweet.id}>
                <TweetCard tweet={tweet} compact collapsible showDate />
              </li>
            ))}
          </ul>
          {shown < tweets.length && (
            <button
              type="button"
              onClick={() => setShown((count) => count + OTHER_PAGE_SIZE)}
              className="mt-3 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Show {Math.min(OTHER_PAGE_SIZE, tweets.length - shown)} more
            </button>
          )}
        </div>
      )}
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
  // Wide screens: the answer on the left, cited tweets in a sticky column
  // beside it so a citation and its tweet are both on screen. Narrow screens:
  // the cited tweets follow the answer.
  return (
    <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-x-8 lg:gap-y-5 lg:space-y-0">
      <div className="min-w-0 space-y-5 lg:col-start-1">
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
        <CitedTweets citations={answer.citations} active={active} />
      </EvidenceBoundary>

      {!active && (
        <div className="min-w-0 space-y-5 lg:col-start-1">
          <EvidenceBoundary label="other posts">
            <OtherPosts tweets={view.otherTweets} />
          </EvidenceBoundary>
          <CoverageBlock coverage={view.coverage} />
        </div>
      )}
    </div>
  )
}

function CitedTweets({
  citations,
  active,
}: {
  citations: TurnView['answer']['citations']
  active: boolean
}) {
  if (!citations.length && !active) return null
  return (
    <aside
      aria-label="Cited tweets"
      className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
    >
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Cited tweets
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
      ) : (
        <p className="hidden text-sm text-muted-foreground lg:block">
          Tweets appear here as the answer cites them.
        </p>
      )}
    </aside>
  )
}
