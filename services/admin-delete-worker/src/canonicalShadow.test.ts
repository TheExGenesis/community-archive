import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import {
  buildCanonicalAdminDeleteMutations,
  canonicalAdminDeleteErrorCode,
  publishCanonicalAdminDeleteShadow,
} from './canonicalShadow.ts'

const managedEnvironment = [
  'CANONICAL_ADMIN_DELETE_SHADOW_PUBLISH_ENABLED',
  'CANONICAL_PUBLISH_URL',
  'CANONICAL_PUBLISHER_API_KEY',
  'CANONICAL_PUBLISH_BATCH_SIZE',
  'CANONICAL_PUBLISH_TIMEOUT_SECONDS',
] as const

const originalEnvironment = Object.fromEntries(
  managedEnvironment.map((name) => [name, process.env[name]]),
)

const input = {
  jobKey: 'admin-job-17',
  accountId: '6001',
  tweetIds: ['5002', '5001', '5001'],
  observedAt: '2026-08-29T03:00:00.000Z',
}

beforeEach(() => {
  for (const name of managedEnvironment) delete process.env[name]
})

afterEach(() => {
  for (const name of managedEnvironment) {
    const value = originalEnvironment[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

test('builds deterministic content-free account and tweet tombstones', () => {
  const first = buildCanonicalAdminDeleteMutations(
    input,
  )
  const retried = buildCanonicalAdminDeleteMutations(
    input,
  )

  assert.equal(first.length, 3)
  assert.deepEqual(
    first.map(({ entity_type, entity_key }) => [entity_type, entity_key]),
    [
      ['account', '6001'],
      ['tweet_content', '5001'],
      ['tweet_content', '5002'],
    ],
  )
  assert.deepEqual(
    first,
    retried,
  )
  assert.ok(first.every((mutation) => !('event_id' in mutation) && !('policy_version' in mutation)))
  assert.ok(first.every(({ operation }) => operation === 'tombstone'))
  assert.doesNotMatch(JSON.stringify(first), /username|reason|requester/)
  assert.deepEqual(first[1].payload, {
    tweet_id: '5001',
    account_id: '6001',
    is_tombstone: true,
  })
})

test('is inert while disabled and does not require publisher configuration', async () => {
  let called = false
  const result = await publishCanonicalAdminDeleteShadow(input, async () => {
    called = true
    return new Response(null, { status: 500 })
  })

  assert.deepEqual(result, {
    eventCount: 0,
    duplicateCount: 0,
    skipped: true,
  })
  assert.equal(called, false)
})

test('publishes bounded batches with a dedicated credential', async () => {
  process.env.CANONICAL_ADMIN_DELETE_SHADOW_PUBLISH_ENABLED = 'true'
  process.env.CANONICAL_PUBLISH_URL =
    'http://127.0.0.1:3000/internal/canonical-ingest'
  process.env.CANONICAL_PUBLISHER_API_KEY = 'publisher-secret'
  process.env.CANONICAL_PUBLISH_BATCH_SIZE = '2'
  const batches: unknown[][] = []

  const result = await publishCanonicalAdminDeleteShadow(input, async (
    _url,
    init,
  ) => {
    assert.equal(
      (init?.headers as Record<string, string>)['X-API-Key'],
      'publisher-secret',
    )
    const body = JSON.parse(String(init?.body)) as { batches: unknown[] }
    batches.push(body.batches)
    return Response.json(
      {
        accepted: body.batches.map((event, index) => ({
          source_batch_id: (event as { source_batch_id: string }).source_batch_id,
          event_id: 'a'.repeat(64),
          message_id: `1-${index}`,
          duplicate: index === 0,
        })),
      },
      { status: 202 },
    )
  })

  assert.equal(batches.length, 2)
  assert.deepEqual(result, {
    eventCount: 3,
    duplicateCount: 2,
    skipped: false,
  })
})

test('rejects insecure remote publication and exposes only a bounded code', async () => {
  process.env.CANONICAL_ADMIN_DELETE_SHADOW_PUBLISH_ENABLED = 'true'
  process.env.CANONICAL_PUBLISH_URL =
    'http://firehose.example/internal/canonical-ingest'
  process.env.CANONICAL_PUBLISHER_API_KEY = 'publisher-secret'

  await assert.rejects(
    publishCanonicalAdminDeleteShadow(input),
    /canonical_https_required/,
  )
  try {
    await publishCanonicalAdminDeleteShadow(input)
  } catch (error) {
    assert.equal(canonicalAdminDeleteErrorCode(error), 'canonical_https_required')
    assert.doesNotMatch(canonicalAdminDeleteErrorCode(error), /publisher-secret/)
  }
})
