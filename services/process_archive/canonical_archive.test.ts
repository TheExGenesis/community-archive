import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { ArchiveClickHouseBatch } from './archive_clickhouse'
import {
  buildCanonicalArchiveMutations,
  canonicalArchiveObservedAt,
  canonicalArchivePolicyVersion,
  ensureCanonicalArchivePendingReport,
  pendingCanonicalArchiveReportIds,
  publishCanonicalArchiveBatch,
} from './canonical_archive'
import { buildArchiveClickHouseBatch, createArchiveClickHouseManifest } from './archive_clickhouse'

const manifest = {
  archiveUploadId: '9',
  accountId: '6001',
  tweetIds: ['5001'],
}

function emptyBatch(): ArchiveClickHouseBatch {
  return {
    account_observations: [],
    tweet_content_versions: [],
    tweet_engagement_observations: [],
    tweet_analytics_versions: [],
    tweet_archive_provenance: [],
    tweet_mentions: [],
    tweet_relationships: [],
    tweet_media_versions: [],
    tweet_url_versions: [],
  }
}

function fixtureBatch(tombstone = false): ArchiveClickHouseBatch {
  const batch = emptyBatch()
  const observedAt = '2026-08-29T03:00:00.000Z'
  batch.account_observations.push({
    account_id: '6001',
    username: tombstone ? '' : 'alice',
    account_display_name: tombstone ? '' : 'Alice',
    is_tombstone: tombstone ? 1 : 0,
    source: 'archive_upload',
    event_id: 'account:6001',
    observed_at: observedAt,
  })
  batch.tweet_content_versions.push({
    tweet_id: '5001',
    account_id: '6001',
    full_text: tombstone ? '' : 'allowed content',
    is_tombstone: tombstone ? 1 : 0,
    source: 'archive_upload',
    event_id: 'tweet:5001',
    observed_at: observedAt,
  })
  if (!tombstone) {
    batch.tweet_engagement_observations.push({
      tweet_id: '5001',
      favorite_count: 2,
      retweet_count: 1,
      source: 'archive_upload',
      event_id: 'engagement:5001',
      observed_at: observedAt,
    })
  }
  batch.tweet_archive_provenance.push({
    tweet_id: '5001',
    archive_upload_id: '9',
    source: 'archive_upload',
    event_id: 'provenance:5001',
    observed_at: observedAt,
  })
  // The denormalized serving projection is deliberately not canonical input.
  batch.tweet_analytics_versions.push({
    tweet_id: '5001',
    account_id: '6001',
    full_text: 'projection copy',
    source: 'archive_upload',
    event_id: 'analytics:5001',
    observed_at: observedAt,
  })
  return batch
}

function withPublisherEnvironment(
  operation: () => Promise<void>,
): Promise<void> {
  const names = [
    'CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED',
    'CANONICAL_PUBLISH_URL',
    'CANONICAL_PUBLISHER_API_KEY',
    'CANONICAL_PUBLISH_BATCH_SIZE',
  ] as const
  const original = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  )
  process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED = 'true'
  process.env.CANONICAL_PUBLISH_URL =
    'http://127.0.0.1:3000/internal/canonical-ingest'
  process.env.CANONICAL_PUBLISHER_API_KEY = 'publisher-secret'
  process.env.CANONICAL_PUBLISH_BATCH_SIZE = '2'
  return operation().finally(() => {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name]
      else process.env[name] = original[name]
    }
  })
}

test('maps policy-safe sink rows and omits the serving projection', () => {
  const events = buildCanonicalArchiveMutations(
    fixtureBatch(),
  )
  const byType = new Map(events.map((event) => [event.entity_type, event]))

  assert.equal(byType.get('tweet_engagement')?.payload.account_id, '6001')
  assert.equal(byType.get('relationship')?.payload.account_id, '6001')
  assert.equal(
    events.some((event) => String(event.entity_type) === 'tweet_analytics'),
    false,
  )
  assert.equal(JSON.stringify(events).includes('projection copy'), false)
})

test('rebuilding an archive on retry preserves source versions and canonical identity input', () => {
  const sourceTime = '2026-08-30T12:00:00.000Z'
  const archive = { account: [{ account: { accountId: '6001', username: 'alice', accountDisplayName: 'Alice' } }],
    tweets: [{ tweet: { id_str: '5001', created_at: sourceTime, full_text: 'allowed content',
      favorite_count: 2, retweet_count: 1, entities: { urls: [], user_mentions: [], media: [] } } }] }
  const sourceManifest = createArchiveClickHouseManifest(archive, '9')
  const rebuild = (value: unknown) => buildCanonicalArchiveMutations(buildArchiveClickHouseBatch(
    archive, sourceManifest, new Map(), canonicalArchiveObservedAt(value),
  ))
  assert.deepEqual(rebuild(sourceTime), rebuild(new Date(sourceTime)))
  assert(rebuild(sourceTime).every((mutation) => mutation.version === String(Date.parse(sourceTime))))
  assert.throws(() => canonicalArchiveObservedAt(undefined), /source_time_missing/)
  assert.throws(() => canonicalArchiveObservedAt('invalid'), /source_time_invalid/)
})

test('converts content-free policy rows to canonical tombstones', () => {
  const events = buildCanonicalArchiveMutations(
    fixtureBatch(true),
  )
  const account = events.find((event) => event.entity_type === 'account')
  const tweet = events.find((event) => event.entity_type === 'tweet_content')
  const provenance = events.find(
    (event) => event.payload.archive_upload_id === '9',
  )

  assert.equal(account?.operation, 'tombstone')
  assert.equal(account?.payload.is_tombstone, true)
  assert.equal(tweet?.operation, 'tombstone')
  assert.equal(tweet?.payload.full_text, undefined)
  assert.equal(provenance, undefined)
})

test('policy version changes only when a relevant decision changes', () => {
  const allowed = new Map([
    ['candidate', { accountId: '7001', blocked: false }],
  ])
  const blocked = new Map([['candidate', { accountId: '7001', blocked: true }]])
  assert.notEqual(
    canonicalArchivePolicyVersion(manifest, false, allowed),
    canonicalArchivePolicyVersion(manifest, false, blocked),
  )
})

test('publisher resubmits thin batches for server dedupe on retry', async () => {
  await withPublisherEnvironment(async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'canonical-archive-'),
    )
    const calls: string[][] = []
    const fetchImpl = (async (_input, init) => {
      const body = JSON.parse(String(init?.body))
      calls.push(
        body.batches.map((event: { source_batch_id: string }) => event.source_batch_id),
      )
      return new Response(
        JSON.stringify({
          accepted: body.batches.map(
            (event: { source_batch_id: string }, index: number) => ({
              source_batch_id: event.source_batch_id,
              event_id: 'a'.repeat(64),
              message_id: `1-${index}`,
              duplicate: false,
            }),
          ),
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await publishCanonicalArchiveBatch({
          batch: fixtureBatch(),
          manifest,
          policyVersion: 'policy-1',
          reportDir: directory,
          fetchImpl,
        })
      }
      const reportText = fs.readFileSync(
        path.join(directory, 'canonical_archive_9.json'),
        'utf8',
      )
      const report = JSON.parse(reportText)
      assert.equal(report.status, 'complete')
      assert.equal(calls.length, 4)
      assert.equal(calls.flat().length, 4)
      assert.equal(reportText.includes('publisher-secret'), false)
      assert.equal(reportText.includes('allowed content'), false)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})

test('publisher is inert without its explicit flag', async () => {
  const original = process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED
  const originalQueueFirst = process.env.CANONICAL_ARCHIVE_QUEUE_FIRST_ENABLED
  delete process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED
  delete process.env.CANONICAL_ARCHIVE_QUEUE_FIRST_ENABLED
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-archive-'))
  try {
    const result = await publishCanonicalArchiveBatch({
      batch: fixtureBatch(),
      manifest,
      policyVersion: 'policy-1',
      reportDir: directory,
    })
    assert.deepEqual(result, { status: 'disabled' })
    assert.deepEqual(fs.readdirSync(directory), [])
  } finally {
    if (original === undefined) {
      delete process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED
    } else {
      process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED = original
    }
    if (originalQueueFirst === undefined) {
      delete process.env.CANONICAL_ARCHIVE_QUEUE_FIRST_ENABLED
    } else {
      process.env.CANONICAL_ARCHIVE_QUEUE_FIRST_ENABLED = originalQueueFirst
    }
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('queue-first flag enables the canonical publisher without shadow mode', async () => {
  const originalShadow = process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED
  const originalQueueFirst = process.env.CANONICAL_ARCHIVE_QUEUE_FIRST_ENABLED
  const originalUrl = process.env.CANONICAL_PUBLISH_URL
  const originalKey = process.env.CANONICAL_PUBLISHER_API_KEY
  delete process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED
  process.env.CANONICAL_ARCHIVE_QUEUE_FIRST_ENABLED = 'true'
  process.env.CANONICAL_PUBLISH_URL = 'http://127.0.0.1:3000/internal/canonical-ingest'
  process.env.CANONICAL_PUBLISHER_API_KEY = 'publisher-secret'
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-archive-'))
  try {
    const result = await publishCanonicalArchiveBatch({
      batch: fixtureBatch(),
      manifest,
      policyVersion: 'policy-1',
      reportDir: directory,
      fetchImpl: (async (_input, init) => {
        const body = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({ accepted: body.batches.map(
          (submission: { source_batch_id: string }) => ({
            source_batch_id: submission.source_batch_id,
            event_id: 'a'.repeat(64), message_id: '1-0', duplicate: false,
          }),
        ) }), { status: 202, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch,
    })
    assert.equal(result.status, 'complete')
  } finally {
    if (originalShadow === undefined) delete process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED
    else process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED = originalShadow
    if (originalQueueFirst === undefined) delete process.env.CANONICAL_ARCHIVE_QUEUE_FIRST_ENABLED
    else process.env.CANONICAL_ARCHIVE_QUEUE_FIRST_ENABLED = originalQueueFirst
    if (originalUrl === undefined) delete process.env.CANONICAL_PUBLISH_URL
    else process.env.CANONICAL_PUBLISH_URL = originalUrl
    if (originalKey === undefined) delete process.env.CANONICAL_PUBLISHER_API_KEY
    else process.env.CANONICAL_PUBLISHER_API_KEY = originalKey
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('publisher records a safe retry state on HTTP failure', async () => {
  await withPublisherEnvironment(async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-archive-'))
    try {
      await assert.rejects(
        publishCanonicalArchiveBatch({
          batch: fixtureBatch(),
          manifest,
          policyVersion: 'policy-1',
          reportDir: directory,
          fetchImpl: (async () => new Response('private response body', {
            status: 503,
          })) as typeof fetch,
        }),
        /canonical_http_503/,
      )
      const reportText = fs.readFileSync(
        path.join(directory, 'canonical_archive_9.json'),
        'utf8',
      )
      const report = JSON.parse(reportText)
      assert.equal(report.status, 'failed')
      assert.equal(report.last_error_code, 'canonical_http_503')
      assert.equal(reportText.includes('private response body'), false)
      assert.deepEqual(pendingCanonicalArchiveReportIds(directory), ['9'])
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})

test('pending markers are content-free and discoverable after a failed attempt', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-archive-'))
  try {
    ensureCanonicalArchivePendingReport('9', directory)
    const report = fs.readFileSync(
      path.join(directory, 'canonical_archive_9.json'),
      'utf8',
    )
    assert.deepEqual(pendingCanonicalArchiveReportIds(directory), ['9'])
    assert.equal(report.includes('allowed content'), false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
