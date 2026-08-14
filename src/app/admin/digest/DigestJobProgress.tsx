'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DigestRunEvent } from '@/lib/digest/types'

const PHASES = [
  { key: 'queued', label: 'Job queued' },
  { key: 'commentary', label: 'Gathering replies and quotes' },
  { key: 'generation', label: 'Clustering and writing' },
  { key: 'saved', label: 'Validating and saving' },
] as const

const elapsedLabel = (seconds: number) => {
  if (seconds < 60) return `${seconds}s elapsed`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s elapsed`
}

export function DigestJobProgress({
  runId,
  startedAt,
  workflowRunId,
  events,
}: {
  runId: string
  startedAt: string | null
  workflowRunId: string | null
  events: DigestRunEvent[]
}) {
  const router = useRouter()
  const [now, setNow] = useState(() => (startedAt ? Date.parse(startedAt) : 0))
  const eventState = useMemo(() => {
    const commentaryStarted = events.some(
      ({ stage, status }) => stage === 'commentary' && status === 'started',
    )
    const commentaryCompleted = events.some(
      ({ stage, status }) => stage === 'commentary' && status === 'completed',
    )
    const modelStarted = events.some(
      ({ stage, status, message }) =>
        stage === 'generation' &&
        status === 'started' &&
        /model|clustering/i.test(message),
    )
    const generationCompleted = events.some(
      ({ stage, status }) => stage === 'generation' && status === 'completed',
    )
    return {
      commentaryStarted,
      commentaryCompleted,
      modelStarted,
      generationCompleted,
    }
  }, [events])

  useEffect(() => {
    const refresh = () => router.refresh()
    setNow(Date.now())
    const timer = window.setInterval(() => {
      setNow(Date.now())
      refresh()
    }, 3_000)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [router])

  const startMs = startedAt ? Date.parse(startedAt) : now
  const elapsedSeconds = Math.max(0, Math.floor((now - startMs) / 1_000))
  const phaseStates = {
    queued: workflowRunId ? 'complete' : 'active',
    commentary: eventState.commentaryCompleted
      ? 'complete'
      : eventState.commentaryStarted
        ? 'active'
        : 'waiting',
    generation: eventState.generationCompleted
      ? 'complete'
      : eventState.modelStarted
        ? 'active'
        : 'waiting',
    saved: eventState.generationCompleted ? 'active' : 'waiting',
  } as const

  return (
    <section
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-lg border border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/25"
    >
      <div className="h-1 w-full overflow-hidden bg-blue-100 dark:bg-blue-950">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
      </div>
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-semibold text-blue-950 dark:text-blue-100">
              <span
                className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand"
                aria-hidden="true"
              />
              Digest generation is running
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-blue-900/80 dark:text-blue-100/75">
              Safe to refresh, close this tab, or browse elsewhere. The server
              job keeps going and this saved run will update automatically.
            </p>
          </div>
          <span className="rounded-full border border-blue-200 bg-white/70 px-3 py-1 text-xs font-semibold tabular-nums text-blue-900 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-100">
            {elapsedLabel(elapsedSeconds)}
          </span>
        </div>

        <ol className="mt-5 grid gap-2 sm:grid-cols-4">
          {PHASES.map((phase, index) => {
            const state = phaseStates[phase.key]
            return (
              <li
                key={phase.key}
                className={`rounded-md border px-3 py-3 text-xs font-semibold ${
                  state === 'complete'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
                    : state === 'active'
                      ? 'border-blue-300 bg-white text-blue-950 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-100'
                      : 'text-blue-900/45 border-blue-100 bg-blue-50/40 dark:border-blue-950 dark:bg-transparent dark:text-blue-100/40'
                }`}
              >
                <span className="mr-2" aria-hidden="true">
                  {state === 'complete'
                    ? '✓'
                    : state === 'active'
                      ? '●'
                      : index + 1}
                </span>
                {phase.label}
              </li>
            )
          })}
        </ol>
        <p className="dark:text-blue-100/55 mt-3 text-[11px] text-blue-900/60">
          Run {runId.slice(0, 8)} · refreshes every 3 seconds · publication
          remains an explicit editorial step
        </p>
      </div>
    </section>
  )
}
