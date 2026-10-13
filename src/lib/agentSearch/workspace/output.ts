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
  /**
   * Relevance scores (the scorer's p, two decimals) for tweets in the files
   * written and rows printed with a p, so the page can sort by relevance.
   */
  scores?: Record<string, number>
  /**
   * What the model sees of this command, worked out before the stream
   * output is slimmed (streamedBashOutput), so trimming stdout for the page
   * cannot change it.
   */
  model?: { output: string; exitCode: number }
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
  if (
    output.model &&
    typeof output.model.output === 'string' &&
    typeof output.model.exitCode === 'number'
  ) {
    return output.model
  }
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

/** The page shows only a command's first printed line. */
const PAGE_STDOUT_CHARS = 2000

/**
 * The output as it goes to the page and the run record. A run's stream is
 * replayed from the start on every reconnect, and commands re-print the same
 * tweets (a 27-command run sent 8,255 tweets, 2,591 of them distinct), so a
 * tweet already sent earlier in the run goes as its id only: the page keeps
 * every tweet it has seen in the run. Stdout is cut to what the page shows,
 * after the model's view of it is fixed in `model`. `sent` collects the ids
 * sent so far; the caller keeps it for the run.
 */
export function streamedBashOutput(
  output: BashToolOutput,
  sent: Set<string>,
): BashToolOutput {
  const tweets = output.tweets.filter((tweet) => !sent.has(tweet.id))
  for (const tweet of tweets) sent.add(tweet.id)
  return {
    ...output,
    model: output.model ?? bashModelOutput(output),
    stdout: output.stdout.slice(0, PAGE_STDOUT_CHARS),
    tweets,
  }
}
