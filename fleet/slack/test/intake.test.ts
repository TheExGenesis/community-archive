import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Config } from '../src/config.js'
import type { FleetTask, InboxIssue } from '../src/fleetTask.js'
import {
  Intake,
  parseSignalBody,
  renderClassification,
  renderIssuePost,
} from '../src/intake.js'
import { silentLogger } from '../src/log.js'
import { Store } from '../src/store.js'
import { buttonsOf, FakeSlack } from './helpers.js'

const issues: InboxIssue[] = [
  {
    number: 10,
    title: '[signal:vercel] 502 on /api/tweet-search',
    body: 'Summary paragraph of the signal.\n\n```json signal\n{"source":"vercel","route":"/api/tweet-search","severity":"critical","link":"https://vercel.example/log"}\n```\n<!-- fp:abc123 -->',
    labels: [{ name: 'signal' }],
    createdAt: '2026-10-20T10:00:00Z',
  },
  {
    number: 7,
    title: 'bug: answer is off by one',
    body: 'src/foo.ts exports 41, should be 42.',
    labels: [{ name: 'bug' }],
    createdAt: '2026-10-01T09:00:00Z',
  },
]

function fakeFleet(list: () => Promise<InboxIssue[]>): FleetTask {
  return { issuesList: list } as unknown as FleetTask
}

const cfg = { signalsChannel: 'CSIG', repo: 'o/r' } as unknown as Config

test('parseSignalBody reads the fenced block and the summary paragraph', () => {
  const m = parseSignalBody(issues[0].body)
  assert.equal(m.severity, 'critical')
  assert.equal(m.route, '/api/tweet-search')
  assert.equal(m.source, 'vercel')
  assert.equal(m.link, 'https://vercel.example/log')
  assert.equal(m.summary, 'Summary paragraph of the signal.')
  assert.equal(parseSignalBody(null).summary, '(no summary)')
  assert.equal(parseSignalBody('plain bug text').summary, 'plain bug text')
})

test('renderIssuePost and renderClassification', () => {
  const text = renderIssuePost(
    issues[0],
    parseSignalBody(issues[0].body),
    'o/r',
  )
  assert.ok(
    text.startsWith(
      '*<https://github.com/o/r/issues/10|#10> [signal:vercel] 502 on /api/tweet-search*',
    ),
  )
  assert.ok(
    text.includes(
      'severity `critical` · route `/api/tweet-search` · source `vercel` · labels `signal`',
    ),
  )
  assert.ok(text.includes('<https://vercel.example/log|source link>'))
  assert.match(
    renderClassification({ verdict: 'obvious', reason: 'r', explicit: true }),
    /^Looks obvious: r$/,
  )
  assert.match(
    renderClassification({
      verdict: 'needs-decision',
      reason: 'r',
      explicit: true,
    }),
    /^Needs a decision: r$/,
  )
  assert.match(
    renderClassification({ verdict: 'wontfix', reason: 'r', explicit: true }),
    /^Probably not worth fixing: r/,
  )
})

test('intake posts each open issue once, classifies in the thread, and never starts a fix', async () => {
  const store = new Store(':memory:')
  const slack = new FakeSlack()
  const classified: number[] = []
  const intake = new Intake({
    cfg,
    store,
    fleet: fakeFleet(async () => issues),
    slack,
    log: silentLogger,
    classify: async (issue) => {
      classified.push(issue.number)
      return issue.number === 7
        ? { verdict: 'obvious', reason: 'one constant', explicit: true }
        : { verdict: 'needs-decision', reason: 'which route', explicit: true }
    },
  })
  const first = await intake.tick()
  assert.deepEqual(first, { posted: 2, seen: 2 })
  // Oldest issue number first; each as a top-level post in the signals channel.
  const tops = slack.posts.filter((p) => !p.threadTs)
  assert.deepEqual(
    tops.map((p) => p.channel),
    ['CSIG', 'CSIG'],
  )
  assert.ok(tops[0].text.includes('|#7>'), tops[0].text)
  assert.ok(tops[1].text.includes('|#10>'), tops[1].text)
  // Classification reply in each thread, with the Go ahead button carrying the issue.
  const reply7 = slack.thread('CSIG', tops[0].ts)
  assert.equal(reply7.length, 1)
  assert.match(reply7[0].text, /Looks obvious: one constant/)
  assert.deepEqual(
    buttonsOf(reply7[0]).map((b) => [b.actionId, b.value.issue]),
    [['go_ahead', 7]],
  )
  const reply10 = slack.thread('CSIG', tops[1].ts)
  assert.match(reply10[0].text, /Needs a decision: which route/)
  assert.deepEqual(
    [...classified].sort((a, b) => a - b),
    [7, 10],
  )
  assert.equal(store.getPostedIssue(7)?.classification, 'obvious')
  assert.equal(store.getPostedIssueByThread('CSIG', tops[0].ts)?.issueNumber, 7)

  // Second pass: nothing new, nothing re-posted.
  const second = await intake.tick()
  assert.deepEqual(second, { posted: 0, seen: 2 })
  assert.equal(slack.posts.length, 4)

  // A new issue appears: only it is posted.
  const third = await new Intake({
    cfg,
    store,
    fleet: fakeFleet(async () => [
      ...issues,
      {
        number: 11,
        title: 'bug: new',
        body: null,
        labels: ['bug'],
        createdAt: '2026-11-01T00:00:00Z',
      },
    ]),
    slack,
    log: silentLogger,
    classify: async () => ({
      verdict: 'wontfix',
      reason: 'noise',
      explicit: true,
    }),
  }).tick()
  assert.deepEqual(third, { posted: 1, seen: 3 })
  const last = slack.posts[slack.posts.length - 1]
  assert.match(last.text, /Probably not worth fixing: noise/)
  assert.equal(buttonsOf(last)[0].actionId, 'go_ahead')
  store.close()
})

test('a classifier failure still leaves a thread with a button', async () => {
  const store = new Store(':memory:')
  const slack = new FakeSlack()
  await new Intake({
    cfg,
    store,
    fleet: fakeFleet(async () => [issues[1]]),
    slack,
    log: silentLogger,
    classify: async () => {
      throw new Error('claude down')
    },
  }).tick()
  assert.equal(slack.posts.length, 2)
  assert.match(
    slack.posts[1].text,
    /Needs a decision: classification failed: claude down/,
  )
  assert.equal(store.hasPostedIssue(7), true)
  store.close()
})

test('a gh failure is logged, not thrown, and posts nothing', async () => {
  const slack = new FakeSlack()
  const r = await new Intake({
    cfg,
    store: new Store(':memory:'),
    fleet: fakeFleet(async () => {
      throw new Error('gh: not logged in')
    }),
    slack,
    log: silentLogger,
    classify: async () => ({ verdict: 'obvious', reason: '', explicit: true }),
  }).tick()
  assert.deepEqual(r, { posted: 0, seen: 0 })
  assert.equal(slack.posts.length, 0)
})
