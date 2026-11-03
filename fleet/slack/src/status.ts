// The one status message per task thread, edited as the task moves:
// a checklist of understanding → working → gate → PR → waiting on you.
export type Step = 'understanding' | 'working' | 'gate' | 'pr' | 'waiting'

export const STEPS: { id: Step; label: string }[] = [
  { id: 'understanding', label: 'understanding' },
  { id: 'working', label: 'working' },
  { id: 'gate', label: 'gate' },
  { id: 'pr', label: 'PR' },
  { id: 'waiting', label: 'waiting on you' },
]

export interface StatusView {
  title: string
  /** The step in progress (▶); undefined when nothing is running. */
  current?: Step
  /** Steps finished (☑). */
  done?: Step[]
  /** Steps that failed (✖). */
  failed?: Step[]
  /** One line under the checklist. */
  note?: string
  runId?: string
  prUrl?: string
  transcriptUrl?: string
  finished?: 'merged' | 'closed' | 'error' | 'stopped'
}

export function renderStatus(v: StatusView): string {
  const done = new Set(v.done || [])
  const failed = new Set(v.failed || [])
  const marks = STEPS.map((s) => {
    const mark = failed.has(s.id)
      ? '✖'
      : done.has(s.id)
        ? '☑'
        : v.current === s.id
          ? '▶'
          : '☐'
    return `${mark} ${s.label}`
  })
  const lines = [`*${v.title}*`, marks.join('   ')]
  if (v.finished === 'merged') lines.push('🎉 merged')
  else if (v.finished === 'closed') lines.push('closed')
  else if (v.finished === 'stopped') lines.push('stopped')
  else if (v.finished === 'error') lines.push('❌ errored, see the thread')
  if (v.note) lines.push(v.note)
  const tail: string[] = []
  if (v.prUrl) tail.push(`<${v.prUrl}|PR>`)
  if (v.transcriptUrl) tail.push(`<${v.transcriptUrl}|transcript>`)
  if (v.runId) tail.push(`run \`${v.runId}\``)
  if (tail.length) lines.push(tail.join(' · '))
  return lines.join('\n')
}
