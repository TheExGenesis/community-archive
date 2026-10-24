#!/usr/bin/env node
// Where an Ask the archive run spent its time, from the local logs.
//
//   node scripts/agent-search/timing.mjs asr_… [asr_…]       dev runs
//   node scripts/agent-search/timing.mjs --latest 2           newest dev runs
//   node scripts/agent-search/timing.mjs --eval results/x.json [--only id]
//   add --steps for one line per model call and per command
//
// Dev runs read .agent-search-runs/<id>.json, <id>.calls.jsonl (one line per
// model call) and <id>.commands.jsonl (one line per shell command, with its
// gateway, semantic and scorer time). Eval results come from eval.ts.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'

const RUN_DIR = path.join(process.cwd(), '.agent-search-runs')

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const showSteps = flag('--steps')

const s = (ms) => `${(ms / 1000).toFixed(1)} s`
const pct = (part, whole) =>
  whole ? `${Math.round((part / whole) * 100)}%`.padStart(4) : '   -'
const sum = (xs) => xs.reduce((a, b) => a + b, 0)

/** Total length of the union of [from, to] intervals. */
function unionMs(intervals) {
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

const readJsonl = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []

function row(label, ms, whole, note = '') {
  console.log(`  ${label.padEnd(44)} ${s(ms).padStart(8)} ${pct(ms, whole)}  ${note}`)
}

function devRun(id) {
  const run = JSON.parse(readFileSync(path.join(RUN_DIR, `${id}.json`), 'utf8'))
  const t0 = Date.parse(run.startedAt)
  const t1 = run.completedAt ? Date.parse(run.completedAt) : NaN
  const models = readJsonl(path.join(RUN_DIR, `${id}.calls.jsonl`)).map((c) => {
    const end = Date.parse(c.at)
    const start = c.startedAt ? Date.parse(c.startedAt) : end - c.ms
    return { ...c, start, end }
  })
  const commands = readJsonl(path.join(RUN_DIR, `${id}.commands.jsonl`)).map(
    (c) => ({ ...c, start: Date.parse(c.startedAt), end: Date.parse(c.startedAt) + c.ms }),
  )
  const end = Number.isFinite(t1)
    ? t1
    : Math.max(t0, ...models.map((m) => m.end), ...commands.map((c) => c.end))
  const total = end - t0

  console.log(`\n${id} · ${run.status} · ${JSON.stringify(run.question).slice(0, 90)}`)
  if (!commands.length) {
    console.log('  (no command log: run predates the timing log, or no commands ran)')
  }

  const modelMs = sum(models.map((m) => m.ms))
  const timed = models.filter((m) => m.firstOutputMs !== undefined)
  const waitMs = sum(timed.map((m) => m.firstOutputMs))
  const reasonMs = sum(
    timed.map((m) => (m.firstActionMs ?? m.ms) - m.firstOutputMs),
  )
  const commandWall = unionMs(commands.map((c) => [c.start, c.end]))
  // Network calls in absolute time, so overlap across parallel commands counts once.
  const spansOf = (kind) =>
    commands.flatMap((c) =>
      (c.spans ?? [])
        .filter((span) => span[0] === kind)
        .map((span) => [c.start + span[3], c.start + span[3] + span[4]]),
    )
  const gatewayWall = unionMs(spansOf('gateway'))
  const semanticWall = unionMs(spansOf('semantic'))
  const scorerWall = unionMs(spansOf('scorer'))
  const busy = unionMs([
    ...models.map((m) => [m.start, m.end]),
    ...commands.map((c) => [c.start, c.end]),
  ])
  const firstModel = models.length ? Math.min(...models.map((m) => m.start)) : end
  const lastWork = Math.max(t0, ...models.map((m) => m.end), ...commands.map((c) => c.end))

  console.log(`  total ${s(total)} · ${models.length} model calls · ${commands.length} commands`)
  row('model calls', modelMs, total)
  if (timed.length) {
    row('  waiting for first output', waitMs, total, 'queue, prefill, host latency')
    row('  reasoning before acting', reasonMs, total)
    row('  writing the call or answer', modelMs - waitMs - reasonMs, total)
  }
  row('commands (wall)', commandWall, total)
  row('  gateway in flight', gatewayWall, total)
  row('  semantic in flight', semanticWall, total)
  row('  scorer in flight', scorerWall, total)
  row('  other command time', Math.max(0, commandWall - unionMs([...spansOf('gateway'), ...spansOf('semantic'), ...spansOf('scorer')])), total, 'shell, jq, rebuild bookkeeping')
  row('neither model nor command', total - busy, total, 'step hand-off, admission, context, record')
  row('  before the first model call', firstModel - t0, total)
  row('  after the last model call or command', end - lastWork, total)

  const hosts = {}
  for (const m of models) {
    const h = (hosts[m.servedBy ?? m.model] ??= { n: 0, ms: 0, out: 0, wait: [] })
    h.n++
    h.ms += m.ms
    h.out += m.outputTokens
    if (m.firstOutputMs !== undefined) h.wait.push(m.firstOutputMs)
  }
  for (const [host, h] of Object.entries(hosts)) {
    const wait = h.wait.sort((a, b) => a - b)[Math.floor(h.wait.length / 2)]
    console.log(
      `  host ${host}: ${h.n} calls, ${Math.round(h.out / (h.ms / 1000))} tokens/s overall` +
        (wait !== undefined ? `, median first output ${s(wait)}` : ''),
    )
  }
  const reasoning = sum(models.map((m) => m.reasoningTokens ?? 0))
  const out = sum(models.map((m) => m.outputTokens))
  console.log(`  output tokens ${out}, reasoning ${reasoning} (${pct(reasoning, out).trim()})`)

  if (showSteps) {
    const events = [
      ...models.map((m) => ({ t: m.start, m })),
      ...commands.map((c) => ({ t: c.start, c })),
    ].sort((a, b) => a.t - b.t)
    let prevEnd = t0
    for (const { m, c } of events) {
      const start = (m ?? c).start
      const gap = start - prevEnd
      const at = s(start - t0).padStart(7)
      const g = gap > 50 ? ` (+${s(gap)} idle)` : ''
      if (m) {
        console.log(
          `  ${at} model   ${s(m.ms).padStart(7)}${g} first out ${m.firstOutputMs !== undefined ? s(m.firstOutputMs) : '?'}, act ${m.firstActionMs !== undefined ? s(m.firstActionMs) : '?'}, out ${m.outputTokens} (reason ${m.reasoningTokens ?? 0}) ${m.servedBy ?? ''} ${m.finishReason ?? ''}`,
        )
      } else {
        const net = [
          c.gateway.calls ? `gw ${c.gateway.calls}× ${s(c.gateway.wallMs)}` : '',
          c.semantic.calls ? `sem ${s(c.semantic.wallMs)}` : '',
          c.scorer.calls ? `score ${s(c.scorer.wallMs)}` : '',
        ]
          .filter(Boolean)
          .join(', ')
        console.log(
          `  ${at} command ${s(c.ms).padStart(7)}${g} ${net}${net ? ' · ' : ''}${c.summary.slice(0, 60)} :: ${c.command.slice(0, 90)}`,
        )
      }
      prevEnd = Math.max(prevEnd, (m ?? c).end)
    }
  }
}

function evalResults(file, only) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  const results = (data.results ?? data).filter((r) => !only || only.includes(r.id))
  for (const r of results) {
    const steps = r.stepTimings ?? []
    const total = r.wallMs
    const model = sum(steps.map((st) => st.responseMs))
    const stepTotal = sum(steps.map((st) => st.stepMs))
    const timings = r.toolCalls.map((t) => t.timing).filter(Boolean)
    const kind = (k) => sum(timings.map((t) => t[k]?.wallMs ?? 0))
    console.log(`\n${r.id} (in-process eval) · ${r.toolCalls.length} commands · ${steps.length} model steps`)
    console.log(`  total ${s(total)}`)
    row('model calls', model, total)
    row('tools (step time minus model)', stepTotal - model, total)
    row('  gateway in flight (per command, summed)', kind('gateway'), total)
    row('  semantic in flight', kind('semantic'), total)
    row('  scorer in flight', kind('scorer'), total)
    row('outside steps', total - stepTotal, total, 'key check, setup')
    if (!steps.length) console.log('  (no step timings: results predate the timing fields)')
  }
}

const evalFile = value('--eval')
if (evalFile) {
  evalResults(path.resolve(evalFile), value('--only')?.split(','))
} else {
  let ids = args.filter((a) => a.startsWith('asr_'))
  const latest = Number(value('--latest') ?? 0)
  if (latest) {
    ids = readdirSync(RUN_DIR)
      .filter((name) => /^asr_[0-9a-f]+\.json$/.test(name))
      .map((name) => ({ name, at: statSync(path.join(RUN_DIR, name)).mtimeMs }))
      .sort((a, b) => b.at - a.at)
      .slice(0, latest)
      .map(({ name }) => name.slice(0, -'.json'.length))
  }
  if (!ids.length) {
    console.error('usage: timing.mjs asr_… | --latest N | --eval results.json [--only id] [--steps]')
    process.exit(1)
  }
  for (const id of ids) devRun(id)
}
