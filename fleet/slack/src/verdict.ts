// How Claude ends a turn (INSTRUCTIONS.md): a fenced ```json block with
// {status, summary, title}. `done` means the change is ready for the gate,
// `question` means it is waiting for a human, `stop` means nothing to ship.
// Without a readable block the diff decides: changes → done, none → question.
export type TurnStatus = 'done' | 'question' | 'stop'

export interface TurnVerdict {
  status: TurnStatus
  summary: string
  title?: string
  /** True when the block was found and valid (false: heuristic). */
  explicit: boolean
}

const VALID = new Set<TurnStatus>(['done', 'question', 'stop'])

export function parseTurnVerdict(
  text: string,
  hasChanges: boolean,
): TurnVerdict {
  const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)\n\s*```/g)].map(
    (m) => m[1],
  )
  for (const block of blocks.reverse()) {
    try {
      const v = JSON.parse(block) as {
        status?: unknown
        summary?: unknown
        title?: unknown
      }
      if (v && typeof v === 'object' && VALID.has(v.status as TurnStatus)) {
        return {
          status: v.status as TurnStatus,
          summary: String(v.summary || '').trim(),
          title: v.title ? String(v.title).trim().slice(0, 72) : undefined,
          explicit: true,
        }
      }
    } catch {
      // not this block
    }
  }
  const firstLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('```'))
  return {
    status: hasChanges ? 'done' : 'question',
    summary: (firstLine || '').slice(0, 300),
    explicit: false,
  }
}

/** Intake classification (one turn, no edits): {verdict, reason}. */
export type Classification = 'obvious' | 'needs-decision' | 'wontfix'

export interface ClassificationVerdict {
  verdict: Classification
  reason: string
  explicit: boolean
}

const VALID_CLASS = new Set<Classification>([
  'obvious',
  'needs-decision',
  'wontfix',
])

export function parseClassification(text: string): ClassificationVerdict {
  const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)\n\s*```/g)].map(
    (m) => m[1],
  )
  for (const block of blocks.reverse()) {
    try {
      const v = JSON.parse(block) as { verdict?: unknown; reason?: unknown }
      if (
        v &&
        typeof v === 'object' &&
        VALID_CLASS.has(v.verdict as Classification)
      ) {
        return {
          verdict: v.verdict as Classification,
          reason: String(v.reason || '').trim(),
          explicit: true,
        }
      }
    } catch {
      // not this block
    }
  }
  return {
    verdict: 'needs-decision',
    reason: text.trim().slice(0, 400) || 'no readable classification',
    explicit: false,
  }
}
