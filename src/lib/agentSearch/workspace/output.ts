import type { AgentTweet } from '../types'
import type { ManifestChanges } from './manifest'

// The bash tool's output and what the model sees of it. Plain code with no
// Node imports: the agent definition (part of the workflow body) uses it.

/** What the page receives for one `bash` call. */
export interface BashToolOutput {
  stdout: string
  stderr: string
  exitCode: number
  /** One line for people: what the command did. */
  summary: string
  /** Tweet files the command created or changed: path to ids, in order. */
  files: Record<string, string[]>
  /** The tweets in those files, for the page to show lists. */
  tweets: AgentTweet[]
  /** The command's changes to the workspace, carried to later commands. */
  workspace: ManifestChanges
  /** Scorer spend (recorded on the run by the caller). */
  costUsd: number
  /** Semantic searches this command ran (a question may run only a few). */
  semanticCalls: number
}

const MODEL_OUTPUT_CHARS = 4000

/**
 * What the model sees of a command: stdout then stderr, capped, with a note
 * of how much was left out. A stored earlier-turn output has no stdout; it
 * shows the summary and the files instead.
 */
export function bashModelOutput(output: Partial<BashToolOutput>): {
  output: string
  exitCode: number
} {
  const exitCode = typeof output.exitCode === 'number' ? output.exitCode : 0
  if (typeof output.stdout !== 'string') {
    const files = Object.entries(output.files ?? {}).map(
      ([path, ids]) => `${path} · ${ids.length} tweets`,
    )
    return {
      output: [output.summary ?? '', ...files].filter(Boolean).join('\n'),
      exitCode,
    }
  }
  // The commands' summaries are on stderr: always show them.
  const stderr = output.stderr?.trim()
    ? `[stderr]\n${output.stderr.slice(0, STDERR_CHARS)}`
    : ''
  const room = MODEL_OUTPUT_CHARS - stderr.length
  const stdout = output.stdout
  if (stdout.length <= room) {
    return { output: [stdout, stderr].filter(Boolean).join('\n'), exitCode }
  }
  const kept = stdout.slice(0, room)
  const cut = kept.lastIndexOf('\n')
  const shown = cut > room / 2 ? kept.slice(0, cut + 1) : `${kept}\n`
  const hidden = stdout.slice(shown.length).split('\n').filter(Boolean).length
  const note = `… ${hidden} more ${hidden === 1 ? 'line' : 'lines'} not shown; write to a file and use head, jq or wc`
  return { output: [shown + note, stderr].filter(Boolean).join('\n'), exitCode }
}

const STDERR_CHARS = 1000
