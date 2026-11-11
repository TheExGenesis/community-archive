import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PrFacts } from '../src/fleetTask.js'
import { checksState, evaluateMerge } from '../src/merge.js'

const green: PrFacts = {
  number: 101,
  url: 'https://github.com/o/r/pull/101',
  title: 't',
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  headRefName: 'fleet/slack-20261102T120000Z',
  baseRefName: 'main',
  statusCheckRollup: [
    {
      __typename: 'CheckRun',
      name: 'pull_request_workflow',
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
    },
    { __typename: 'StatusContext', context: 'Vercel', state: 'SUCCESS' },
  ],
  files: [{ path: 'src/app/api/x/route.ts' }],
}
const allowed = new Set(['U_CHRISTINE', 'U_XIQ'])
const base = {
  allowedUserIds: allowed,
  tier1Violations: [] as string[],
  baseBranch: 'main',
}

test('a green Tier 0 fleet PR merges for an allowed user', () => {
  const d = evaluateMerge({ ...base, userId: 'U_XIQ', pr: green })
  assert.deepEqual(d, { ok: true, reasons: [], pending: false })
})

test('users outside the allowlist cannot merge', () => {
  const d = evaluateMerge({ ...base, userId: 'U_STRANGER', pr: green })
  assert.equal(d.ok, false)
  assert.match(d.reasons.join(), /allowed maintainers/)
})

test('Tier 1 paths block the button', () => {
  const d = evaluateMerge({
    ...base,
    userId: 'U_CHRISTINE',
    pr: green,
    tier1Violations: ['Tier 1 path changed: supabase/migrations/1.sql'],
  })
  assert.equal(d.ok, false)
  assert.match(
    d.reasons.join(),
    /Tier 1.*supabase\/migrations\/1\.sql.*human merges/,
  )
})

test('PR state: closed, draft, conflicting, wrong branch or base', () => {
  assert.match(
    evaluateMerge({
      ...base,
      userId: 'U_XIQ',
      pr: { ...green, state: 'MERGED' },
    }).reasons.join(),
    /MERGED/,
  )
  assert.match(
    evaluateMerge({
      ...base,
      userId: 'U_XIQ',
      pr: { ...green, isDraft: true },
    }).reasons.join(),
    /draft/,
  )
  assert.match(
    evaluateMerge({
      ...base,
      userId: 'U_XIQ',
      pr: { ...green, mergeable: 'CONFLICTING' },
    }).reasons.join(),
    /CONFLICTING/,
  )
  assert.match(
    evaluateMerge({
      ...base,
      userId: 'U_XIQ',
      pr: { ...green, headRefName: 'feature/x' },
    }).reasons.join(),
    /not a fleet branch/,
  )
  assert.match(
    evaluateMerge({
      ...base,
      userId: 'U_XIQ',
      pr: { ...green, baseRefName: 'staging' },
    }).reasons.join(),
    /targets staging/,
  )
})

test('CI pending is a retry-later, CI red is a no', () => {
  const pending = evaluateMerge({
    ...base,
    userId: 'U_XIQ',
    pr: {
      ...green,
      statusCheckRollup: [
        { __typename: 'CheckRun', name: 'ci', status: 'IN_PROGRESS' },
      ],
    },
  })
  assert.equal(pending.ok, false)
  assert.equal(pending.pending, true)
  const red = evaluateMerge({
    ...base,
    userId: 'U_XIQ',
    pr: {
      ...green,
      statusCheckRollup: [
        {
          __typename: 'CheckRun',
          name: 'ci',
          status: 'COMPLETED',
          conclusion: 'FAILURE',
        },
      ],
    },
  })
  assert.equal(red.ok, false)
  assert.equal(red.pending, false)
  assert.match(red.reasons.join(), /CI is red/)
  const none = evaluateMerge({
    ...base,
    userId: 'U_XIQ',
    pr: { ...green, statusCheckRollup: [] },
  })
  assert.equal(none.ok, false)
  assert.equal(none.pending, true)
  const unknown = evaluateMerge({
    ...base,
    userId: 'U_XIQ',
    pr: { ...green, mergeable: 'UNKNOWN' },
  })
  assert.equal(unknown.pending, true)
})

test('checksState', () => {
  assert.equal(checksState(green), 'green')
  assert.equal(
    checksState({
      ...green,
      statusCheckRollup: [
        { __typename: 'StatusContext', context: 'v', state: 'PENDING' },
      ],
    }),
    'pending',
  )
  assert.equal(
    checksState({
      ...green,
      statusCheckRollup: [
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SKIPPED' },
      ],
    }),
    'green',
  )
})
