'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  ArrowUpRight,
  Brain,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  Eye,
  FolderSearch,
  Layers,
  ListFilter,
  Loader2,
  MessageCircleQuestion,
  MessagesSquare,
  Quote,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Users,
  type LucideIcon,
} from 'lucide-react'
import {
  formatElapsed,
  latestThought,
  NOT_SEARCHED_LINE,
  type ProgressLine,
  type StepKind,
  type TimelineEntry,
} from './messageView'

/** After this long the log says so. */
const SLOW_MS = 90_000
/** A stopped or failed log shows its latest steps; earlier ones fold. */
const VISIBLE_STEPS = 6

// What each step did, at a glance; how it went shows in how the icon looks.
const KIND_ICONS: Record<StepKind, LucideIcon> = {
  question: MessageCircleQuestion,
  search: Search,
  semantic: Sparkles,
  people: Users,
  score: ListFilter,
  thread: MessagesSquare,
  quotes: Quote,
  tweets: Layers,
  show: Eye,
  files: FolderSearch,
  other: Circle,
}

type Status = ProgressLine['status'] | 'stopped'

const ICON_STATUS: Record<Status, string> = {
  running: 'animate-pulse text-foreground motion-reduce:animate-none',
  error: 'text-destructive',
  stopped: 'opacity-50',
  done: '',
}

function KindIcon({
  kind = 'other',
  status,
}: {
  kind?: StepKind | 'thinking'
  status: Status
}) {
  const Icon = kind === 'thinking' ? Brain : KIND_ICONS[kind]
  return (
    <Icon aria-hidden="true" className={`h-4 w-4 ${ICON_STATUS[status]}`} />
  )
}

/**
 * One line of the log, in columns every line shares: what it did, left of
 * the rail; then a caret where the line opens (its place kept where it does
 * not); then what it says.
 */
function LogRow({
  icon,
  className = '',
  children,
}: {
  icon: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <li className={`flex ${className}`}>
      <span className="flex w-5 shrink-0 justify-center pt-0.5">{icon}</span>
      <div className="min-w-0 flex-1 border-l border-border pb-1.5 pl-1">
        {children}
      </div>
    </li>
  )
}

/** A note under the steps, on the rail in the text column. */
function LogNote({
  children,
  caret,
}: {
  children: ReactNode
  /** The log keeps a caret column: start where its text does. */
  caret: boolean
}) {
  return (
    <div className="flex">
      <span className="w-5 shrink-0" />
      <p
        className={`min-w-0 flex-1 border-l border-border pb-1.5 text-sm text-muted-foreground ${
          caret ? 'pl-[calc(0.25rem+1rem)]' : 'pl-1'
        }`}
      >
        {children}
      </p>
    </div>
  )
}

/** Whether a log has a line that opens, and so keeps a caret column. */
const anyOpens = (entries: TimelineEntry[]) =>
  entries.some((entry) => entry.kind === 'thinking')

/** The caret column: a caret on a line that opens, its room on one that does not. */
function Caret({ open }: { open?: boolean }) {
  return (
    <span className="flex h-5 w-3.5 shrink-0 items-center justify-center">
      {open !== undefined && (
        <ChevronRight
          aria-hidden="true"
          className={`h-3.5 w-3.5 opacity-60 transition-transform group-hover:opacity-100 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
      )}
    </span>
  )
}

/**
 * The step's search on the archive search page, in a new tab. Quiet: it shows
 * when the line is hovered or focused; where nothing can hover, it stays as a
 * small icon so it can still be reached.
 */
function OpenInSearch({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open this search in archive search"
      className="ml-2 inline-flex items-center gap-0.5 whitespace-nowrap rounded-sm align-baseline text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground hover:underline focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
    >
      <span className="[@media(hover:none)]:sr-only">Open in search</span>
      <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
    </a>
  )
}

function StepItem({
  step,
  status,
  caret,
}: {
  step: ProgressLine
  status: ProgressLine['status'] | 'stopped'
  /** The log keeps a caret column: hold its place. */
  caret: boolean
}) {
  return (
    <LogRow
      className="group"
      icon={<KindIcon kind={step.kind} status={status} />}
    >
      <div className="flex items-start gap-0.5">
        {caret && <Caret />}
        <span
          className={`min-w-0 break-words ${status === 'running' ? 'text-foreground' : ''}`}
        >
          {step.text}
          {step.searchHref && <OpenInSearch href={step.searchHref} />}
        </span>
      </div>
    </LogRow>
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
    <LogRow
      icon={<KindIcon kind="thinking" status={current ? 'running' : 'done'} />}
    >
      <button
        type="button"
        onClick={() => setReaderOpen(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="group flex max-w-full items-start gap-0.5 rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Caret open={open} />
        <span className="min-w-0 truncate">
          <span className={current ? 'text-foreground' : ''}>Thinking</span>
          {!open && <span> · {firstSentence(text)}</span>}
        </span>
      </button>
      {open && (
        // On the rail with the rest, under the text column.
        <p
          ref={bodyRef}
          id={bodyId}
          className="mt-1 max-h-60 max-w-[68ch] overflow-y-auto whitespace-pre-wrap break-words pl-4 text-xs leading-relaxed text-muted-foreground"
        >
          {text}
        </p>
      )}
    </LogRow>
  )
}

function StepList({
  entries,
  live = false,
  stoppedRunning = false,
  id,
  caret,
}: {
  entries: TimelineEntry[]
  /** Keep the caret column though no line opens (under a header that has one). */
  caret?: boolean
  /** The run is still going: its latest reasoning is being written. */
  live?: boolean
  /** A run that is over: a step still marked running was cut short. */
  stoppedRunning?: boolean
  id?: string
}) {
  return (
    <ol id={id} className="text-sm text-muted-foreground">
      {entries.map((entry, _index, all) =>
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
            caret={caret ?? anyOpens(all)}
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

// Always there while a run goes, so it needs no frame to be found.
const STOP_CLASS =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60'

/**
 * Where a Stop stands with the server: asked and not yet confirmed, or
 * refused, in which case the run goes on and Stop can be pressed again.
 */
export type StopState = 'pending' | 'failed'

function StopButton({
  onStop,
  state = null,
}: {
  onStop: () => void
  state?: StopState | null
}) {
  return (
    <span className="flex shrink-0 items-center gap-3">
      {state === 'failed' && (
        <span role="alert" className="text-xs text-muted-foreground">
          Couldn’t stop. Try again.
        </span>
      )}
      <button
        type="button"
        onClick={onStop}
        disabled={state === 'pending'}
        className={STOP_CLASS}
      >
        {state === 'pending' ? (
          <Loader2
            aria-hidden="true"
            className="h-3 w-3 animate-spin motion-reduce:animate-none"
          />
        ) : (
          <Square aria-hidden="true" className="h-3 w-3 fill-current" />
        )}
        {state === 'pending' ? 'Stopping…' : 'Stop'}
      </button>
    </span>
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
  stopState = null,
}: {
  steps: ProgressLine[]
  timeline?: TimelineEntry[]
  startedAt: number
  onStop: () => void
  stopState?: StopState | null
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
            kind: 'question',
          },
        },
      ]
  const current = entries[entries.length - 1]
  // The header is always the step under way; the log below it is what came
  // before, plus the reasoning being written so it can be read as it streams.
  const below = entries.filter(
    (entry, index) =>
      index < entries.length - 1 || (entry.kind === 'thinking' && open),
  )
  const stepCount = logged.filter((entry) => entry.kind === 'step').length
  const thought = current.kind === 'thinking' ? latestThought(current.text) : ''
  return (
    <div className="space-y-2">
      <div className="flex min-h-[2.5rem] items-center gap-3">
        {/* Only the step line is announced; the clock beside it is not. */}
        {/* The log's columns, so the rail runs from here down through the
            steps below. */}
        <div
          aria-live="polite"
          aria-label="Search progress"
          className="flex min-w-0 flex-1 self-stretch"
        >
          <span className="flex w-5 shrink-0 items-center justify-center">
            {current.kind === 'thinking' ? (
              <KindIcon kind="thinking" status="running" />
            ) : (
              <KindIcon kind={current.line.kind} status={current.line.status} />
            )}
          </span>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={listId}
            className="group flex min-h-[2.5rem] min-w-0 flex-1 items-center gap-0.5 border-l border-border pl-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Caret open={open} />
            <span className="min-w-0 truncate">
              <span className="text-foreground">
                {current.kind === 'thinking' ? 'Thinking' : current.line.text}
              </span>
              {thought && (
                <span className="text-muted-foreground"> · {thought}</span>
              )}
            </span>
          </button>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {stepCount > 0 && (
            <span className="hidden sm:inline">
              {stepCount} {stepCount === 1 ? 'step' : 'steps'} ·{' '}
            </span>
          )}
          <span aria-label={`${Math.floor(elapsed / 1000)} seconds`}>
            {formatElapsed(elapsed)}
          </span>
          {elapsed >= SLOW_MS && <span> · longer than most</span>}
        </span>
        <StopButton onStop={onStop} state={stopState} />
      </div>
      {open && below.length > 0 && (
        <StepList id={listId} entries={below} live caret />
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
      /** A Stop the server has yet to confirm, or refused. */
      stopState?: StopState | null
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
        stopState={props.stopState}
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
  stopState = null,
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
  /** A Stop the server has yet to confirm, or refused. */
  stopState?: StopState | null
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
        {onStop && <StopButton onStop={onStop} state={stopState} />}
      </div>
      {open && (
        // The type icons sit under the header's chevron; one rail runs down.
        <div id={contentId} className="-ml-0.5">
          {entries.length > 0 && (
            <StepList entries={entries} live={Boolean(onStop)} />
          )}
          {cappedAt ? (
            <LogNote caret={anyOpens(entries)}>
              A check stopped at its {cappedAt.toLocaleString('en-US')}-tweet
              limit, so more matching tweets exist.
            </LogNote>
          ) : null}
          <LogNote caret={anyOpens(entries)}>{NOT_SEARCHED_LINE}.</LogNote>
        </div>
      )}
    </div>
  )
}
