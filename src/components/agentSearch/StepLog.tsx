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
  stopped: 'text-muted-foreground/45',
  done: 'text-muted-foreground/70',
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
    <Icon
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 ${ICON_STATUS[status]}`}
    />
  )
}

/** One line of the log: subtle icon beside clean text, no vertical divider rail. */
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
    <li className={`flex items-start gap-2.5 py-1 ${className}`}>
      <span className="mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  )
}

/** A quiet note under the steps inside an expanded log. */
function LogNote({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs text-muted-foreground/75">{children}</p>
}

/**
 * The step's search on the archive search page, in a new tab. Quiet: it shows
 * when the line is hovered or focused; where nothing can hover, it stays as a
 * small icon so it can still be reached.
 */
function OpenInSearch({
  href,
  nested = false,
}: {
  href: string
  nested?: boolean
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open this search in archive search"
      className={`ml-2 inline-flex items-center gap-0.5 whitespace-nowrap rounded-sm align-baseline text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground hover:underline focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [@media(hover:none)]:opacity-100 ${
        nested ? 'group-hover/sub:opacity-100' : 'group-hover:opacity-100'
      }`}
    >
      <span className="[@media(hover:none)]:sr-only">Open in search</span>
      <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
    </a>
  )
}

const SUB_SEARCH_LABEL = /^Searched “([^”]+)”(?: from @([\w]+))?(?:, .*)?$/

function subSearchHref(
  label: string,
  searchHrefs?: Record<string, string>,
): string | undefined {
  if (!searchHrefs) return undefined
  const match = SUB_SEARCH_LABEL.exec(label)
  if (!match) return undefined
  const key = `${match[1].toLowerCase()}|${(match[2] ?? '').toLowerCase()}`
  return searchHrefs[key]
}

// Compound parallel (`par`) or chained steps join each sub-action summary
// with ` · ` (workspace.ts). Splitting on known action verbs lets us display
// them as a crisp summary row that expands into a clean vertical sub-list.
const COMPOUND_SPLIT =
  / · (?=(?:Searched |Read |Looked up |Checked |Expanded |Fetched |Wrote |Interactions |No member |Thread not found|Nothing to expand))/

const COUNT_SUFFIX =
  / · ([\d,]+) (tweets?|members?|accounts?|months?)(?:,.*)?$/i
const SAME_SEARCH_FROM = /^Searched (“[^”]+”) from @[\w]+(?: · |$)/

function splitCompoundStep(text: string): string[] {
  const parts = text.split(COMPOUND_SPLIT)
  return parts.length > 1 ? parts : [text]
}

function sumTweetCounts(
  parts: string[],
): { total: number; unit: string } | null {
  let total = 0
  let unit: string | null = null
  for (const part of parts) {
    const match = COUNT_SUFFIX.exec(part)
    if (!match) return null
    const n = Number(match[1].replaceAll(',', ''))
    const kind = match[2].toLowerCase().replace(/s$/, '')
    if (unit && unit !== kind) return null
    unit = kind
    total += n
  }
  return unit ? { total, unit } : null
}

function compoundSummary(parts: string[]): string {
  const counts = sumTweetCounts(parts)
  const countText = counts
    ? ` · ${counts.total.toLocaleString('en-US')} ${counts.total === 1 ? counts.unit : `${counts.unit}s`}`
    : ''
  // e.g. 6 parallel `search architecture --from @user` -> `Searched “architecture” across 6 accounts · 132 tweets`
  const firstFrom = SAME_SEARCH_FROM.exec(parts[0])
  if (
    firstFrom &&
    parts.every((p) => SAME_SEARCH_FROM.exec(p)?.[1] === firstFrom[1])
  ) {
    return `Searched ${firstFrom[1]} across ${parts.length} accounts${countText}`
  }
  if (parts.every((p) => p.startsWith('Searched '))) {
    return `Ran ${parts.length} searches${countText}`
  }
  if (parts.every((p) => p.startsWith('Wrote '))) {
    return `Wrote ${parts.length} files${countText}`
  }
  return `${parts[0]} · +${parts.length - 1} more`
}

function summarizeStepText(text: string): string {
  const parts = splitCompoundStep(text)
  return parts.length > 1 ? compoundSummary(parts) : text
}

function StepItem({
  step,
  status,
  repeatCount = 1,
}: {
  step: ProgressLine
  status: ProgressLine['status'] | 'stopped'
  repeatCount?: number
}) {
  const parts = splitCompoundStep(step.text)
  const [open, setOpen] = useState(false)
  const subListId = useId()

  if (parts.length > 1 || (step.attempted && step.attempted.length > 1)) {
    const subItems = parts.length > 1 ? parts : step.attempted!
    const headerLabel = parts.length > 1 ? compoundSummary(parts) : step.text
    return (
      <LogRow icon={<KindIcon kind={step.kind} status={status} />}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={subListId}
          className="group/btn inline-flex max-w-full items-center gap-1 rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={`min-w-0 truncate ${
              status === 'running'
                ? 'font-medium text-foreground'
                : status === 'error'
                  ? 'text-destructive'
                  : ''
            }`}
          >
            {headerLabel}
            {step.partial && (
              <span className="text-muted-foreground/70"> · partial</span>
            )}
          </span>
          <ChevronRight
            aria-hidden="true"
            className={`h-3.5 w-3.5 shrink-0 opacity-50 transition-transform group-hover/btn:opacity-100 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          />
        </button>
        {open && (
          <ul
            id={subListId}
            className="mt-1 space-y-1 pl-0.5 text-xs leading-snug text-muted-foreground/85"
          >
            {subItems.map((part, idx) => {
              const sep = part.lastIndexOf(' · ')
              const label = sep >= 0 ? part.slice(0, sep) : part
              const meta = sep >= 0 ? part.slice(sep + 3) : null
              const href =
                parts.length > 1
                  ? subSearchHref(label, step.searchHrefs)
                  : undefined
              return (
                <li
                  key={`${idx}-${part}`}
                  className="group/sub flex items-baseline justify-between gap-4"
                >
                  <span className="min-w-0 break-words">
                    {label}
                    {href && <OpenInSearch href={href} nested />}
                  </span>
                  {meta && (
                    <span className="shrink-0 tabular-nums text-muted-foreground/70">
                      {meta}
                    </span>
                  )}
                </li>
              )
            })}
            {step.partial && (
              <li className="text-destructive/80">
                Another part of this batch did not finish
              </li>
            )}
          </ul>
        )}
      </LogRow>
    )
  }

  return (
    <LogRow
      className="group"
      icon={<KindIcon kind={step.kind} status={status} />}
    >
      <span
        className={`min-w-0 break-words ${
          status === 'running'
            ? 'font-medium text-foreground'
            : status === 'error'
              ? 'text-destructive'
              : ''
        }`}
      >
        {step.text}
        {step.partial && (
          <span className="text-muted-foreground/70"> · partial</span>
        )}
        {repeatCount > 1 && (
          <span className="text-muted-foreground/70"> · {repeatCount}×</span>
        )}
        {step.searchHref && <OpenInSearch href={step.searchHref} />}
      </span>
    </LogRow>
  )
}

/** The first sentence of some reasoning, for its folded line. */
function firstSentence(text: string) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? flat
}

/**
 * The model's reasoning between steps. Folded by default to a calm single-line
 * summary so raw internal monologue stays quiet unless the reader opens it.
 */
function ThinkingItem({ text, current }: { text: string; current: boolean }) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const bodyRef = useRef<HTMLParagraphElement>(null)
  const preview = current
    ? latestThought(text) || firstSentence(text)
    : firstSentence(text)
  // Keep the newest text in view if the reader chose to open it while streaming.
  useEffect(() => {
    const body = bodyRef.current
    if (body && current && open) body.scrollTop = body.scrollHeight
  }, [text, current, open])
  return (
    <LogRow
      icon={<KindIcon kind="thinking" status={current ? 'running' : 'done'} />}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="group inline-flex max-w-full items-center gap-1 rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 truncate">
          <span className={current ? 'font-medium text-foreground' : ''}>
            Thinking
          </span>
          {!open && preview && (
            <span className="text-muted-foreground/80"> · {preview}</span>
          )}
        </span>
        <ChevronRight
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 opacity-50 transition-transform group-hover:opacity-100 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <p
          ref={bodyRef}
          id={bodyId}
          className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words border-l border-border pl-3 pr-2 text-xs leading-relaxed text-muted-foreground/85"
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
  scrollable = false,
  id,
}: {
  entries: TimelineEntry[]
  /** The run is still going: its latest reasoning is being written. */
  live?: boolean
  /** A run that is over: a step still marked running was cut short. */
  stoppedRunning?: boolean
  /** Cap height and follow new entries while a run streams. */
  scrollable?: boolean
  id?: string
}) {
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const list = listRef.current
    if (!scrollable || !list) return
    // Keep scrolling to the latest step unless the reader scrolled up to inspect earlier ones.
    const nearBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight < 80
    if (nearBottom) list.scrollTop = list.scrollHeight
  }, [entries, scrollable])

  // Collapse consecutive identical "Looked through the results" shell reads
  // into a single quiet line with a repeat count (e.g. `· 3×`).
  const displayEntries: Array<
    TimelineEntry | { kind: 'step'; line: ProgressLine; repeatCount: number }
  > = []
  for (const entry of entries) {
    if (entry.kind === 'thinking' && !entry.text.trim()) continue
    const prev = displayEntries[displayEntries.length - 1]
    if (
      entry.kind === 'step' &&
      prev?.kind === 'step' &&
      entry.line.text === 'Looked through the results' &&
      prev.line.text === 'Looked through the results' &&
      entry.line.status === prev.line.status
    ) {
      displayEntries[displayEntries.length - 1] = {
        kind: 'step',
        line: prev.line,
        repeatCount: ('repeatCount' in prev ? prev.repeatCount : 1) + 1,
      }
      continue
    }
    displayEntries.push(entry)
  }

  return (
    <ol
      ref={listRef}
      id={id}
      className={`space-y-0.5 text-[13px] leading-snug text-muted-foreground ${
        scrollable
          ? 'max-h-72 overflow-y-auto overscroll-contain pb-1 pr-1'
          : ''
      }`}
    >
      {displayEntries.map((entry) =>
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
            repeatCount={'repeatCount' in entry ? entry.repeatCount : 1}
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

const ELAPSED_CLASS = 'shrink-0 text-xs tabular-nums text-muted-foreground'

/**
 * How long a finished run took: 26s, 4m 26s. Units, so it reads as a length
 * of time on its own; the ticking clock beside a live run stays m:ss.
 */
function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

/** The run's clock, ticking, for the log line while the answer is written. */
function LiveElapsed({ startedAt }: { startedAt: number }) {
  const elapsed = useElapsed(startedAt)
  return (
    <span
      className={ELAPSED_CLASS}
      aria-label={`${Math.floor(elapsed / 1000)} seconds`}
    >
      {formatElapsed(elapsed)}
    </span>
  )
}

// Compact, quiet stop button aligned with the status header.
const STOP_CLASS =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60'

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
    <span className="flex shrink-0 items-center gap-2">
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
          <Square aria-hidden="true" className="h-2.5 w-2.5 fill-current" />
        )}
        {state === 'pending' ? 'Stopping…' : 'Stop'}
      </button>
    </span>
  )
}

const STATUS_PILL_BASE =
  'inline-flex min-h-[2rem] max-w-full items-center gap-1.5 rounded-lg bg-muted/40 px-3 py-1 text-left text-[13px]'
const STATUS_PILL_INTERACTIVE = `${STATUS_PILL_BASE} group transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`
const SECONDARY_PILL =
  'group inline-flex min-h-[2rem] shrink-0 items-center gap-1.5 rounded-lg bg-muted/30 px-3 py-1 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const PILL_CHEVRON =
  'h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:text-foreground motion-reduce:transition-none'

/**
 * The pill's spinner while a run is going. It sits in the same 16px column as
 * the step icons below (LogRow), so the pill's label and the steps' text start
 * on one line down the page.
 */
function PillSpinner() {
  return (
    <span className="mr-1 flex h-4 w-4 shrink-0 items-center justify-center">
      <Loader2
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin text-muted-foreground motion-reduce:animate-none"
      />
    </span>
  )
}

/**
 * The live log while a question searches, before any answer text. Uses the
 * same compact status pill + open chronological list geometry as the finished
 * LogLine so loading transitions cleanly into completed without layout jumps.
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
  const stepCount = logged.filter((entry) => entry.kind === 'step').length
  const thought = current.kind === 'thinking' ? latestThought(current.text) : ''
  const hasBody = logged.length > 0
  const currentSummary =
    current.kind === 'thinking'
      ? thought
        ? `Thinking · ${thought}`
        : 'Thinking'
      : summarizeStepText(current.line.text)
  // While open, the chronological list below already shows each step — keep
  // the top pill calm and steady like the finished LogLine pill, while keeping
  // the active step in an sr-only live region for screen readers. When folded,
  // show the summarized current step right in the pill.
  const openLabel =
    current.kind === 'thinking' ? 'Thinking' : 'Searching the archive'
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Only the active status is announced; the ticking clock beside it is not. */}
        <div
          aria-live="polite"
          aria-label="Search progress"
          className="min-w-0 max-w-full"
        >
          {hasBody ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls={listId}
              className={STATUS_PILL_INTERACTIVE}
            >
              <PillSpinner />
              {open ? (
                <>
                  <span className="font-medium text-foreground">
                    {openLabel}
                  </span>
                  <span className="sr-only"> — {currentSummary}</span>
                </>
              ) : (
                <span className="min-w-0 truncate">
                  <span className="font-medium text-foreground">
                    {current.kind === 'thinking'
                      ? 'Thinking'
                      : summarizeStepText(current.line.text)}
                  </span>
                  {thought && (
                    <span className="text-muted-foreground"> · {thought}</span>
                  )}
                </span>
              )}
              <ChevronRight
                aria-hidden="true"
                className={`${PILL_CHEVRON} ${open ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <div className={STATUS_PILL_BASE}>
              <PillSpinner />
              <span className="font-medium text-foreground">
                Reading the question
              </span>
            </div>
          )}
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
        <div className="ml-auto">
          <StopButton onStop={onStop} state={stopState} />
        </div>
      </div>
      {open && hasBody && (
        <div className="pl-3">
          <StepList id={listId} entries={logged} live scrollable />
        </div>
      )}
    </div>
  )
}

/**
 * A run that is over without a full answer: stopped by the member or
 * failed. The steps stay in chronological order inside the same calm card,
 * with a way to ask again.
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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-foreground">
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
            <p className="mt-0.5 text-xs text-muted-foreground">
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
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              Ask again
            </button>
          </div>
        )}
      </div>
      {(hidden > 0 || visible.length > 0) && (
        <div className="space-y-2 pl-3">
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowEarlier((value) => !value)}
              aria-expanded={showEarlier}
              aria-controls={listId}
              className="-ml-1 inline-flex items-center gap-2.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                <ChevronsUpDown aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
              {showEarlier
                ? 'Hide earlier steps'
                : `${hidden} earlier ${hidden === 1 ? 'step' : 'steps'}`}
            </button>
          )}
          {visible.length > 0 && (
            <StepList id={listId} entries={visible} stoppedRunning />
          )}
        </div>
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
 * The step log folded to a calm rounded pill once the answer starts: the same
 * steps open cleanly underneath in a recessed card. Stop stays beside it while
 * the answer is written.
 */
export function LogLine({
  summary,
  steps,
  timeline,
  cappedAt,
  onStop,
  stopState = null,
  more,
  startedAt,
  durationMs = null,
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
  /** Client clock when the question was sent: the timer while writing. */
  startedAt?: number
  /** How long the finished run took, when known. */
  durationMs?: number | null
}) {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const entries = entriesFor(steps, timeline)
  const writing = Boolean(onStop)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={contentId}
          className={`${STATUS_PILL_INTERACTIVE} ${
            writing
              ? 'font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {writing && <PillSpinner />}
          <span className="min-w-0 truncate">{summary}</span>
          <ChevronRight
            aria-hidden="true"
            className={`${PILL_CHEVRON} ${open ? 'rotate-90' : ''}`}
          />
        </button>
        {more && (
          <button
            type="button"
            onClick={more.onToggle}
            aria-expanded={more.open}
            aria-controls={more.controls}
            className={SECONDARY_PILL}
          >
            <span>{more.count.toLocaleString('en-US')} more found</span>
            <ChevronRight
              aria-hidden="true"
              className={`${PILL_CHEVRON} ${more.open ? 'rotate-90' : ''}`}
            />
          </button>
        )}
        {/* Time comes last and quietest: the same clock the search showed,
            still running while the answer is written, then what it took. */}
        {writing && startedAt !== undefined ? (
          <LiveElapsed startedAt={startedAt} />
        ) : !writing && durationMs !== null ? (
          <span className={ELAPSED_CLASS}>{formatDuration(durationMs)}</span>
        ) : null}
        {onStop && (
          <div className="ml-auto">
            <StopButton onStop={onStop} state={stopState} />
          </div>
        )}
      </div>
      {open && (
        <div id={contentId} className="pl-3">
          {/* Once the answer is being written the reasoning is over, so no
              row is marked as under way; the pill alone says what is. */}
          {entries.length > 0 && <StepList entries={entries} />}
          {cappedAt ? (
            <LogNote>
              A check stopped at its {cappedAt.toLocaleString('en-US')}-tweet
              limit, so more matching tweets exist.
            </LogNote>
          ) : null}
          <LogNote>{NOT_SEARCHED_LINE}.</LogNote>
        </div>
      )}
    </div>
  )
}
