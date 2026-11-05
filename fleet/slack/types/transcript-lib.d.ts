// Shape of fleet/lib/transcript.mjs as the service loads it (fleetLib.ts).
export interface TranscriptLib {
  scrubLine(line: string, literals?: string[]): string
  secretLiterals(env?: NodeJS.ProcessEnv): string[]
  describeToolUse(name: string, input?: unknown): string
  readEvents(file: string): Record<string, unknown>[]
  summarize(events: Record<string, unknown>[]): {
    session_id: string | null
    model: string | null
    calls: number
    num_turns: number
    duration_ms: number
    cost_usd: number
    tokens: {
      input: number
      output: number
      cache_read: number
      cache_creation: number
    }
    is_error: boolean
    result: string
  }
}
