import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  ProgressBatcher,
  ProgressTracker,
  humanText,
  summariseEvent,
} from '../src/summarise.js'
import { renderStatus } from '../src/status.js'
import { parseClassification, parseTurnVerdict } from '../src/verdict.js'
import { findRepoRoot } from '../src/config.js'

const fixture = path.join(
  findRepoRoot(),
  'fleet',
  'test',
  'fixtures',
  'stream.jsonl',
)

test('summariseEvent turns the fixer fixture into short progress lines', () => {
  const events = fs
    .readFileSync(fixture, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>)
  const lines = events.flatMap((ev) => summariseEvent(ev))
  assert.ok(
    lines.some((l) =>
      l.startsWith("💬 I'll start by reading the route handler."),
    ),
    lines.join('\n'),
  )
  assert.ok(
    lines.some((l) =>
      l.startsWith('🔧 Read `src/app/api/tweet-search/route.ts`'),
    ),
    lines.join('\n'),
  )
  assert.ok(
    lines.some((l) =>
      l.startsWith('🔧 Edit `src/app/api/tweet-search/route.ts`'),
    ),
    lines.join('\n'),
  )
  // Tool results (the 10 KB padding in the fixture) do not become lines.
  assert.ok(
    lines.every((l) => l.length <= 410),
    'lines are clipped',
  )
  assert.ok(
    lines.every((l) => !l.includes('xxxxxxxx')),
    'tool results stay out of the thread',
  )
})

test('summariseEvent uses the shared describeToolUse when given one', () => {
  const ev = {
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', name: 'Bash', input: { command: 'pnpm lint' } },
      ],
    },
  }
  const lines = summariseEvent(ev, {
    describeToolUse: (n, i) => `${n}!${(i as { command: string }).command}`,
  })
  assert.deepEqual(lines, ['🔧 Bash!pnpm lint'])
})

test('summariseEvent reports tool errors and the result line', () => {
  const err = {
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          is_error: true,
          content: 'ENOENT: no such file',
        },
      ],
    },
  }
  assert.deepEqual(summariseEvent(err), ['⚠️ tool error: ENOENT: no such file'])
  assert.deepEqual(
    summariseEvent({ type: 'result', num_turns: 7, total_cost_usd: 0.42 }),
    ['✅ turn finished (7 turns, $0.42)'],
  )
  assert.deepEqual(summariseEvent({ type: 'result', is_error: true }), [
    '❌ Claude run failed',
  ])
  assert.deepEqual(summariseEvent({ type: 'system', subtype: 'init' }), [])
})

test('humanText strips the verdict block', () => {
  const text =
    'Fixed the null guard.\n\n```json\n{"status":"done","summary":"x"}\n```'
  assert.equal(humanText(text), 'Fixed the null guard.')
})

test('ProgressBatcher coalesces lines and respects the interval', async () => {
  let now = 0
  const flushes: string[][] = []
  const b = new ProgressBatcher(async (lines) => void flushes.push(lines), {
    intervalMs: 5000,
    maxLines: 3,
    now: () => now,
  })
  b.push('a')
  await b.flush()
  assert.deepEqual(flushes, [['a']])
  now = 1000
  b.push('b', 'c', 'd', 'e')
  assert.equal(flushes.length, 1, 'within the interval nothing is posted yet')
  now = 6000
  await b.drain()
  assert.deepEqual(flushes.slice(1), [['b', 'c', 'd'], ['e']])
})

test('renderStatus draws the checklist', () => {
  const s = renderStatus({
    title: 'Fix search 500',
    current: 'gate',
    done: ['understanding', 'working'],
    runId: 'r1',
  })
  assert.equal(s.split('\n')[0], '*Fix search 500*')
  assert.equal(
    s.split('\n')[1],
    '☑ understanding   ☑ working   ▶ gate   ☐ PR   ☐ waiting on you',
  )
  assert.ok(s.includes('run `r1`'))
  const f = renderStatus({
    title: 't',
    failed: ['gate'],
    done: ['understanding', 'working'],
    finished: 'error',
  })
  assert.ok(f.includes('✖ gate'))
  assert.ok(f.includes('❌ errored'))
})

test('parseTurnVerdict reads the fenced block and falls back to the diff', () => {
  const v = parseTurnVerdict(
    'Done.\n```json\n{"status":"done","summary":"Guarded q.","title":"Guard empty q"}\n```',
    true,
  )
  assert.deepEqual(v, {
    status: 'done',
    summary: 'Guarded q.',
    title: 'Guard empty q',
    close: [],
    explicit: true,
  })
  const q = parseTurnVerdict('Which of the two routes do you mean?', false)
  assert.equal(q.status, 'question')
  assert.equal(q.explicit, false)
  assert.equal(parseTurnVerdict('I changed it.', true).status, 'done')
  assert.equal(
    parseTurnVerdict('```json\n{"status":"nonsense"}\n```', false).status,
    'question',
  )
})

test('parseClassification', () => {
  assert.deepEqual(
    parseClassification(
      'Easy.\n```json\n{"verdict":"obvious","reason":"null guard"}\n```',
    ),
    {
      verdict: 'obvious',
      reason: 'null guard',
      explicit: true,
    },
  )
  assert.equal(parseClassification('no block').verdict, 'needs-decision')
})

test('ProgressTracker folds tool calls into one status line', () => {
  const t = new ProgressTracker()
  assert.equal(t.line(), '')
  t.observe({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', name: 'Read', input: { file_path: 'src/a.ts' } },
        { type: 'tool_use', name: 'Bash', input: { command: 'pnpm lint' } },
      ],
    },
  })
  t.observe({
    type: 'user',
    message: {
      content: [{ type: 'tool_result', is_error: true, content: 'denied' }],
    },
  })
  assert.equal(
    t.line(),
    '_working · 2 tool calls · 1 tool error · Bash `pnpm lint`_',
  )
})

test('parseTurnVerdict reads the close list in its lenient forms', () => {
  const v = parseTurnVerdict(
    'Outdated.\n\n```json\n{"status":"stop","summary":"Outdated.","close":[7, "#8", {"number": 9, "reason": "fixed in abc"}, {"issue": "10"}, "x"]}\n```',
    false,
  )
  assert.equal(v.status, 'stop')
  assert.deepEqual(v.close, [
    { number: 7, reason: 'Outdated.' },
    { number: 8, reason: 'Outdated.' },
    { number: 9, reason: 'fixed in abc' },
    { number: 10, reason: 'Outdated.' },
  ])
  assert.deepEqual(parseTurnVerdict('plain text', true).close, [])
})
