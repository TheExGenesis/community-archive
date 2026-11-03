// One headless Claude Code call: `claude -p --output-format stream-json
// --verbose`, prompt on stdin, the event stream scrubbed and appended to the
// run's transcript.jsonl (the fixer's convention), every event handed to the
// caller as it arrives, the final `result` event kept.
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import readline from 'node:readline'

export type StreamEvent = Record<string, unknown> & { type?: string }

export interface ResultEvent extends StreamEvent {
  type: 'result'
  subtype?: string
  is_error?: boolean
  result?: string
  session_id?: string
  num_turns?: number
  duration_ms?: number
  total_cost_usd?: number
  usage?: Record<string, number>
}

export interface ClaudeRunOptions {
  bin: string
  cwd: string
  prompt: string
  systemPrompt?: string
  resume?: string
  maxTurns: number
  model?: string
  allowedTools: string[]
  disallowedTools: string[]
  permissionMode?: string
  env: NodeJS.ProcessEnv
  /** transcript.jsonl of the run; scrubbed events are appended. */
  transcriptPath: string
  /** This call's result event is written here (the fixer's claude-output.json). */
  outputPath: string
  stderrPath: string
  invocationsPath: string
  scrub: (line: string) => string
  onEvent?: (ev: StreamEvent) => void
  timeoutMs?: number
}

export interface ClaudeRunResult {
  exitCode: number
  result?: ResultEvent
  sessionId?: string
  /** Final assistant text (the result event's `result`, else the last assistant text). */
  text: string
  isError: boolean
  errorMessage?: string
}

/** The fixer's tool policy: edit and test, never push, commit, call GitHub or the web. */
export const TASK_ALLOWED_TOOLS = [
  'Read',
  'Edit',
  'Write',
  'Grep',
  'Glob',
  'Bash(pnpm lint*)',
  'Bash(pnpm type-check*)',
  'Bash(pnpm test*)',
  'Bash(npx jest*)',
  'Bash(npx eslint*)',
  'Bash(npx tsc*)',
  'Bash(node --test*)',
  'Bash(git status*)',
  'Bash(git diff*)',
  'Bash(git log*)',
]
export const TASK_DISALLOWED_TOOLS = [
  'Bash(git push*)',
  'Bash(git commit*)',
  'Bash(gh *)',
  'Bash(curl*)',
  'Bash(wget*)',
  'WebFetch',
  'WebSearch',
  'Agent',
  'NotebookEdit',
]

export function buildClaudeArgs(o: ClaudeRunOptions): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-turns',
    String(o.maxTurns),
    '--permission-mode',
    o.permissionMode || 'dontAsk',
  ]
  if (o.allowedTools.length) args.push('--allowedTools', ...o.allowedTools)
  if (o.disallowedTools.length)
    args.push('--disallowedTools', ...o.disallowedTools)
  if (o.model) args.push('--model', o.model)
  if (o.systemPrompt) args.push('--append-system-prompt', o.systemPrompt)
  if (o.resume) args.push('--resume', o.resume)
  return args
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./:=,@+-]+$/.test(s)) return s
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export async function runClaude(o: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const args = buildClaudeArgs(o)
  // The invocation log mirrors the fixer's claude-invocations.txt; the system
  // prompt is long and the same every run, so it is abbreviated there.
  const logged = args.map((a, i) =>
    args[i - 1] === '--append-system-prompt'
      ? `<INSTRUCTIONS.md ${a.length} chars>`
      : shellQuote(a),
  )
  fs.appendFileSync(
    o.invocationsPath,
    `cd ${shellQuote(o.cwd)} && ${shellQuote(o.bin)} ${logged.join(' ')} < prompt | transcript.mjs scrub >> ${shellQuote(o.transcriptPath)}\n`,
  )

  const transcript = fs.createWriteStream(o.transcriptPath, { flags: 'a' })
  const stderr = fs.createWriteStream(o.stderrPath, { flags: 'a' })
  let result: ResultEvent | undefined
  let lastAssistantText = ''

  const child = spawn(o.bin, args, {
    cwd: o.cwd,
    env: o.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stderr.pipe(stderr)
  child.stdin.on('error', () => undefined)
  child.stdin.end(o.prompt)

  let timer: NodeJS.Timeout | undefined
  if (o.timeoutMs) {
    timer = setTimeout(() => {
      stderr.write(
        `\n[fleet-slack] claude timed out after ${o.timeoutMs} ms; killing\n`,
      )
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 10000).unref()
    }, o.timeoutMs)
  }

  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  })
  for await (const rawLine of rl) {
    if (!rawLine.trim()) continue
    const line = o.scrub(rawLine)
    transcript.write(line + '\n')
    let ev: StreamEvent | undefined
    try {
      ev = JSON.parse(line) as StreamEvent
    } catch {
      ev = undefined
    }
    if (!ev || typeof ev !== 'object') continue
    if (ev.type === 'result') result = ev as ResultEvent
    if (ev.type === 'assistant') {
      const text = assistantText(ev)
      if (text) lastAssistantText = text
    }
    try {
      o.onEvent?.(ev)
    } catch {
      // a progress consumer must never break the run
    }
  }

  const exitCode: number = await new Promise((resolve) => {
    child.on('close', (code, signal) => resolve(code ?? (signal ? 128 : 1)))
  })
  if (timer) clearTimeout(timer)
  await new Promise<void>((resolve) => transcript.end(resolve))
  await new Promise<void>((resolve) => stderr.end(resolve))

  if (result) fs.writeFileSync(o.outputPath, JSON.stringify(result) + '\n')
  const isError = !result || Boolean(result.is_error)
  const text =
    (typeof result?.result === 'string' && result.result) ||
    lastAssistantText ||
    ''
  return {
    exitCode,
    result,
    sessionId:
      typeof result?.session_id === 'string' ? result.session_id : undefined,
    text,
    isError,
    errorMessage: !result
      ? `claude exited ${exitCode} without a result event`
      : result.is_error
        ? String(result.result || result.subtype || 'unknown error').slice(
            0,
            400,
          )
        : undefined,
  }
}

/** The text blocks of one assistant event, joined. */
export function assistantText(ev: StreamEvent): string {
  const message = ev.message as { content?: unknown } | undefined
  const content = Array.isArray(message?.content)
    ? (message?.content as unknown[])
    : []
  return content
    .map((b) => {
      const block = b as { type?: string; text?: string }
      return block.type === 'text' && typeof block.text === 'string'
        ? block.text
        : ''
    })
    .filter(Boolean)
    .join('\n')
}
