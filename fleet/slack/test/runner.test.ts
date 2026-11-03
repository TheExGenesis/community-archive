// End-to-end task runs against the real fleet/bin/task.sh, a throwaway git
// repository with a bare origin, and the fleet test fakes for claude, gh,
// pnpm and curl. Slack is the in-memory fake.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { findRepoRoot, type Config } from '../src/config.js'
import { loadTranscriptLib } from '../src/fleetLib.js'
import { FleetTask } from '../src/fleetTask.js'
import { createTokenProvider } from '../src/github.js'
import { silentLogger } from '../src/log.js'
import { TaskRunner } from '../src/runner.js'
import { Store } from '../src/store.js'
import { buttonsOf, FakeSlack, tmpDir } from './helpers.js'

const SRC_ROOT = findRepoRoot()
const FAKES = path.join(SRC_ROOT, 'fleet', 'test', 'fakes')

interface Harness {
  base: string
  repo: string
  origin: string
  ghState: string
  env: NodeJS.ProcessEnv
  cfg: Config
  store: Store
  slack: FakeSlack
  runner: TaskRunner
  fleet: FleetTask
  claudeLog: string
  pnpmLog: string
}

function claudeResult(
  text: string,
  sessionId = '11111111-2222-3333-4444-555555555555',
): string {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 3,
    duration_ms: 1234,
    session_id: sessionId,
    result: text,
    total_cost_usd: 0.21,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  })
}

const DONE_TEXT =
  'Set the answer to 42 in src/foo.ts.\n\n```json\n{"status":"done","summary":"Set the answer to 42.","title":"Set the answer to 42"}\n```'
const QUESTION_TEXT =
  'Do you want 42 or 43?\n\n```json\n{"status":"question","summary":"Need the target value."}\n```'
const STOP_TEXT =
  'Works as designed; 41 is intentional.\n\n```json\n{"status":"stop","summary":"Works as designed."}\n```'

async function setup(extraEnv: Record<string, string> = {}): Promise<Harness> {
  const base = tmpDir('fleet-slack-e2e-')
  execFileSync(
    'bash',
    [
      '-c',
      'source "$1/fleet/test/lib.sh"; make_test_repo "$2"',
      '_',
      SRC_ROOT,
      base,
    ],
    { stdio: 'pipe' },
  )
  const repo = path.join(base, 'repo')
  const origin = path.join(base, 'origin.git')
  const ghState = path.join(base, 'gh')
  fs.mkdirSync(ghState)
  fs.writeFileSync(
    path.join(ghState, 'issues.json'),
    JSON.stringify([
      {
        number: 7,
        title: 'bug: answer is off by one',
        state: 'OPEN',
        createdAt: '2026-10-01T09:00:00Z',
        labels: [{ name: 'bug' }],
        body: 'src/foo.ts exports 41, should be 42.',
        comments: [],
      },
    ]),
  )
  fs.writeFileSync(path.join(ghState, 'labels.txt'), 'bug\nsignal\n')
  fs.writeFileSync(path.join(ghState, 'prs.json'), '[]')
  fs.writeFileSync(path.join(ghState, 'calls.log'), '')
  const claudeLog = path.join(base, 'claude.log')
  const pnpmLog = path.join(base, 'pnpm.log')
  fs.writeFileSync(claudeLog, '')
  fs.writeFileSync(pnpmLog, '')
  const curlDir = path.join(base, 'curl')
  fs.mkdirSync(curlDir)
  const env: NodeJS.ProcessEnv = {
    PATH: `${FAKES}:${process.env.PATH}`,
    HOME: process.env.HOME,
    TMPDIR: base,
    FAKE_GH_STATE: ghState,
    FAKE_GH_REMOTE: origin,
    FAKE_PNPM_LOG: pnpmLog,
    FAKE_CLAUDE_LOG: claudeLog,
    FAKE_CURL_DIR: curlDir,
    FLEET_GIT_NAME: 'fleet-test',
    FLEET_GIT_EMAIL: 'fleet-test@example.invalid',
    GIT_CONFIG_NOSYSTEM: '1',
    ...extraEnv,
  }
  const runsDir = path.join(base, 'runs')
  const cfg: Config = {
    botToken: '',
    appToken: '',
    signalsChannel: 'CSIG',
    allowedUserIds: new Set(['U1']),
    fleetHome: base,
    fleetRoot: repo,
    runsDir,
    dbPath: ':memory:',
    worktreeBase: path.join(base, 'wt'),
    taskScript: path.join(repo, 'fleet', 'bin', 'task.sh'),
    runsScript: path.join(repo, 'fleet', 'bin', 'runs.sh'),
    instructionsPath: path.join(repo, 'fleet', 'slack', 'INSTRUCTIONS.md'),
    repo: 'o/r',
    baseBranch: 'main',
    githubToken: 'ghp_testtoken1234567890abcdefghijklmnop',
    claudeBin: path.join(FAKES, 'claude'),
    maxTurns: 10,
    maxChangedLines: 300,
    exploreUrl: 'https://g.example/explore?run={run_id}',
    intakeIntervalMs: 0,
    intakeEnabled: false,
    maxConcurrentTasks: 1,
    progressIntervalMs: 0,
    env,
  }
  const tokens = createTokenProvider({
    staticToken: cfg.githubToken,
    baseEnv: env,
  })
  const fleet = new FleetTask(cfg, tokens)
  const store = new Store(':memory:')
  const slack = new FakeSlack()
  const lib = await loadTranscriptLib(repo)
  const runner = new TaskRunner({
    cfg,
    store,
    fleet,
    slack,
    log: silentLogger,
    lib,
    instructions: () => fs.readFileSync(cfg.instructionsPath, 'utf8'),
  })
  return {
    base,
    repo,
    origin,
    ghState,
    env,
    cfg,
    store,
    slack,
    runner,
    fleet,
    claudeLog,
    pnpmLog,
  }
}

function prs(h: Harness): {
  number: number
  url: string
  title: string
  body: string
  head: string
  state: string
}[] {
  return JSON.parse(fs.readFileSync(path.join(h.ghState, 'prs.json'), 'utf8'))
}

function originBranches(h: Harness): string[] {
  return execFileSync(
    'git',
    [
      '-C',
      h.origin,
      'for-each-ref',
      '--format=%(refname:short)',
      'refs/heads/',
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
}

test('happy path: task → gate → PR with buttons → merge closes the thread', async () => {
  const h = await setup({
    FAKE_CLAUDE_OUTPUT: path.join(tmpDir(), 'out.json'),
    FAKE_CLAUDE_EDITS: 'printf "export const answer = 42\\n" > src/foo.ts',
  })
  fs.writeFileSync(h.env.FAKE_CLAUDE_OUTPUT as string, claudeResult(DONE_TEXT))

  await h.runner.start({
    channel: 'C1',
    threadTs: '1.0',
    userId: 'U1',
    text: 'set the answer to 42',
    source: 'mention',
  })

  const thread = h.store.getThread('C1', '1.0')
  assert.ok(thread, 'thread recorded')
  assert.equal(thread.state, 'pr_open')
  assert.equal(thread.sessionId, '11111111-2222-3333-4444-555555555555')
  assert.ok(thread.branch?.startsWith('fleet/slack-'), thread.branch)
  assert.ok(thread.prUrl?.endsWith('/pull/100'), thread.prUrl)

  // Status message: posted first, then edited through the checklist.
  const status = h.slack.posts[0]
  assert.equal(status.threadTs, '1.0')
  assert.match(status.text, /▶ understanding/)
  const finalStatus = h.slack.lastUpdate(status.ts) || ''
  assert.match(
    finalStatus,
    /☑ understanding   ☑ working   ☑ gate   ☑ PR   ▶ waiting on you/,
  )
  assert.ok(finalStatus.includes('|PR>'), finalStatus)
  assert.ok(finalStatus.includes('https://g.example/explore?run='), finalStatus)

  // Progress lines from the stream, Claude's text, the PR message with two buttons, the run line.
  const texts = h.slack.texts('C1', '1.0')
  assert.ok(
    texts.some((t) => t.includes('🔧 Read `src/foo.ts`')),
    texts.join('\n---\n'),
  )
  assert.ok(
    texts.some((t) => t.startsWith('Set the answer to 42 in src/foo.ts.')),
    'final text posted without the json block',
  )
  assert.ok(
    !texts.some((t) => t.includes('"status"')),
    'verdict block not shown',
  )
  const prMsg = h.slack.posts.find((p) => buttonsOf(p).length > 0)
  assert.ok(prMsg, 'PR message has buttons')
  assert.deepEqual(
    buttonsOf(prMsg).map((b) => b.actionId),
    ['merge_pr', 'not_now'],
  )
  assert.equal(buttonsOf(prMsg)[0].value.pr, 100)
  assert.match(
    prMsg.text,
    /Opened <.*\/pull\/100\|PR #100>: Set the answer to 42/,
  )
  assert.match(prMsg.text, /small Tier 0 change\. Merge when CI is green\?/)
  assert.ok(
    texts.some((t) =>
      /^Run `\d{8}T\d{6}Z-slack` · outcome `pr_opened` · <https:\/\/g\.example/.test(
        t,
      ),
    ),
    'run line',
  )

  // GitHub side: the PR, its branch on origin, the commit convention.
  const [pr] = prs(h)
  assert.equal(pr.title, '[fleet:slack] Set the answer to 42')
  assert.ok(pr.body.includes('Requested by Slack user `U1`'), pr.body)
  assert.ok(
    pr.body.includes('[thread](https://slack.example/archives/C1/'),
    pr.body,
  )
  assert.ok(
    pr.body.includes(
      'Gate: lint, type-check, security tests and unit tests passed locally.',
    ),
    pr.body,
  )
  assert.ok(originBranches(h).includes(pr.head), `branch ${pr.head} pushed`)
  const log = execFileSync(
    'git',
    ['-C', h.origin, 'log', '-1', '--format=%B', pr.head],
    { encoding: 'utf8' },
  )
  assert.match(log, /^\[fleet:slack\] Set the answer to 42\n/)
  assert.match(log, /Co-Authored-By: Claude/)
  assert.equal(
    h.pnpmLog.length > 0 &&
      fs.readFileSync(h.pnpmLog, 'utf8').trim().split('\n').length,
    4,
    'four gate checks',
  )

  // Claude was called the fixer's way, with INSTRUCTIONS.md as system context.
  const claudeArgs = fs.readFileSync(h.claudeLog, 'utf8')
  assert.match(claudeArgs, /--permission-mode dontAsk/)
  assert.match(claudeArgs, /--output-format stream-json --verbose/)
  assert.match(claudeArgs, /Bash\\\(git\\ push\\\*\\\)/)
  assert.match(claudeArgs, /--append-system-prompt .*Standing rules/)
  assert.match(
    fs.readFileSync(`${h.claudeLog}.prompt-1`, 'utf8'),
    /Request from <@U1> in Slack:\n\nset the answer to 42/,
  )

  // Run directory: the fixer's files, result.json, metrics, Loki export.
  const runDir = thread.runDir as string
  for (const f of [
    'prompt.md',
    'transcript.jsonl',
    'transcript.md',
    'claude-output.json',
    'gate-1/summary.txt',
    'commit-message-1.txt',
    'pr-body.md',
    'result.json',
    'loki.jsonl',
    'claude-invocations.txt',
  ]) {
    assert.ok(fs.existsSync(path.join(runDir, f)), `${f} in run dir`)
  }
  const result = JSON.parse(
    fs.readFileSync(path.join(runDir, 'result.json'), 'utf8'),
  )
  assert.equal(result.outcome, 'pr_opened')
  assert.equal(result.run, 'slack')
  assert.equal(result.pr_url, pr.url)
  assert.equal(result.mode, 'slack')
  assert.equal(result.slack_thread_ts, '1.0')
  assert.equal(result.cost_usd, 0.21)
  const metrics = fs.readFileSync(
    path.join(h.cfg.runsDir, 'metrics.prom'),
    'utf8',
  )
  assert.match(
    metrics,
    /fleet_run_total\{outcome="pr_opened",routine="slack"\} 1/,
  )
  assert.ok(
    !fs
      .readFileSync(path.join(runDir, 'transcript.jsonl'), 'utf8')
      .includes('ghp_testtoken'),
    'token scrubbed from transcript',
  )

  // Merge from the button.
  await h.runner.merge(thread, 'U1')
  assert.equal(prs(h)[0].state, 'MERGED')
  assert.equal(h.store.getThread('C1', '1.0')?.state, 'merged')
  assert.match(
    h.slack.texts('C1', '1.0').pop() || '',
    /🎉 Merged <.*pull\/100\|PR #100> \(squash\) by <@U1>/,
  )
  assert.match(h.slack.lastUpdate(status.ts) || '', /🎉 merged/)
  assert.ok(
    !fs.existsSync(thread.worktree as string),
    'worktree removed after merge',
  )
  assert.match(
    fs.readFileSync(path.join(h.ghState, 'calls.log'), 'utf8'),
    /pr merge 100 --repo o\/r --squash --delete-branch/,
  )
  h.store.close()
})

test('a question pauses the task; the reply resumes the same session and ships', async () => {
  const q = path.join(tmpDir(), 'q.json')
  const done = path.join(tmpDir(), 'done.json')
  fs.writeFileSync(q, claudeResult(QUESTION_TEXT))
  fs.writeFileSync(done, claudeResult(DONE_TEXT))
  const h = await setup({
    FAKE_CLAUDE_OUTPUT: q,
    FAKE_CLAUDE_OUTPUT_2: done,
    FAKE_CLAUDE_EDITS_2: 'printf "export const answer = 42\\n" > src/foo.ts',
  })
  await h.runner.start({
    channel: 'C1',
    threadTs: '2.0',
    userId: 'U1',
    text: 'fix the answer',
    source: 'mention',
  })
  let thread = h.store.getThread('C1', '2.0')
  assert.equal(thread?.state, 'waiting')
  assert.ok(
    h.slack
      .texts('C1', '2.0')
      .some((t) => t.startsWith('Do you want 42 or 43?')),
  )
  assert.match(
    h.slack.lastUpdate(h.slack.posts[0].ts) || '',
    /☑ understanding   ☐ working   ☐ gate   ☐ PR   ▶ waiting on you/,
  )
  assert.equal(prs(h).length, 0, 'no PR yet')
  assert.equal(fs.readFileSync(h.pnpmLog, 'utf8'), '', 'no gate for a question')
  assert.ok(
    fs.existsSync(thread?.worktree as string),
    'worktree kept while waiting',
  )

  await h.runner.reply(thread as NonNullable<typeof thread>, '42 please', 'U1')
  thread = h.store.getThread('C1', '2.0')
  assert.equal(thread?.state, 'pr_open')
  assert.equal(prs(h).length, 1)
  const claudeArgs = fs.readFileSync(h.claudeLog, 'utf8').trim().split('\n')
  assert.equal(claudeArgs.length, 2)
  assert.match(claudeArgs[1], /--resume 11111111-2222-3333-4444-555555555555/)
  assert.match(
    fs.readFileSync(`${h.claudeLog}.prompt-2`, 'utf8'),
    /Reply from <@U1> in the Slack thread:\n\n42 please/,
  )
  assert.ok(
    fs.existsSync(path.join(thread?.runDir as string, 'claude-output-2.json')),
    'second call recorded in the same run',
  )
  h.store.close()
})

test('Tier 1 paths ship as a PR without a Merge button and the guard refuses', async () => {
  const h = await setup({
    FAKE_CLAUDE_OUTPUT: path.join(tmpDir(), 'out.json'),
    FAKE_CLAUDE_EDITS:
      'mkdir -p supabase/migrations && echo "alter table x" > supabase/migrations/1.sql',
  })
  fs.writeFileSync(h.env.FAKE_CLAUDE_OUTPUT as string, claudeResult(DONE_TEXT))
  await h.runner.start({
    channel: 'C1',
    threadTs: '3.0',
    userId: 'U1',
    text: 'add the migration',
    source: 'mention',
  })
  const thread = h.store.getThread('C1', '3.0')
  assert.equal(thread?.state, 'pr_open')
  const prMsg = h.slack.posts.find((p) => buttonsOf(p).length > 0)
  assert.ok(prMsg)
  assert.deepEqual(
    buttonsOf(prMsg).map((b) => b.actionId),
    ['not_now'],
  )
  assert.match(prMsg.text, /Tier 1 path changed: supabase\/migrations\/1\.sql/)
  assert.match(prMsg.text, /a human merges this on GitHub/)
  assert.ok(prs(h)[0].body.includes('## Review flags'))
  // Even a direct merge call is refused once the PR's files are checked.
  const state = JSON.parse(
    fs.readFileSync(path.join(h.ghState, 'prs.json'), 'utf8'),
  )
  state[0].files = [{ path: 'supabase/migrations/1.sql' }]
  fs.writeFileSync(path.join(h.ghState, 'prs.json'), JSON.stringify(state))
  await h.runner.merge(thread as NonNullable<typeof thread>, 'U1')
  assert.match(
    h.slack.texts('C1', '3.0').pop() || '',
    /🚫 Not merging .*Tier 1: Tier 1 path changed: supabase\/migrations\/1\.sql/,
  )
  assert.equal(prs(h)[0].state, 'OPEN')
  h.store.close()
})

test('a red gate gets one repair attempt, then waits for a human with nothing pushed', async () => {
  const h = await setup({
    FAKE_CLAUDE_OUTPUT: path.join(tmpDir(), 'out.json'),
    FAKE_CLAUDE_EDITS: 'printf "export const answer = 42\\n" > src/foo.ts',
    FAKE_PNPM_FAIL: 'lint',
    FAKE_PNPM_FAIL_TIMES: '5',
  })
  fs.writeFileSync(h.env.FAKE_CLAUDE_OUTPUT as string, claudeResult(DONE_TEXT))
  await h.runner.start({
    channel: 'C1',
    threadTs: '4.0',
    userId: 'U1',
    text: 'fix it',
    source: 'mention',
  })
  const thread = h.store.getThread('C1', '4.0')
  assert.equal(thread?.state, 'waiting')
  const texts = h.slack.texts('C1', '4.0')
  assert.ok(
    texts.some((t) =>
      t.startsWith('Gate failed (FAIL lint). Asking Claude to repair it once.'),
    ),
    texts.join('\n'),
  )
  assert.ok(
    texts.some(
      (t) =>
        t.includes('The gate is still red after one repair attempt') &&
        t.includes('fake pnpm: lint failed'),
    ),
    texts.join('\n'),
  )
  assert.equal(
    fs.readFileSync(h.claudeLog, 'utf8').trim().split('\n').length,
    2,
    'one repair call',
  )
  assert.match(
    fs.readFileSync(`${h.claudeLog}.prompt-2`, 'utf8'),
    /The CI gate failed on your change/,
  )
  assert.equal(prs(h).length, 0)
  assert.deepEqual(originBranches(h), ['main'], 'nothing pushed')
  assert.match(h.slack.lastUpdate(h.slack.posts[0].ts) || '', /✖ gate/)
  const result = JSON.parse(
    fs.readFileSync(path.join(thread?.runDir as string, 'result.json'), 'utf8'),
  )
  assert.equal(result.outcome, 'gate_failed')
  h.store.close()
})

test('stop ends the task, removes the worktree and records the run', async () => {
  const h = await setup({ FAKE_CLAUDE_OUTPUT: path.join(tmpDir(), 'out.json') })
  fs.writeFileSync(h.env.FAKE_CLAUDE_OUTPUT as string, claudeResult(STOP_TEXT))
  await h.runner.start({
    channel: 'C1',
    threadTs: '5.0',
    userId: 'U1',
    text: 'is 41 right?',
    source: 'dm',
  })
  const thread = h.store.getThread('C1', '5.0')
  assert.equal(thread?.state, 'closed')
  assert.equal(thread?.worktree, undefined)
  assert.match(
    h.slack.lastUpdate(h.slack.posts[0].ts) || '',
    /stopped, nothing shipped/,
  )
  const result = JSON.parse(
    fs.readFileSync(path.join(thread?.runDir as string, 'result.json'), 'utf8'),
  )
  assert.equal(result.outcome, 'stopped')
  assert.equal(prs(h).length, 0)
  h.store.close()
})

test('an issue-linked task writes a learning and links the issue in commit and PR', async () => {
  const h = await setup({
    FAKE_CLAUDE_OUTPUT: path.join(tmpDir(), 'out.json'),
    FAKE_CLAUDE_EDITS: 'printf "export const answer = 42\\n" > src/foo.ts',
  })
  fs.writeFileSync(h.env.FAKE_CLAUDE_OUTPUT as string, claudeResult(DONE_TEXT))
  await h.runner.start({
    channel: 'CSIG',
    threadTs: '6.0',
    userId: 'U1',
    text: '',
    source: 'intake',
    issue: {
      number: 7,
      title: 'bug: answer is off by one',
      body: 'src/foo.ts exports 41, should be 42.',
      url: 'https://github.com/o/r/issues/7',
    },
  })
  const thread = h.store.getThread('CSIG', '6.0')
  assert.equal(thread?.state, 'pr_open')
  assert.ok(thread?.branch?.endsWith('-7'), thread?.branch)
  const [pr] = prs(h)
  assert.equal(pr.title, '[fleet:slack] Set the answer to 42 (signal #7)')
  assert.ok(pr.body.includes('Fixes #7'))
  const files = execFileSync(
    'git',
    ['-C', h.origin, 'ls-tree', '-r', '--name-only', pr.head],
    { encoding: 'utf8' },
  )
  assert.match(files, /memos\/fleet\/learnings\/\d{4}-\d{2}-\d{2}-7\.md/)
  assert.match(
    fs.readFileSync(`${h.claudeLog}.prompt-1`, 'utf8'),
    /Work on GitHub issue #7: bug: answer is off by one/,
  )
  // Merge closes the issue.
  await h.runner.merge(thread as NonNullable<typeof thread>, 'U1')
  const issues = JSON.parse(
    fs.readFileSync(path.join(h.ghState, 'issues.json'), 'utf8'),
  )
  assert.equal(issues[0].state, 'CLOSED')
  assert.match(issues[0].comments[0].body, /\[fleet:slack\] merged/)
  assert.match(h.slack.texts('CSIG', '6.0').pop() || '', /Closed #7/)
  h.store.close()
})
