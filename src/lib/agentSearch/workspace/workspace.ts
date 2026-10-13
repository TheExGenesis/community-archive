import { Bash, type CommandName } from 'just-bash'
import { WORKSPACE_PATH } from '../citations'
import { boundedTimeoutMs, type RunLimits } from '../deadline'
import type { AgentTweet } from '../types'
import {
  archiveCommands,
  createCommandState,
  fetchTweets,
  type CommandState,
} from './commands'
import {
  manifestFileFor,
  type ManifestChanges,
  type ManifestFile,
  type WorkspaceManifest,
} from './manifest'
import type { BashToolOutput } from './output'
import { formatRows, toRow, uniqueIds } from './rows'

/** The built-in tools the agent may use alongside the archive commands. */
const SHELL_COMMANDS: CommandName[] = [
  'cat',
  'head',
  'tail',
  'jq',
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'sort',
  'uniq',
  'wc',
  'cut',
  'awk',
  'sed',
  'tr',
  'ls',
  'find',
  'echo',
  'printf',
  'mkdir',
  'cp',
  'mv',
  'rm',
  'tee',
  'xargs',
  'comm',
  'join',
  'paste',
  'nl',
  'seq',
  'true',
  'false',
  'tac',
  'pwd',
  'basename',
  'dirname',
]

// One shell command in the agent's workspace (the `bash` tool). The shell is
// just-bash: bash interpreted in TypeScript over an in-memory filesystem, with
// no network, no python or js, and execution limits. The workspace is rebuilt
// from the manifest for every command, tweet files lazily from the gateway
// (only the files the command reads are fetched), and the command's writes
// come back as manifest changes.

export const WORKSPACE_ROOT = '/work'
const MAX_COMMAND_MS = 90_000
/** Most tweets one command's output sends to the page. */
const MAX_PAGE_TWEETS = 1000

/** Every archive call in a command failed: the archive is not answering. */
export class WorkspaceUnavailableError extends Error {
  constructor(
    message: string,
    readonly costUsd: number,
  ) {
    super(message)
    this.name = 'WorkspaceUnavailableError'
  }
}

function lazyTweetFile(
  state: CommandState,
  file: ManifestFile & { kind: 'tweets' },
) {
  return async () => {
    state.calls += 1
    let tweets: AgentTweet[]
    try {
      tweets = await fetchTweets(state, uniqueIds(file.rows))
    } catch (error) {
      state.failures += 1
      throw error
    }
    const byId = new Map(tweets.map((tweet) => [tweet.id, tweet]))
    // A tweet the gateway no longer returns (deleted, opted out) drops out.
    const rows = file.rows.flatMap((ref) => {
      const tweet = byId.get(ref.id)
      return tweet ? [{ ...toRow(tweet, ref.p), ...(ref.x ?? {}) }] : []
    })
    return formatRows(rows)
  }
}

/** Records the paths a command writes, moves or removes. */
function trackWrites(fs: Bash['fs']) {
  const touched = new Set<string>()
  const target = fs as unknown as Record<string, unknown>
  const wrap = (name: string, paths: (args: unknown[]) => unknown[]) => {
    const original = target[name]
    if (typeof original !== 'function') return
    target[name] = function (this: unknown, ...args: unknown[]) {
      for (const path of paths(args)) {
        if (typeof path === 'string') touched.add(path)
      }
      return (original as (...a: unknown[]) => unknown).apply(this, args)
    }
  }
  wrap('writeFile', (args) => [args[0]])
  wrap('writeFileSync', (args) => [args[0]])
  wrap('appendFile', (args) => [args[0]])
  wrap('cp', (args) => [args[1]])
  wrap('mv', (args) => [args[0], args[1]])
  wrap('rm', (args) => [args[0]])
  return touched
}

/** Tweet ids in command output: `"id":"…"` in rows, or bare ids on a line. */
export function idsInOutput(stdout: string): string[] {
  const ids = new Set<string>()
  for (const match of Array.from(stdout.matchAll(/"id"\s*:\s*"(\d{1,20})"/g))) {
    ids.add(match[1])
  }
  for (const match of Array.from(stdout.matchAll(/^\s*(\d{15,20})\s*$/gm))) {
    ids.add(match[1])
  }
  return Array.from(ids)
}

const relative = (path: string) =>
  path.startsWith(`${WORKSPACE_ROOT}/`)
    ? path.slice(WORKSPACE_ROOT.length + 1)
    : null

export async function runBashCommand({
  command,
  manifest,
  limits = {},
  semanticUsed = 0,
}: {
  command: string
  manifest: WorkspaceManifest
  limits?: RunLimits
  /** Semantic searches the question has already run. */
  semanticUsed?: number
}): Promise<BashToolOutput> {
  const state = createCommandState(limits, semanticUsed)
  const files: Record<string, string | (() => Promise<string>)> = {}
  for (const [path, file] of Object.entries(manifest)) {
    if (!WORKSPACE_PATH.test(path)) continue
    files[`${WORKSPACE_ROOT}/${path}`] =
      file.kind === 'tweets' ? lazyTweetFile(state, file) : file.text
  }
  const bash = new Bash({
    cwd: WORKSPACE_ROOT,
    files,
    customCommands: archiveCommands(state),
    // Off: while a script runs, this layer patches process-wide globals
    // (process, Function, timers), and our commands await network calls, so
    // other requests in the same server ran against the patches and failed
    // (Next could no longer set process.env). It is documented as secondary;
    // the boundary here is the bash-only interpreter, an in-memory filesystem,
    // no network, no JS or Python runtimes, and our own commands.
    defenseInDepth: false,
    // Text tools only: sqlite3 breaks when Next loads just-bash with require
    // (just-bash#385), and curl and html-to-markdown need the network.
    commands: SHELL_COMMANDS,
    executionLimitProfile: 'hardened',
    // The hardened profile's iteration caps (10,000) stop a jq projection
    // over a 1,000-tweet file, and a failure inside a pipe still exits 0;
    // in the eval, the agent spent its steps retrying. Time, output and
    // memory stay bounded.
    executionLimits: {
      maxJqIterations: 10_000_000,
      maxAwkIterations: 10_000_000,
      maxSedIterations: 10_000_000,
      maxLoopIterations: 1_000_000,
      maxCommandCount: 1_000_000,
      maxWorkUnits: 100_000_000,
      maxExecutionTimeMs: boundedTimeoutMs(limits, MAX_COMMAND_MS),
      maxOutputSize: 8 * 1024 * 1024,
      maxFileSystemBytes: 64 * 1024 * 1024,
    },
  })
  const touched = trackWrites(bash.fs)
  // pipefail: a limit or error inside a pipe exits non-zero, so the model
  // sees the failure instead of an empty result.
  const result = await bash.exec(`set -o pipefail; ${command}`, {
    signal: limits.abortSignal,
  })

  // Whatever the command wrote under the workspace, as manifest changes.
  const workspace: ManifestChanges = {}
  const changedFiles: Record<string, string[]> = {}
  for (const absolute of Array.from(touched)) {
    const path = relative(absolute)
    if (!path || !WORKSPACE_PATH.test(path)) continue
    if (!(await bash.fs.exists(absolute))) {
      workspace[path] = null
      continue
    }
    const stat = await bash.fs.stat(absolute)
    if (!stat.isFile) continue
    const file = manifestFileFor(await bash.fs.readFile(absolute))
    workspace[path] = file
    if (file?.kind === 'tweets') changedFiles[path] = uniqueIds(file.rows)
  }

  if (state.calls > 0 && state.failures === state.calls) {
    throw new WorkspaceUnavailableError(
      `The archive search is not responding: ${result.stderr.trim().split('\n')[0] ?? ''}`.trim(),
      state.costUsd,
    )
  }

  // The page gets the tweets of the files written and of the rows the model
  // saw on stdout, so a tweet it cites from either can be shown and checked.
  const ids = Array.from(
    new Set([
      ...Object.values(changedFiles).flat(),
      ...idsInOutput(result.stdout),
    ]),
  ).slice(0, MAX_PAGE_TWEETS)
  const tweets = ids.length ? await fetchTweets(state, ids).catch(() => []) : []
  const wrote = Object.entries(changedFiles).map(
    ([path, list]) =>
      `Wrote ${path} · ${list.length} ${list.length === 1 ? 'tweet' : 'tweets'}`,
  )
  const summary =
    state.summaries.join(' · ') ||
    wrote.slice(0, 2).join(' · ') ||
    (result.exitCode === 0 ? 'Looked through the results' : 'A command failed')

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    summary,
    files: changedFiles,
    tweets,
    workspace,
    costUsd: state.costUsd,
    semanticCalls: state.semanticCalls,
  }
}
