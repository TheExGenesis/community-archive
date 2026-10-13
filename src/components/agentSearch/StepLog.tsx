'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  AlertCircle,
  Brain,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Loader2,
  Minus,
  RotateCcw,
  Square,
} from 'lucide-react'
import {
  formatElapsed,
  latestThought,
  NOT_SEARCHED_LINE,
  type ProgressLine,
  type TimelineEntry,
} from './messageView'

/** After this long the log says so. */
const SLOW_MS = 90_000
/** A stopped or failed log shows its latest steps; earlier ones fold. */
const VISIBLE_STEPS = 6

function StepIcon({ status }: { status: ProgressLine['status'] | 'stopped' }) {
  if (status === 'running') {
    return (
      <Loader2
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-foreground motion-reduce:animate-none"
      />
    )
  }
  if (status === 'error') {
    return (
      <AlertCircle
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
      />
    )
  }
  if (status === 'stopped') {
    return <Minus aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
  }
  return <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
}

function StepItem({
  step,
  status,
}: {
  step: ProgressLine
  status: ProgressLine['status'] | 'stopped'
}) {
  return (
    <li className="flex items-start gap-2">
      <StepIcon status={status} />
      <span
        className={`min-w-0 break-words ${status === 'running' ? 'text-foreground' : ''}`}
      >
        {step.text}
      </span>
    </li>
  )
}

/** The first sentence of some reasoning, for its folded line. */
function firstSentence(text: string) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? flat
}

/**
 * The model's reasoning between steps. While it is being written it stays
 * open and shows the whole text as it streams; once the next step starts it
 * folds to its first sentence. A reader's own open or close wins over both.
 */
function ThinkingItem({ text, current }: { text: string; current: boolean }) {
  const [readerOpen, setReaderOpen] = useState<boolean | null>(null)
  const open = readerOpen ?? current
  const bodyId = useId()
  const bodyRef = useRef<HTMLParagraphElement>(null)
  // Keep the newest text in view while it streams.
  useEffect(() => {
    const body = bodyRef.current
    if (body && current) body.scrollTop = body.scrollHeight
  }, [text, current, open])
  return (
    <li className="flex items-start gap-2">
      <Brain
        aria-hidden="true"
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          current
            ? 'animate-pulse text-foreground motion-reduce:animate-none'
            : ''
        }`}
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setReaderOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="group flex max-w-full items-start gap-1 rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 truncate">
            <span className={current ? 'text-foreground' : ''}>Thinking</span>
            {!open && <span> · {firstSentence(text)}</span>}
          </span>
          <ChevronRight
            aria-hidden="true"
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:opacity-100 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          />
        </button>
        {open && (
          <p
            ref={bodyRef}
            id={bodyId}
            className="mt-1 max-h-60 max-w-[68ch] overflow-y-auto whitespace-pre-wrap break-words border-l border-border pl-3 text-xs leading-relaxed text-muted-foreground"
          >
            {text}
          </p>
        )}
      </div>
    </li>
  )
}

function StepList({
  entries,
  live = false,
  stoppedRunning = false,
  id,
}: {
  entries: TimelineEntry[]
  /** The run is still going: its latest reasoning is being written. */
  live?: boolean
  /** A run that is over: a step still marked running was cut short. */
  stoppedRunning?: boolean
  id?: string
}) {
  return (
    <ol id={id} className="space-y-1.5 text-sm text-muted-foreground">
      {entries.map((entry) =>
        entry.kind === 'thinking' ? (
          <ThinkingItem
            key={entry.id}
            text={entry.text}
            current={live && entry.latest}
          />
        ) : (
          <StepItem
            key={entry.line.id}
            step={entry.line}
            status={
              stoppedRunning && entry.line.status === 'running'
                ? 'stopped'
                : entry.line.status
            }
          />
        ),
      )}
    </ol>
  )
}

/** The timeline a log shows: the turn's own, or just its steps. */
const entriesFor = (
  steps: ProgressLine[],
  timeline: TimelineEntry[] | undefined,
): TimelineEntry[] =>
  timeline ?? steps.map((line) => ({ kind: 'step' as const, line }))

function useElapsed(startedAt: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return Math.max(0, now - startedAt)
}

const STOP_CLASS =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function StopButton({ onStop }: { onStop: () => void }) {
  return (
    <button type="button" onClick={onStop} className={STOP_CLASS}>
      <Square aria-hidden="true" className="h-3 w-3 fill-current" />
      Stop
    </button>
  )
}

/**
 * The live log while a question searches, before any answer text. The
 * header folds the steps to one line: the step under way and the model's
 * newest sentence about it. Stop stays either way.
 */
function RunningLog({
  steps,
  timeline,
  startedAt,
  onStop,
}: {
  steps: ProgressLine[]
  timeline?: TimelineEntry[]
  startedAt: number
  onStop: () => void
}) {
  const elapsed = useElapsed(startedAt)
  const [open, setOpen] = useState(true)
  const listId = useId()
  const logged = entriesFor(steps, timeline)
  // Before anything streams, the model is reading the question.
  const entries: TimelineEntry[] = logged.length
    ? logged
    : [
        {
          kind: 'step',
          line: {
            id: 'reading',
            status: 'running',
            text: 'Reading the question',
          },
        },
      ]
  const current = entries[entries.length - 1]
  return (
    <div className="space-y-2">
      <div className="flex min-h-[2.5rem] items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={listId}
          className="-ml-1.5 inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-md px-1.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          />
          Searching
          <span
            aria-label={`${Math.floor(elapsed / 1000)} seconds`}
            className="font-normal tabular-nums text-muted-foreground"
          >
            {' '}
            · {formatElapsed(elapsed)}
          </span>
        </button>
        <StopButton onStop={onStop} />
      </div>
      <div aria-live="polite" aria-label="Search progress">
        {open ? (
          <StepList id={listId} entries={entries} live />
        ) : (
          <p
            id={listId}
            className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground"
          >
            {current.kind === 'thinking' ? (
              <Brain aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <StepIcon status={current.line.status} />
            )}
            <span className="min-w-0 truncate">
              <span className="text-foreground">
                {current.kind === 'thinking' ? 'Thinking' : current.line.text}
              </span>
              {current.kind === 'thinking' && latestThought(current.text) && (
                <span> · {latestThought(current.text)}</span>
              )}
            </span>
          </p>
        )}
      </div>
      {elapsed >= SLOW_MS && (
        <p className="text-xs text-muted-foreground">
          Most questions finish within a minute. This one is still searching.
        </p>
      )}
    </div>
  )
}

/**
 * A run that is over without a full answer: stopped by the member or
 * failed. The steps stay where they were, latest last, with a way to ask
 * again.
 */
function EndedLog({
  mode,
  steps: loggedSteps,
  timeline,
  elapsedMs,
  unavailable,
  onAskAgain,
  canAskAgain,
}: {
  mode: 'stopped' | 'failed'
  steps: ProgressLine[]
  timeline?: TimelineEntry[]
  elapsedMs: number | null
  unavailable: boolean
  onAskAgain?: () => void
  canAskAgain: boolean
}) {
  const entries = entriesFor(loggedSteps, timeline)
  const [showEarlier, setShowEarlier] = useState(false)
  const reasonId = useId()
  const listId = useId()
  // The latest six steps show, with the reasoning between them; earlier
  // ones fold.
  const stepIndexes = entries.flatMap((entry, index) =>
    entry.kind === 'step' ? [index] : [],
  )
  const hiddenSteps = Math.max(0, stepIndexes.length - VISIBLE_STEPS)
  const cut = hiddenSteps ? stepIndexes[hiddenSteps] : 0
  // Reasoning just before the first visible step belongs with it.
  const start = cut && entries[cut - 1]?.kind === 'thinking' ? cut - 1 : cut
  const visible = showEarlier ? entries : entries.slice(start)
  const hidden = hiddenSteps

  const title =
    mode === 'stopped'
      ? !loggedSteps.length
        ? 'You stopped this before it searched'
        : elapsedMs !== null
          ? `You stopped this at ${formatElapsed(elapsedMs)}`
          : 'You stopped this'
      : unavailable
        ? 'Archive search isn’t responding'
        : 'The answer stopped before it finished'

  return (
    <div className="space-y-2" role={mode === 'failed' ? 'alert' : 'status'}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {title}
            {loggedSteps.length > 0 && (
              <span className="font-normal text-muted-foreground">
                {' '}
                · {loggedSteps.length}{' '}
                {loggedSteps.length === 1 ? 'step' : 'steps'}
              </span>
            )}
          </p>
          {mode === 'failed' && unavailable && (
            <p className="text-xs text-muted-foreground">
              This question still counts toward today’s limit.
            </p>
          )}
        </div>
        {onAskAgain && (
          <div className="flex items-center gap-2">
            {!canAskAgain && (
              <span id={reasonId} className="text-xs text-muted-foreground">
                No questions left today
              </span>
            )}
            <button
              type="button"
              onClick={onAskAgain}
              disabled={!canAskAgain}
              aria-describedby={canAskAgain ? undefined : reasonId}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              Ask again
            </button>
          </div>
        )}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowEarlier((value) => !value)}
          aria-expanded={showEarlier}
          aria-controls={listId}
          className="flex items-center gap-2 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronsUpDown aria-hidden="true" className="h-4 w-4" />
          {showEarlier
            ? 'Hide earlier steps'
            : `${hidden} earlier ${hidden === 1 ? 'step' : 'steps'}`}
        </button>
      )}
      {visible.length > 0 && (
        <StepList id={listId} entries={visible} stoppedRunning />
      )}
    </div>
  )
}

export type StepLogProps =
  | {
      mode: 'running'
      steps: ProgressLine[]
      /** The steps with the model's reasoning between them (TurnView). */
      timeline?: TimelineEntry[]
      startedAt: number
      onStop: () => void
    }
  | {
      mode: 'stopped' | 'failed'
      steps: ProgressLine[]
      timeline?: TimelineEntry[]
      /** How long a run stopped in this visit had run; null when unknown. */
      elapsedMs: number | null
      /** Failed with every tool call failing. */
      unavailable?: boolean
      onAskAgain?: () => void
      canAskAgain?: boolean
    }

/**
 * The agent's steps for one question. Running: the live list with Stop.
 * Stopped or failed: the same steps stay put, with Ask again.
 */
export function StepLog(props: StepLogProps) {
  if (props.mode === 'running') {
    return (
      <RunningLog
        steps={props.steps}
        timeline={props.timeline}
        startedAt={props.startedAt}
        onStop={props.onStop}
      />
    )
  }
  return (
    <EndedLog
      mode={props.mode}
      steps={props.steps}
      timeline={props.timeline}
      elapsedMs={props.elapsedMs}
      unavailable={Boolean(props.unavailable)}
      onAskAgain={props.onAskAgain}
      canAskAgain={props.canAskAgain ?? true}
    />
  )
}

/**
 * The step log folded to one line once the answer starts: the same steps,
 * opened in place. Stop stays beside it while the answer is written.
 */
export function LogLine({
  summary,
  steps,
  timeline,
  cappedAt,
  onStop,
  more,
}: {
  summary: string
  steps: ProgressLine[]
  /** The steps with the model's reasoning between them. */
  timeline?: TimelineEntry[]
  /** The tweet limit a check stopped at, when one did. */
  cappedAt?: number | null
  /** Set while the answer is still being written. */
  onStop?: () => void
  /** Tweets found but not in the answer, which open below it. */
  more?: {
    count: number
    open: boolean
    controls: string
    onToggle: () => void
  }
}) {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const entries = entriesFor(steps, timeline)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={contentId}
          className="-ml-1.5 inline-flex min-h-[2.5rem] max-w-full items-center gap-1.5 rounded-md px-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          />
          <span className="min-w-0">{summary}</span>
        </button>
        {more && (
          <button
            type="button"
            onClick={more.onToggle}
            aria-expanded={more.open}
            aria-controls={more.controls}
            className="group -ml-3 mr-auto inline-flex min-h-[2.5rem] shrink-0 items-center rounded-md px-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true" className="mr-1.5">
              ·
            </span>
            <span className="underline decoration-muted-foreground/40 underline-offset-4 group-hover:decoration-foreground">
              {more.count.toLocaleString('en-US')} more found
            </span>
          </button>
        )}
        {onStop && <StopButton onStop={onStop} />}
      </div>
      {open && (
        <div
          id={contentId}
          className="ml-1.5 space-y-2 border-l border-border pl-4"
        >
          {entries.length > 0 && (
            <StepList entries={entries} live={Boolean(onStop)} />
          )}
          {cappedAt ? (
            <p className="text-sm text-muted-foreground">
              A check stopped at its {cappedAt.toLocaleString('en-US')}-tweet
              limit, so more matching tweets exist.
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">{NOT_SEARCHED_LINE}.</p>
        </div>
      )}
    </div>
  )
}
