import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { Store } from '../src/store.js'
import { tmpDir } from './helpers.js'

test('threads: create, update, lookup by PR, persistence across reopen', () => {
  const file = path.join(tmpDir(), 'slack.db')
  const s = new Store(file)
  const t = s.createThread({
    channel: 'C1',
    threadTs: '1.1',
    kind: 'task',
    title: 'Fix x',
    requestedBy: 'U1',
  })
  assert.equal(t.state, 'new')
  assert.equal(t.sessionId, undefined)
  s.updateThread('C1', '1.1', {
    sessionId: 'sess-1',
    state: 'waiting',
    prNumber: 42,
    prUrl: 'https://x/pull/42',
  })
  const again = s.getThread('C1', '1.1')
  assert.equal(again?.sessionId, 'sess-1')
  assert.equal(again?.state, 'waiting')
  assert.equal(s.getThreadByPr(42)?.threadTs, '1.1')
  assert.equal(s.getThread('C1', '9.9'), undefined)
  s.updateThread('C1', '1.1', { worktree: undefined })
  assert.equal(s.getThread('C1', '1.1')?.worktree, undefined)
  s.close()

  const reopened = new Store(file)
  assert.equal(reopened.getThread('C1', '1.1')?.sessionId, 'sess-1')
  assert.deepEqual(
    reopened.listThreads(['waiting']).map((x) => x.threadTs),
    ['1.1'],
  )
  assert.deepEqual(reopened.listThreads(['working']), [])
  reopened.close()
})

test('createThread on an existing thread keeps the issue number', () => {
  const s = new Store(':memory:')
  s.createThread({
    channel: 'C1',
    threadTs: '2.2',
    kind: 'task',
    title: 'a',
    requestedBy: 'U1',
    issueNumber: 7,
  })
  s.createThread({
    channel: 'C1',
    threadTs: '2.2',
    kind: 'task',
    title: 'b',
    requestedBy: 'U2',
  })
  const t = s.getThread('C1', '2.2')
  assert.equal(t?.issueNumber, 7)
  assert.equal(t?.title, 'b')
  s.close()
})

test('posted issues dedupe and thread lookup', () => {
  const s = new Store(':memory:')
  assert.equal(s.hasPostedIssue(10), false)
  s.recordPostedIssue(10, 'C9', '5.5')
  s.recordPostedIssue(10, 'C9', '6.6')
  assert.equal(s.hasPostedIssue(10), true)
  assert.equal(s.getPostedIssue(10)?.threadTs, '5.5', 'first post wins')
  assert.equal(s.getPostedIssueByThread('C9', '5.5')?.issueNumber, 10)
  assert.equal(s.getPostedIssueByThread('C9', '7.7'), undefined)
  s.setIssueClassification(10, 'obvious')
  assert.equal(s.getPostedIssue(10)?.classification, 'obvious')
  assert.equal(s.countPostedIssues(), 1)
  s.setMeta('k', 'v')
  assert.equal(s.getMeta('k'), 'v')
  s.close()
})
