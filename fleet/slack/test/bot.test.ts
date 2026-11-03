import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Bot } from '../src/bot.js'
import { HELP_TEXT, parseCommand, type Commands } from '../src/commands.js'
import { parseAllowedUserIds, type Config } from '../src/config.js'
import type { FleetTask } from '../src/fleetTask.js'
import { silentLogger } from '../src/log.js'
import type { TaskRunner, TaskRequest } from '../src/runner.js'
import { Store, type ThreadRecord } from '../src/store.js'
import { FakeSlack } from './helpers.js'

test('parseCommand', () => {
  assert.deepEqual(parseCommand('<@U0BOT> help'), { kind: 'help' })
  assert.deepEqual(parseCommand('status'), { kind: 'status' })
  assert.deepEqual(parseCommand('<@U0BOT>  runs '), { kind: 'runs' })
  assert.deepEqual(parseCommand('run 20261102T120000Z-slack'), {
    kind: 'run',
    id: '20261102T120000Z-slack',
  })
  assert.deepEqual(parseCommand('run'), { kind: 'runs' })
  assert.equal(parseCommand('<@U0BOT> run the tests and fix what breaks'), null)
  assert.equal(parseCommand('the status page is broken'), null)
  assert.equal(parseAllowedUserIds(' U1, U2 U3 ').size, 3)
})

interface Calls {
  started: TaskRequest[]
  replied: { thread: ThreadRecord; text: string; user: string }[]
  merged: string[]
  notNow: string[]
}

function makeBot(opts: { busy?: boolean } = {}) {
  const store = new Store(':memory:')
  const slack = new FakeSlack()
  const calls: Calls = { started: [], replied: [], merged: [], notNow: [] }
  const runner = {
    start: async (req: TaskRequest) => {
      calls.started.push(req)
      store.createThread({
        channel: req.channel,
        threadTs: req.threadTs,
        kind: 'task',
        title: req.text || 'issue',
        requestedBy: req.userId,
        state: 'working',
        issueNumber: req.issue?.number,
      })
    },
    reply: async (thread: ThreadRecord, text: string, user: string) =>
      void calls.replied.push({ thread, text, user }),
    merge: async (_t: ThreadRecord, user: string) =>
      void calls.merged.push(user),
    notNow: async (_t: ThreadRecord, user: string) =>
      void calls.notNow.push(user),
    isBusy: () => Boolean(opts.busy),
    activeCount: () => 0,
  } as unknown as TaskRunner
  const commands = {
    execute: async (cmd: { kind: string }) =>
      cmd.kind === 'help' ? HELP_TEXT : `ran ${cmd.kind}`,
  } as unknown as Commands
  const fleet = {
    issuesList: async () => [
      {
        number: 7,
        title: 'bug: answer is off by one',
        body: 'body',
        labels: [{ name: 'bug' }],
        createdAt: '',
      },
    ],
  } as unknown as FleetTask
  const cfg = {
    allowedUserIds: new Set(['U_OK']),
    repo: 'o/r',
  } as unknown as Config
  const bot = new Bot({
    cfg,
    store,
    runner,
    commands,
    slack,
    fleet,
    log: silentLogger,
    botUserId: 'U0BOT',
  })
  return { bot, store, slack, calls }
}

test('mentions: commands answer in a thread, anything else starts a task', async () => {
  const { bot, slack, calls } = makeBot()
  await bot.onMention({
    channel: 'C1',
    ts: '1.0',
    user: 'U_OK',
    text: '<@U0BOT> help',
  })
  assert.equal(slack.texts('C1', '1.0')[0], HELP_TEXT)
  assert.equal(calls.started.length, 0)
  await bot.onMention({
    channel: 'C1',
    ts: '2.0',
    user: 'U_OK',
    text: '<@U0BOT> fix the 500 on /search',
  })
  assert.equal(calls.started.length, 1)
  assert.deepEqual(
    [calls.started[0].threadTs, calls.started[0].text, calls.started[0].source],
    ['2.0', 'fix the 500 on /search', 'mention'],
  )
  assert.deepEqual(
    slack.reactions.map((r) => r.name),
    ['eyes', 'eyes'],
  )
})

test('users outside the allowlist are ignored everywhere', async () => {
  const { bot, slack, calls } = makeBot()
  await bot.onMention({
    channel: 'C1',
    ts: '1.0',
    user: 'U_NO',
    text: '<@U0BOT> delete everything',
  })
  await bot.onMessage({
    channel: 'D1',
    ts: '1.1',
    user: 'U_NO',
    text: 'hi',
    channelType: 'im',
  })
  assert.equal(calls.started.length, 0)
  assert.equal(slack.posts.length, 0)
  await bot.onAction({
    actionId: 'merge_pr',
    value: '{}',
    user: 'U_NO',
    channel: 'C1',
    messageTs: '3.0',
  })
  assert.equal(calls.merged.length, 0)
  assert.match(slack.posts[0].text, /only the maintainers/)
})

test('bot messages and mention echoes are dropped; DMs start tasks', async () => {
  const { bot, calls } = makeBot()
  await bot.onMessage({
    channel: 'C1',
    ts: '1.0',
    user: 'U_OK',
    text: '<@U0BOT> do it',
    channelType: 'channel',
  })
  await bot.onMessage({
    channel: 'C1',
    ts: '1.1',
    user: 'U_OK',
    text: 'edited',
    subtype: 'message_changed',
  })
  await bot.onMessage({
    channel: 'C1',
    ts: '1.2',
    botId: 'B1',
    text: 'from a bot',
  })
  assert.equal(calls.started.length, 0)
  await bot.onMessage({
    channel: 'D1',
    ts: '5.0',
    user: 'U_OK',
    text: 'rename the thing',
    channelType: 'im',
  })
  assert.equal(calls.started.length, 1)
  assert.equal(calls.started[0].source, 'dm')
})

test('a reply in a task thread resumes it; stop is forwarded; finished threads refuse', async () => {
  const { bot, store, slack, calls } = makeBot()
  await bot.onMention({
    channel: 'C1',
    ts: '2.0',
    user: 'U_OK',
    text: '<@U0BOT> fix it',
  })
  await bot.onMessage({
    channel: 'C1',
    ts: '2.1',
    threadTs: '2.0',
    user: 'U_OK',
    text: 'use the second route',
  })
  assert.equal(calls.replied.length, 1)
  assert.equal(calls.replied[0].text, 'use the second route')
  await bot.onMessage({
    channel: 'C1',
    ts: '2.2',
    threadTs: '2.0',
    user: 'U_OK',
    text: 'stop',
  })
  assert.match(calls.replied[1].text, /^Stop:/)
  // A mention inside the thread is a reply too, not a new task.
  await bot.onMention({
    channel: 'C1',
    ts: '2.3',
    threadTs: '2.0',
    user: 'U_OK',
    text: '<@U0BOT> and add a test',
  })
  assert.equal(calls.replied[2].text, 'and add a test')
  assert.equal(calls.started.length, 1)
  store.updateThread('C1', '2.0', { state: 'merged' })
  await bot.onMessage({
    channel: 'C1',
    ts: '2.4',
    threadTs: '2.0',
    user: 'U_OK',
    text: 'more',
  })
  assert.equal(calls.replied.length, 3)
  assert.match(slack.texts('C1', '2.0').pop() || '', /This task is merged/)
})

test('a busy thread asks to wait', async () => {
  const { bot, slack, calls } = makeBot({ busy: true })
  await bot.onMention({
    channel: 'C1',
    ts: '2.0',
    user: 'U_OK',
    text: '<@U0BOT> fix it',
  })
  await bot.onMessage({
    channel: 'C1',
    ts: '2.1',
    threadTs: '2.0',
    user: 'U_OK',
    text: 'also this',
  })
  assert.equal(calls.replied.length, 0)
  assert.match(slack.texts('C1', '2.0').pop() || '', /still working/)
})

test('buttons: go ahead starts the issue task in the intake thread; merge and not now route to the runner', async () => {
  const { bot, store, slack, calls } = makeBot()
  store.recordPostedIssue(7, 'CSIG', '9.0')
  await bot.onAction({
    actionId: 'go_ahead',
    value: JSON.stringify({ issue: 7, channel: 'CSIG', threadTs: '9.0' }),
    user: 'U_OK',
    channel: 'CSIG',
    messageTs: '9.1',
    threadTs: '9.0',
  })
  assert.equal(calls.started.length, 1)
  assert.equal(calls.started[0].issue?.number, 7)
  assert.equal(calls.started[0].issue?.title, 'bug: answer is off by one')
  assert.equal(calls.started[0].source, 'intake')
  // Clicking again does not start a second task.
  await bot.onAction({
    actionId: 'go_ahead',
    value: JSON.stringify({ issue: 7, channel: 'CSIG', threadTs: '9.0' }),
    user: 'U_OK',
    channel: 'CSIG',
    messageTs: '9.1',
    threadTs: '9.0',
  })
  assert.equal(calls.started.length, 1)
  assert.match(slack.texts('CSIG', '9.0').pop() || '', /Already on it/)
  await bot.onAction({
    actionId: 'merge_pr',
    value: JSON.stringify({ channel: 'CSIG', threadTs: '9.0', pr: 5 }),
    user: 'U_OK',
    channel: 'CSIG',
    messageTs: '9.2',
  })
  await bot.onAction({
    actionId: 'not_now',
    value: JSON.stringify({ channel: 'CSIG', threadTs: '9.0', pr: 5 }),
    user: 'U_OK',
    channel: 'CSIG',
    messageTs: '9.2',
  })
  assert.deepEqual([calls.merged, calls.notNow], [['U_OK'], ['U_OK']])
  await bot.onAction({
    actionId: 'merge_pr',
    value: JSON.stringify({ channel: 'CX', threadTs: '0.0' }),
    user: 'U_OK',
    channel: 'CX',
    messageTs: '1',
  })
  assert.match(
    slack.texts('CX', '0.0').pop() || '',
    /no longer know this thread/,
  )
})

test('a reply under an intake post (no task yet) starts the fix with the reply as instructions', async () => {
  const { bot, store, calls } = makeBot()
  store.recordPostedIssue(7, 'CSIG', '9.0')
  await bot.onMessage({
    channel: 'CSIG',
    ts: '9.5',
    threadTs: '9.0',
    user: 'U_OK',
    text: 'go ahead but keep the old constant exported',
  })
  assert.equal(calls.started.length, 1)
  assert.equal(calls.started[0].issue?.number, 7)
  assert.equal(
    calls.started[0].text,
    'go ahead but keep the old constant exported',
  )
})
