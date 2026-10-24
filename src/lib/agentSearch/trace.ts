// Timing for one shell command: every gateway, semantic and scorer call it
// makes, and the archive commands and file rebuilds they ran inside. It
// rides on the run's limits (deadline.ts), which every such call already
// takes, and stays inside the step that created it. Plain code only: the
// workflow body loads deadline.ts.

/** Calls that leave the process, and the stretches of work around them. */
export type SpanKind = 'gateway' | 'semantic' | 'scorer' | 'phase'

export interface CallSpan {
  kind: SpanKind
  /** The archive command, `rebuild` or `page` the call ran under. */
  phase: string
  /** The gateway route, the scorer, or the phase itself. */
  label: string
  /** Ms after the trace started. */
  start: number
  ms: number
  ok: boolean
}

export interface CallTrace {
  t0: number
  spans: CallSpan[]
  /** Open phases, innermost last. Commands in one line run in turn. */
  phases: string[]
}

export function startTrace(now = Date.now()): CallTrace {
  return { t0: now, spans: [], phases: [] }
}

/** Runs `task`, recording it as a span when `limits` carries a trace. */
export async function traced<T>(
  limits: { trace?: CallTrace } | undefined,
  kind: SpanKind,
  label: string,
  task: () => Promise<T>,
): Promise<T> {
  const trace = limits?.trace
  if (!trace) return task()
  const phase = trace.phases[trace.phases.length - 1] ?? 'shell'
  const start = Date.now()
  let ok = false
  try {
    const value = await task()
    ok = true
    return value
  } finally {
    trace.spans.push({
      kind,
      phase,
      label,
      start: start - trace.t0,
      ms: Date.now() - start,
      ok,
    })
  }
}

/** Runs `task` as a named phase (an archive command, a file rebuild). */
export async function inPhase<T>(
  limits: { trace?: CallTrace } | undefined,
  phase: string,
  task: () => Promise<T>,
): Promise<T> {
  const trace = limits?.trace
  if (!trace) return task()
  // The phase's own span belongs to the phase around it.
  return traced(limits, 'phase', phase, async () => {
    trace.phases.push(phase)
    try {
      return await task()
    } finally {
      trace.phases.pop()
    }
  })
}

export interface KindTiming {
  calls: number
  /** Summed call time; more than wallMs when calls overlap. */
  sumMs: number
  /** Time at least one such call was in flight. */
  wallMs: number
  failed: number
}

export interface CommandTiming {
  startedAt: string
  ms: number
  /** The shell's own run of the line, archive calls included. */
  execMs: number
  /** Fetching tweets for the page after the line finished. */
  pageMs: number
  gateway: KindTiming
  semantic: KindTiming
  scorer: KindTiming
  /** Time with no gateway, semantic or scorer call in flight. */
  localMs: number
  /** Summed duration of each phase; nested phases count in both. */
  phases: Record<string, number>
  /** [kind, phase, label, start, ms, ok] for each span, in order. */
  spans: Array<[SpanKind, string, string, number, number, boolean]>
}

type Interval = [number, number]

/** Total length of the union of the intervals. */
export function unionMs(intervals: Interval[]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  let total = 0
  let end = -Infinity
  for (const [from, to] of sorted) {
    if (to <= end) continue
    total += to - Math.max(from, end)
    end = to
  }
  return total
}

function kindTiming(spans: CallSpan[]): KindTiming {
  return {
    calls: spans.length,
    sumMs: spans.reduce((sum, span) => sum + span.ms, 0),
    wallMs: unionMs(spans.map((span) => [span.start, span.start + span.ms])),
    failed: spans.filter((span) => !span.ok).length,
  }
}

export function summarizeTrace(
  trace: CallTrace,
  parts: { ms: number; execMs: number; pageMs: number },
): CommandTiming {
  const of = (kind: SpanKind) => trace.spans.filter((s) => s.kind === kind)
  const network = trace.spans.filter((span) => span.kind !== 'phase')
  const phases: Record<string, number> = {}
  for (const span of of('phase')) {
    phases[span.label] = (phases[span.label] ?? 0) + span.ms
  }
  return {
    startedAt: new Date(trace.t0).toISOString(),
    ...parts,
    gateway: kindTiming(of('gateway')),
    semantic: kindTiming(of('semantic')),
    scorer: kindTiming(of('scorer')),
    localMs: Math.max(
      0,
      parts.ms -
        unionMs(network.map((span) => [span.start, span.start + span.ms])),
    ),
    phases,
    // By start, an enclosing span before the calls inside it.
    spans: trace.spans
      .slice()
      .sort(
        (a, b) =>
          a.start - b.start ||
          b.ms - a.ms ||
          Number(b.kind === 'phase') - Number(a.kind === 'phase'),
      )
      .map((s) => [s.kind, s.phase, s.label, s.start, s.ms, s.ok]),
  }
}
