#!/usr/bin/env node
// Fleet transcript tools around `claude -p --output-format stream-json --verbose`.
// No dependencies; node only. Used by fleet/lib/common.sh and fleet/bin/runs.sh.
//
//   node transcript.mjs scrub                       stdin → stdout, one JSON event per line, secrets redacted
//   node transcript.mjs render <transcript.jsonl> [out.md]
//                                                   readable markdown (stdout when out.md is omitted)
//   node transcript.mjs summary <transcript.jsonl>  JSON: session_id, model, calls, num_turns, duration_ms,
//                                                   cost_usd, tokens{input,output,cache_read,cache_creation},
//                                                   is_error, result (final text)
//   node transcript.mjs result <transcript.jsonl> [n]
//                                                   the n-th `result` event (default: the last) as one JSON
//                                                   object, which is what --output-format json would have printed
//
// A transcript file holds every call of a run: the first `claude -p` and any
// `--resume` that followed, appended in order. Each call starts with a
// system/init event and ends with a result event.

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

// ─── Scrubbing ──────────────────────────────────────────────────────────────
// Two layers. Literal values of the secrets the harness itself holds (read
// from the environment at scrub time) are replaced wherever they appear. Then
// shapes: Authorization headers, NAME=value assignments of secret-looking
// names, and well-known token formats. Scrubbing runs on every string of the
// parsed event, so the JSON stays valid; a line that is not JSON is scrubbed
// as text.

export const SECRET_ENV_NAMES = [
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'FLEET_GITHUB_TOKEN',
  'SIGNALS_WEBHOOK_SECRET',
  'VERCEL_TOKEN',
  'VERCEL_PROTECTION_BYPASS',
  'ANTHROPIC_API_KEY',
  'GRAFANA_CLOUD_API_KEY',
  'GRAFANA_CLOUD_LOKI_API_KEY',
  'GRAFANA_ACCESS_TOKEN',
]

const REDACTED = '[REDACTED]'
const SECRET_KEY_RE =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-vercel-protection-bypass|.*(token|secret|password|passwd|api[_-]?key|private[_-]?key).*)$/i
const SECRET_NAME_SHAPE =
  '(?:GH_TOKEN|GITHUB_TOKEN|FLEET_GITHUB_TOKEN|SIGNALS_WEBHOOK_SECRET|VERCEL_TOKEN|VERCEL_PROTECTION_BYPASS|ANTHROPIC_API_KEY|[A-Z0-9_]*(?:_SECRET|_TOKEN|_PASSWORD|_API_KEY|_PRIVATE_KEY|_KEY))'
const PATTERNS = [
  // Authorization: Bearer xyz / authorization=xyz
  [
    /(authorization\s*[:=]\s*["']?)(?:(?:bearer|basic|token)\s+)?[^\s"',;]+/gi,
    `$1${REDACTED}`,
  ],
  [/\b(bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, `$1${REDACTED}`],
  // NAME=value, NAME: value (values of 8+ non-space characters only, so a type
  // annotation like `API_KEY: string` in code is left alone)
  [
    new RegExp(`\\b(${SECRET_NAME_SHAPE}\\s*[=:]\\s*["']?)[^\\s"',;]{8,}`, 'g'),
    `$1${REDACTED}`,
  ],
  // Token shapes
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, REDACTED],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, REDACTED],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, REDACTED],
  [/\bsk-[A-Za-z0-9]{32,}\b/g, REDACTED],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, REDACTED],
  [/\bglc_[A-Za-z0-9+/=]{20,}/g, REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTED],
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED PRIVATE KEY]',
  ],
]

export function secretLiterals(env = process.env) {
  return SECRET_ENV_NAMES.map((name) => env[name]).filter(
    (v) => typeof v === 'string' && v.length >= 8,
  )
}

export function scrubText(text, literals = secretLiterals()) {
  if (typeof text !== 'string' || text.length === 0) return text
  let out = text
  for (const literal of literals) out = out.split(literal).join(REDACTED)
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement)
  return out
}

export function scrubValue(value, literals, key = '') {
  if (typeof value === 'string') {
    if (SECRET_KEY_RE.test(key) && value.length > 0) return REDACTED
    return scrubText(value, literals)
  }
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, literals))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value))
      out[k] = scrubValue(v, literals, k)
    return out
  }
  return value
}

export function scrubLine(line, literals = secretLiterals()) {
  if (!line.trim()) return line
  try {
    return JSON.stringify(scrubValue(JSON.parse(line), literals))
  } catch {
    return scrubText(line, literals)
  }
}

async function scrubStream(input, output) {
  const literals = secretLiterals()
  const rl = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of rl) {
    output.write(scrubLine(line, literals) + '\n')
  }
}

// ─── Reading ────────────────────────────────────────────────────────────────

export function readEvents(file) {
  const events = []
  const text = fs.readFileSync(file, 'utf8')
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const ev = JSON.parse(line)
      if (ev && typeof ev === 'object') events.push(ev)
    } catch {
      events.push({ type: 'unparsed', line })
    }
  }
  return events
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export function summarize(events) {
  const s = {
    session_id: null,
    model: null,
    calls: 0,
    num_turns: 0,
    duration_ms: 0,
    cost_usd: 0,
    tokens: { input: 0, output: 0, cache_read: 0, cache_creation: 0 },
    is_error: false,
    result: null,
    subtype: null,
  }
  for (const ev of events) {
    if (ev.session_id && typeof ev.session_id === 'string')
      s.session_id = ev.session_id
    if (ev.type === 'system' && ev.subtype === 'init' && ev.model)
      s.model = ev.model
    if (ev.type !== 'result') continue
    s.calls += 1
    s.num_turns += num(ev.num_turns)
    s.duration_ms += num(ev.duration_ms)
    s.cost_usd += num(ev.total_cost_usd)
    const u = ev.usage || {}
    s.tokens.input += num(u.input_tokens)
    s.tokens.output += num(u.output_tokens)
    s.tokens.cache_read += num(u.cache_read_input_tokens)
    s.tokens.cache_creation += num(u.cache_creation_input_tokens)
    s.is_error = Boolean(ev.is_error)
    s.result = typeof ev.result === 'string' ? ev.result : null
    s.subtype = ev.subtype || null
  }
  s.cost_usd = Math.round(s.cost_usd * 1e6) / 1e6
  return s
}

// ─── Rendering ──────────────────────────────────────────────────────────────

const clip = (text, max) => {
  const s = String(text ?? '')
  if (s.length <= max) return s
  return `${s.slice(0, max)}\n… (+${s.length - max} chars)`
}
const oneLine = (text, max = 160) => {
  const s = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length <= max ? s : `${s.slice(0, max)}…`
}
const fence = (text, lang = '') => {
  const body = String(text ?? '')
  // A fence longer than any run of backticks inside keeps the block closed.
  const longest = Math.max(
    2,
    ...[...body.matchAll(/`+/g)].map((m) => m[0].length),
  )
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}${lang}\n${body}\n${ticks}`
}
const hhmmss = (iso) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Date(t).toISOString().slice(11, 19) + 'Z' : ''
}
const duration = (ms) => {
  const s = Math.round(num(ms) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}
const usd = (v) => `$${num(v).toFixed(2)}`
const fmtTokens = (t) =>
  `${t.input} in · ${t.output} out · ${t.cache_read} cache read · ${t.cache_creation} cache write`

// One line that says what a tool call did, from its input.
export function describeToolUse(name, input = {}) {
  const i = input && typeof input === 'object' ? input : {}
  switch (name) {
    case 'Read':
      return `${name} \`${i.file_path || '?'}\`${i.offset ? ` from line ${i.offset}` : ''}${i.limit ? ` (${i.limit} lines)` : ''}`
    case 'Write':
      return `${name} \`${i.file_path || '?'}\` (${String(i.content || '').length} chars)`
    case 'Edit':
      return `${name} \`${i.file_path || '?'}\`${i.replace_all ? ' (all occurrences)' : ''}`
    case 'Bash':
      return `${name} \`${oneLine(i.command, 200)}\``
    case 'Grep':
      return `${name} /${oneLine(i.pattern, 80)}/${i.path ? ` in \`${i.path}\`` : ''}${i.glob ? ` glob \`${i.glob}\`` : ''}`
    case 'Glob':
      return `${name} \`${oneLine(i.pattern, 80)}\`${i.path ? ` in \`${i.path}\`` : ''}`
    default:
      return `${name} ${oneLine(JSON.stringify(i), 200)}`
  }
}

// What of the input is worth showing under the one-liner.
function toolUseDetail(name, input = {}) {
  const i = input && typeof input === 'object' ? input : {}
  if (name === 'Edit') {
    return fence(
      `--- old\n${clip(i.old_string, 600)}\n+++ new\n${clip(i.new_string, 600)}`,
      'diff',
    )
  }
  if (name === 'Write') return fence(clip(i.content, 800))
  if (name === 'Bash' && String(i.command || '').length > 200)
    return fence(clip(i.command, 800), 'bash')
  return ''
}

function toolResultText(block) {
  const c = block.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c
      .map((part) =>
        typeof part === 'string'
          ? part
          : part && part.type === 'text'
            ? part.text
            : `[${part && part.type ? part.type : 'block'}]`,
      )
      .join('\n')
  }
  if (c === undefined || c === null) return ''
  return JSON.stringify(c)
}

export function render(
  events,
  { title = 'Fleet transcript', resultLimit = 600 } = {},
) {
  const out = []
  const s = summarize(events)
  out.push(`# ${title}`, '')
  out.push(`- Session: \`${s.session_id || 'unknown'}\``)
  if (s.model) out.push(`- Model: ${s.model}`)
  out.push(
    `- Calls: ${s.calls} · turns: ${s.num_turns} · API time: ${duration(s.duration_ms)} · cost: ${usd(s.cost_usd)}`,
  )
  out.push(`- Tokens: ${fmtTokens(s.tokens)}`)
  out.push('')

  const toolNames = new Map() // tool_use_id → name
  let call = 0
  let turn = 0
  for (const ev of events) {
    if (ev.type === 'system') {
      if (ev.subtype === 'init') {
        call += 1
        turn = 0
        out.push(`## Call ${call}${call > 1 ? ' (resumed)' : ''}`, '')
        const bits = []
        if (ev.model) bits.push(`model ${ev.model}`)
        if (ev.permissionMode) bits.push(`permission mode ${ev.permissionMode}`)
        if (Array.isArray(ev.tools)) bits.push(`${ev.tools.length} tools`)
        if (ev.cwd) bits.push(`cwd \`${ev.cwd}\``)
        out.push(
          `_session ${ev.session_id || '?'}${bits.length ? ': ' + bits.join(', ') : ''}_`,
          '',
        )
      }
      continue
    }
    if (ev.type === 'assistant' && ev.message) {
      turn += 1
      const when = ev.timestamp ? ` · ${hhmmss(ev.timestamp)}` : ''
      const where = ev.parent_tool_use_id ? ' · subagent' : ''
      out.push(`### Turn ${turn} · assistant${when}${where}`, '')
      if (ev.error) out.push(`**API error:** ${ev.error}`, '')
      const content = Array.isArray(ev.message.content)
        ? ev.message.content
        : [{ type: 'text', text: String(ev.message.content ?? '') }]
      for (const block of content) {
        if (!block || typeof block !== 'object') continue
        if (block.type === 'text' && block.text) {
          out.push(block.text.trim(), '')
        } else if (block.type === 'thinking') {
          const t = String(block.thinking || '').trim()
          if (t)
            out.push(`_thinking (${t.length} chars): ${oneLine(t, 300)}_`, '')
        } else if (block.type === 'tool_use') {
          toolNames.set(block.id, block.name)
          out.push(`🔧 **${describeToolUse(block.name, block.input)}**`, '')
          const detail = toolUseDetail(block.name, block.input)
          if (detail) out.push(detail, '')
        }
      }
      continue
    }
    if (ev.type === 'user' && ev.message) {
      const content = Array.isArray(ev.message.content)
        ? ev.message.content
        : null
      if (!content) {
        const text = String(ev.message.content ?? '').trim()
        if (text) out.push(`### User`, '', fence(clip(text, 1500)), '')
        continue
      }
      for (const block of content) {
        if (!block || typeof block !== 'object') continue
        if (block.type === 'tool_result') {
          const name = toolNames.get(block.tool_use_id) || 'tool'
          const text = toolResultText(block).trim()
          const label = block.is_error ? `✗ ${name} failed` : `↳ ${name} result`
          out.push(`${label} (${text.length} chars)`, '')
          if (text) out.push(fence(clip(text, resultLimit)), '')
        } else if (block.type === 'text' && block.text) {
          out.push(`### User`, '', fence(clip(block.text.trim(), 1500)), '')
        }
      }
      continue
    }
    if (ev.type === 'result') {
      const u = ev.usage || {}
      const tokens = {
        input: num(u.input_tokens),
        output: num(u.output_tokens),
        cache_read: num(u.cache_read_input_tokens),
        cache_creation: num(u.cache_creation_input_tokens),
      }
      const verdict = ev.is_error ? 'ERROR' : ev.subtype || 'done'
      out.push(
        `## Result · ${verdict} · ${num(ev.num_turns)} turns · ${duration(ev.duration_ms)} · ${usd(ev.total_cost_usd)}`,
        '',
        `_Tokens: ${fmtTokens(tokens)}${ev.stop_reason ? ` · stop: ${ev.stop_reason}` : ''}_`,
        '',
      )
      if (typeof ev.result === 'string' && ev.result.trim()) {
        out.push('### Final message', '', ev.result.trim(), '')
      }
      continue
    }
    if (ev.type === 'unparsed') {
      out.push(`_unparsed line:_ ${fence(clip(ev.line, 300))}`, '')
    }
  }
  if (s.calls === 0)
    out.push(
      '_No result event: the call did not finish (see claude-stderr.txt)._',
      '',
    )
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '')
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function usage(code) {
  process.stderr.write(
    'usage: transcript.mjs scrub | render <transcript.jsonl> [out.md] | summary <transcript.jsonl> | result <transcript.jsonl> [n]\n',
  )
  process.exit(code)
}

async function main(argv) {
  const [cmd, file, extra] = argv
  if (cmd === 'scrub') {
    await scrubStream(process.stdin, process.stdout)
    return
  }
  if (!file) usage(2)
  if (cmd === 'render') {
    const events = fs.existsSync(file) ? readEvents(file) : []
    const title = process.env.FLEET_TRANSCRIPT_TITLE || 'Fleet transcript'
    const md = render(events, { title }) + '\n'
    if (extra) fs.writeFileSync(extra, md)
    else process.stdout.write(md)
    return
  }
  if (cmd === 'summary') {
    const events = fs.existsSync(file) ? readEvents(file) : []
    process.stdout.write(JSON.stringify(summarize(events)) + '\n')
    return
  }
  if (cmd === 'result') {
    const results = (fs.existsSync(file) ? readEvents(file) : []).filter(
      (ev) => ev.type === 'result',
    )
    const n = extra ? Number(extra) : results.length
    const ev = results[n - 1]
    if (ev) process.stdout.write(JSON.stringify(ev) + '\n')
    return
  }
  usage(2)
}

// Run main() only when executed directly (node resolves the main module
// through symlinks, so compare real paths).
const invokedAs = (() => {
  if (!process.argv[1]) return ''
  try {
    return fs.realpathSync(path.resolve(process.argv[1]))
  } catch {
    return path.resolve(process.argv[1])
  }
})()
if (invokedAs === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(
      `transcript.mjs: ${err && err.stack ? err.stack : err}\n`,
    )
    process.exit(1)
  })
}
